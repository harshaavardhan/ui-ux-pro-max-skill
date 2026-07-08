import Anthropic from "@anthropic-ai/sdk";
import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact, hasRole } from "@/lib/access.js";
import { getArtifactLabel, checkAiAllowed } from "@/lib/labels.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const MAX_PAGE_BYTES = 300 * 1024;

const SYSTEM = `You are ShareLock's page editor. You receive the HTML source of one page (a fragment of a larger deck) and an instruction describing how to change it.

Rules:
- Return the FULL modified page HTML, preserving the outer element (e.g. the <section> wrapper) and everything the instruction doesn't ask you to change.
- Keep the page self-contained: inline styles only, no external URLs (no external images, fonts, scripts, or stylesheets — the deck renders under a no-network Content-Security-Policy). Images must be data: URIs.
- Never include <script src>, fetch/XHR, or links to external resources.
- Match the existing visual style of the page unless asked to restyle.
- "summary" is one short sentence describing what you changed.`;

const OUTPUT_SCHEMA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      html: { type: "string", description: "the full modified page HTML" },
      summary: { type: "string", description: "one-sentence description of the change" },
    },
    required: ["html", "summary"],
    additionalProperties: false,
  },
};

export const POST = handler(async (req) => {
  const user = requireUser();
  const { artifactId, html, instruction, apiKey } = await req.json();

  const artifact = getArtifact(artifactId);
  if (!artifact) return fail("artifact not found", 404);
  if (!hasRole(userRoleForArtifact(user, artifact), "editor"))
    return fail("editor access required", 403);
  // Label policy: some sensitivity labels keep content from leaving
  // ShareLock, which rules out sending it to the AI provider.
  const label = getArtifactLabel(artifact);
  const aiPolicyError = checkAiAllowed(label);
  if (aiPolicyError) {
    audit(artifact.id, user.email, "ai_blocked_by_label", label.name);
    return fail(aiPolicyError, 403);
  }

  if (!instruction || !String(instruction).trim())
    return fail("instruction required");
  if (!html || Buffer.byteLength(html, "utf8") > MAX_PAGE_BYTES)
    return fail("page HTML missing or exceeds 300 KB AI-edit limit", 413);

  // Key resolution: the user's own key (never stored server-side) wins;
  // otherwise the platform key, metered by org AI credits.
  let key = String(apiKey || "").trim();
  let usingCredits = false;
  if (!key) {
    key = process.env.SHARELOCK_ANTHROPIC_KEY || "";
    usingCredits = Boolean(key);
    if (!key)
      return fail(
        "AI editing needs an Anthropic API key. Add your own key in the assistant panel (it stays in your browser), or ask your admin to configure platform credits.",
        402
      );
    const org = db
      .prepare("SELECT ai_credits FROM orgs WHERE id = ?")
      .get(user.org_id);
    if (!org || org.ai_credits <= 0)
      return fail(
        "Your organization is out of AI credits. Add your own Anthropic API key in the assistant panel to keep going.",
        402
      );
  }

  const client = new Anthropic({ apiKey: key });

  let result;
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: OUTPUT_SCHEMA },
      messages: [
        {
          role: "user",
          content: `Current page HTML:\n\n${html}\n\nInstruction: ${instruction}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return fail("the AI assistant declined this instruction", 422);
    }
    if (response.stop_reason === "max_tokens") {
      return fail("the edited page was too large for the AI to return — try a smaller page or a narrower instruction", 422);
    }
    const text = response.content.find((b) => b.type === "text")?.text || "";
    result = JSON.parse(text);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError)
      return fail("that Anthropic API key was rejected — check it and try again", 401);
    if (err instanceof Anthropic.RateLimitError)
      return fail("the AI provider is rate-limiting requests — wait a moment and retry", 429);
    if (err instanceof Anthropic.APIError)
      return fail(`AI request failed (${err.status}): ${err.message}`, 502);
    throw err;
  }

  if (!result?.html || !String(result.html).trim())
    return fail("the AI returned an empty page — nothing was applied", 422);

  let creditsRemaining = null;
  if (usingCredits) {
    db.prepare(
      "UPDATE orgs SET ai_credits = ai_credits - 1 WHERE id = ? AND ai_credits > 0"
    ).run(user.org_id);
    creditsRemaining = db
      .prepare("SELECT ai_credits FROM orgs WHERE id = ?")
      .get(user.org_id).ai_credits;
  }

  audit(
    artifact.id,
    user.email,
    "ai_edit",
    `${usingCredits ? "platform credits" : "own key"}: ${String(instruction).slice(0, 120)}`
  );

  return json({
    ok: true,
    html: result.html,
    summary: result.summary || "Edit applied.",
    creditsRemaining,
  });
});
