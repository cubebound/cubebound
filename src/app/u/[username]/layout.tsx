import { notFound } from "next/navigation";

import { loadUserByUsername } from "@/lib/cube-request";

/**
 * 404s an unknown username above the loading boundary.
 *
 * Same reason as the cube layout: `loading.tsx` lets Next flush the shell, and
 * flushing commits HTTP 200, after which the page's `notFound()` can change the
 * body but not the status. A soft 404 is a page crawlers index as real.
 */
export default async function ProfileLayout({
  children,
  params,
}: LayoutProps<"/u/[username]">) {
  const { username } = await params;
  if (!(await loadUserByUsername(username))) notFound();
  return children;
}
