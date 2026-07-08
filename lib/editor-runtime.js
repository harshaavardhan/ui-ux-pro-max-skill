// Visual-editor runtime, injected into the sandboxed preview iframe.
//
// The iframe document is prefix + <current page> + suffix plus three tagged
// editor artifacts (CSP meta, style, script). The runtime lets the user
// hover/select/edit elements and reports a CLEANED serialization of the page
// back to the parent over postMessage — all editor artifacts and attributes
// are stripped before serializing, so saved HTML never contains editor code.
//
// Parent -> iframe commands: sd-style, sd-delete, sd-duplicate, sd-move,
//   sd-image, sd-deselect.
// Iframe -> parent events: sd-ready, sd-select, sd-deselect, sd-changed.

export const EDITOR_CSS = `
  [data-sd-hover] { outline: 2px dashed rgba(99,102,241,0.7) !important; outline-offset: -2px; cursor: default; }
  [data-sd-selected] { outline: 2px solid #6366f1 !important; outline-offset: -2px; }
  [data-sd-editing] { outline: 2px solid #059669 !important; cursor: text; }
`;

export const RUNTIME_JS = `
(function () {
  var selected = null;
  var debounceTimer = null;

  function isEditorNode(el) {
    return el && el.id && el.id.indexOf("sd-editor-") === 0;
  }

  function pageRoot() {
    // The current page is the first top-level <section> in body; whole body
    // for unstructured documents.
    var sections = [];
    for (var i = 0; i < document.body.children.length; i++) {
      var c = document.body.children[i];
      if (c.tagName === "SECTION") sections.push(c);
    }
    return sections.length ? sections[0] : document.body;
  }

  function serialize() {
    var root = pageRoot();
    var clone = root.cloneNode(true);
    var junk = clone.querySelectorAll("[data-sd-hover],[data-sd-selected],[data-sd-editing],[contenteditable]");
    for (var i = 0; i < junk.length; i++) {
      junk[i].removeAttribute("data-sd-hover");
      junk[i].removeAttribute("data-sd-selected");
      junk[i].removeAttribute("data-sd-editing");
      junk[i].removeAttribute("contenteditable");
    }
    clone.removeAttribute("data-sd-hover");
    clone.removeAttribute("data-sd-selected");
    clone.removeAttribute("data-sd-editing");
    clone.removeAttribute("contenteditable");
    var editorBits = clone.querySelectorAll('[id^="sd-editor-"]');
    for (var j = 0; j < editorBits.length; j++) editorBits[j].remove();
    if (root === document.body) {
      return { kind: "body", html: clone.innerHTML };
    }
    return { kind: "section", html: clone.outerHTML };
  }

  function notifyChanged() {
    parent.postMessage({ type: "sd-changed", page: serialize() }, "*");
  }

  function describe(el) {
    var cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      isImage: el.tagName === "IMG",
      isText: /^(H1|H2|H3|H4|H5|H6|P|SPAN|A|LI|BUTTON|BLOCKQUOTE|FIGCAPTION|LABEL|TD|TH|DIV|STRONG|EM)$/.test(el.tagName),
      styles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: parseFloat(cs.fontSize) || 16,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        textAlign: cs.textAlign,
        borderRadius: parseFloat(cs.borderRadius) || 0,
        padding: parseFloat(cs.paddingTop) || 0,
      },
    };
  }

  function select(el) {
    if (selected) selected.removeAttribute("data-sd-selected");
    selected = el;
    if (el) {
      el.setAttribute("data-sd-selected", "1");
      parent.postMessage({ type: "sd-select", info: describe(el) }, "*");
    } else {
      parent.postMessage({ type: "sd-deselect" }, "*");
    }
  }

  function stopEditing() {
    var editing = document.querySelectorAll("[data-sd-editing]");
    for (var i = 0; i < editing.length; i++) {
      editing[i].removeAttribute("data-sd-editing");
      editing[i].removeAttribute("contenteditable");
    }
  }

  document.addEventListener("mouseover", function (e) {
    var el = e.target;
    if (isEditorNode(el) || el === document.body || el === document.documentElement) return;
    if (el.getAttribute("contenteditable")) return;
    el.setAttribute("data-sd-hover", "1");
  }, true);

  document.addEventListener("mouseout", function (e) {
    if (e.target.removeAttribute) e.target.removeAttribute("data-sd-hover");
  }, true);

  document.addEventListener("click", function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute("contenteditable")) return; // typing
    e.preventDefault();
    e.stopPropagation();
    stopEditing();
    if (el === document.body || el === document.documentElement || isEditorNode(el)) {
      select(null);
      return;
    }
    select(el);
  }, true);

  document.addEventListener("dblclick", function (e) {
    var el = e.target;
    if (isEditorNode(el) || el === document.body) return;
    e.preventDefault();
    e.stopPropagation();
    select(el);
    el.setAttribute("contenteditable", "true");
    el.setAttribute("data-sd-editing", "1");
    el.focus();
  }, true);

  document.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(notifyChanged, 500);
  }, true);

  document.addEventListener("blur", function (e) {
    if (e.target.getAttribute && e.target.getAttribute("contenteditable")) {
      e.target.removeAttribute("contenteditable");
      e.target.removeAttribute("data-sd-editing");
      notifyChanged();
    }
  }, true);

  window.addEventListener("message", function (e) {
    var msg = e.data || {};
    if (msg.type === "sd-style" && selected) {
      selected.style[msg.prop] = msg.value;
      parent.postMessage({ type: "sd-select", info: describe(selected) }, "*");
      notifyChanged();
    } else if (msg.type === "sd-delete" && selected) {
      var dead = selected;
      select(null);
      dead.remove();
      notifyChanged();
    } else if (msg.type === "sd-duplicate" && selected) {
      var copy = selected.cloneNode(true);
      copy.removeAttribute("data-sd-selected");
      selected.parentNode.insertBefore(copy, selected.nextSibling);
      notifyChanged();
    } else if (msg.type === "sd-move" && selected) {
      var node = selected;
      if (msg.dir === -1 && node.previousElementSibling) {
        node.parentNode.insertBefore(node, node.previousElementSibling);
        notifyChanged();
      } else if (msg.dir === 1 && node.nextElementSibling) {
        node.parentNode.insertBefore(node.nextElementSibling, node);
        notifyChanged();
      }
    } else if (msg.type === "sd-image" && selected && selected.tagName === "IMG") {
      selected.src = msg.dataUri;
      notifyChanged();
    } else if (msg.type === "sd-deselect") {
      stopEditing();
      select(null);
    }
  });

  parent.postMessage({ type: "sd-ready" }, "*");
})();
`;

const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:";

// Wraps a full document in editor scaffolding. All injected nodes carry
// sd-editor-* ids so the runtime can strip them on serialization.
export function buildEditableDoc(html, { editable = true } = {}) {
  const head =
    `<meta id="sd-editor-csp" http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">` +
    (editable ? `<style id="sd-editor-style">${EDITOR_CSS}</style>` : "");
  const tail = editable ? `<script id="sd-editor-runtime">${RUNTIME_JS}<\/script>` : "";

  let out = html;
  const headMatch = out.match(/<head\b[^>]*>/i);
  if (headMatch) {
    const i = out.indexOf(headMatch[0]) + headMatch[0].length;
    out = out.slice(0, i) + head + out.slice(i);
  } else {
    out = head + out;
  }
  const bodyClose = out.toLowerCase().lastIndexOf("</body>");
  if (bodyClose >= 0) {
    out = out.slice(0, bodyClose) + tail + out.slice(bodyClose);
  } else {
    out = out + tail;
  }
  return out;
}
