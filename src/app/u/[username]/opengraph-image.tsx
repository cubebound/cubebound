import { ImageResponse } from "next/og";

import { countCubes } from "@/db/queries/discovery";
import { getUserByUsername } from "@/db/queries/users";
import { clamp, OG, OG_CONTENT_TYPE, OG_HEADERS, OG_SIZE, OgBrand } from "@/lib/og";

export const alt = "A cube builder on cubebound.gg";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** A profile's share preview: who, and how many public cubes. */
export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await getUserByUsername(username);
  const count = user ? await countCubes({ ownerId: user.id }) : 0;
  const name = user?.username ?? username;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
          background: OG.background,
          backgroundImage: `radial-gradient(circle at 22% 55%, rgba(255,106,43,0.16), rgba(9,9,11,0) 55%)`,
        }}
      >
        <OgBrand />

        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          {/* The same initial the nav avatar and the profile page use. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 168,
              height: 168,
              borderRadius: 9999,
              background: OG.text,
              color: OG.background,
              fontSize: 82,
              fontWeight: 600,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: name.length > 18 ? 58 : 72,
                fontWeight: 700,
                color: OG.text,
              }}
            >
              {clamp(name, 30)}
            </div>
            <div style={{ display: "flex", marginTop: 14, fontSize: 32, color: OG.muted }}>
              {count} public {count === 1 ? "cube" : "cubes"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: OG.muted }}>
          Riftbound cubes on cubebound.gg
        </div>
      </div>
    ),
    { ...size, headers: OG_HEADERS },
  );
}
