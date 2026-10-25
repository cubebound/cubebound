import { redirect } from "next/navigation";

import { loadViewer } from "@/lib/cube-request";

/**
 * "Profile" in the account menu means *your* profile, but a profile is a public
 * page with a shareable URL — so this is a redirect to `/u/{username}` rather
 * than a second copy of it. One page, one address, and the menu item keeps
 * working without knowing your username.
 */
export default async function MyProfilePage() {
  const current = await loadViewer();
  if (!current) redirect("/login");
  if (!current.profile) redirect("/welcome");
  redirect(`/u/${current.profile.username}`);
}
