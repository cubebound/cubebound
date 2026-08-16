import { notFound } from "next/navigation";

import { loadUserByUsername, loadViewer } from "@/lib/cube-request";

/**
 * 404s an unknown username above the loading boundary.
 *
 * Same reason as the cube layout: `loading.tsx` lets Next flush the shell, and
 * flushing commits HTTP 200, after which the page's `notFound()` can change the
 * body but not the status. A soft 404 is a page crawlers index as real.
 *
 * Suspension is enforced here too, for the same reason — it has to change the
 * status, not just the body.
 */
export default async function ProfileLayout({
  children,
  params,
}: LayoutProps<"/u/[username]">) {
  const { username } = await params;
  const [user, viewer] = await Promise.all([loadUserByUsername(username), loadViewer()]);
  if (!user) notFound();
  // A suspended account disappears, including from itself — the point is that
  // it is switched off. Admins still see it, because unsuspending needs a page
  // to do it from.
  if (user.suspendedAt && !viewer?.profile?.isAdmin) notFound();
  return children;
}
