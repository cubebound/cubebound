import { ImageResponse } from "next/og";

import { OG, OG_CONTENT_TYPE, OG_HEADERS, OG_SIZE, OgMark } from "@/lib/og";

export const alt = "cubebound.gg — cube construction and drafting for Riftbound";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The site-wide share preview, used by the landing page and inherited by any
 *  route that doesn't define its own. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: OG.background,
          // A warm bloom behind the mark, the same accent the lit cube edges
          // use, so the preview reads as the site rather than as a dark box.
          backgroundImage: `radial-gradient(circle at 50% 42%, rgba(255,106,43,0.22), rgba(9,9,11,0) 55%)`,
        }}
      >
        <OgMark size={132} />
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 74,
            fontWeight: 700,
            color: OG.text,
          }}
        >
          cubebound<span style={{ color: OG.muted }}>.gg</span>
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 32, color: OG.muted }}>
          Cube construction and drafting for Riftbound
        </div>
      </div>
    ),
    { ...size, headers: OG_HEADERS },
  );
}
