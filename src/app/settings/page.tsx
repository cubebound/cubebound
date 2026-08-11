import type { Metadata } from "next";

import ComingSoon from "@/components/coming-soon";

export const metadata: Metadata = { title: "Settings · cubebound.gg" };

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      description="Account settings — display name, email and preferences. Not built yet. Cube-specific settings live on each cube's own Settings page."
    />
  );
}
