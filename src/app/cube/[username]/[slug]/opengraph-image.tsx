import { ImageResponse } from "next/og";

import {
  getCubeByOwnerAndSlug,
  getCubeCards,
  getCubeCoverImage,
} from "@/db/queries/cubes";
import { cardShareImage } from "@/lib/card-images";
import { countCopies } from "@/lib/cube-cards";
import {
  clamp,
  fetchImageData,
  OG,
  OG_CONTENT_TYPE,
  OG_HEADERS,
  OG_SIZE,
  OgBrand,
} from "@/lib/og";
import { CUBE_LIST_SECTIONS, CUBE_SECTION_LABELS, isLandscape } from "@/lib/riftbound";

export const alt = "A Riftbound cube on cubebound.gg";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * A cube's share preview: cover art, name, owner and what's in it.
 *
 * **Private cubes get the generic card.** This route is public and unauthenticated
 * — a scraper has no session — so rendering a private cube's name here would
 * leak it to anyone who guessed the URL, which is exactly what the 404 on the
 * page itself prevents. Unlisted cubes do get their real preview: they are
 * meant to be shared by link, and a link that previews as nothing defeats that.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const cube = await getCubeByOwnerAndSlug(username, slug);

  if (!cube || cube.visibility === "private") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: OG.background,
          }}
        >
          <OgBrand />
        </div>
      ),
      { ...size, headers: OG_HEADERS },
    );
  }

  const cards = (await getCubeCards(cube.id)).filter(
    (card) => card.section !== "maybeboard",
  );
  const total = countCopies(cards);

  const bySection = new Map<string, number>();
  for (const card of cards) {
    bySection.set(card.section, (bySection.get(card.section) ?? 0) + card.quantity);
  }

  // Thumb width rather than full: this is a 1200px canvas and the art occupies
  // a third of it, so the extra pixels are only weight a scraper waits on.
  const coverUrl = cardShareImage(await getCubeCoverImage(cube.id));
  const cover = await fetchImageData(coverUrl);
  const coverCard = cards.find((card) => card.id === cube.coverCardId);
  const landscape = coverCard ? isLandscape(coverCard.type) : false;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: OG.background,
          backgroundImage: `radial-gradient(circle at 78% 50%, rgba(255,106,43,0.16), rgba(9,9,11,0) 55%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 56,
            width: cover ? 720 : 1200,
          }}
        >
          <OgBrand />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: cube.name.length > 28 ? 56 : 68,
                fontWeight: 700,
                color: OG.text,
                lineHeight: 1.1,
              }}
            >
              {clamp(cube.name, 56)}
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: OG.muted }}>
              by {clamp(cube.ownerUsername, 24)} · {total} cards
            </div>
            {cube.description && (
              <div
                style={{
                  display: "flex",
                  marginTop: 18,
                  fontSize: 26,
                  color: OG.muted,
                  lineHeight: 1.35,
                }}
              >
                {clamp(cube.description, 110)}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {CUBE_LIST_SECTIONS.filter((section) => bySection.has(section)).map(
              (section) => (
                <div
                  key={section}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    borderRadius: 9999,
                    background: OG.panel,
                    border: `1px solid ${OG.border}`,
                    fontSize: 22,
                    color: OG.muted,
                  }}
                >
                  <span style={{ color: OG.text, fontWeight: 600 }}>
                    {bySection.get(section)}
                  </span>
                  {CUBE_SECTION_LABELS[section]}
                </div>
              ),
            )}
          </div>
        </div>

        {cover && (
          <div
            style={{
              display: "flex",
              width: 480,
              alignItems: "center",
              justifyContent: "center",
              padding: 40,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              width={landscape ? 400 : 372}
              height={landscape ? 286 : 521}
              style={{ borderRadius: 18, objectFit: "cover" }}
            />
          </div>
        )}
      </div>
    ),
    { ...size, headers: OG_HEADERS },
  );
}
