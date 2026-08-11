import type { Metadata } from "next";

import ComingSoon from "@/components/coming-soon";

export const metadata: Metadata = { title: "Profile · cubebound.gg" };

export default function ProfilePage() {
  return (
    <ComingSoon
      title="Profile"
      description="Your public page — the cubes you've built and the drafts you've run. Not built yet."
    />
  );
}
