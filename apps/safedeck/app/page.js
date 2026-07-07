import { currentUser } from "@/lib/auth.js";
import { QuickShare } from "./quick-share.js";

export const dynamic = "force-dynamic";

export default function Home() {
  const user = currentUser();
  return <QuickShare loggedIn={Boolean(user)} />;
}
