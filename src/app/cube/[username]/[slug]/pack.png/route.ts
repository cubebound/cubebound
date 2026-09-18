/**
 * Renders one pack from this cube as a single image.
 *
 * Creators are already screenshotting the pack view for crack-a-pack videos and
 * Discord posts, and those screenshots are unreadable at video resolution. This
 * replaces the screenshot.
 *
 * **Nothing is stored, and the URL is the state.** There is no pack row and no
 * migration: the engine is deterministic, so a seed plus a config regenerates
 * the identical pack. That is the same property the draft replay relies on, and
 * it is why `readDraftConfig` already knows how to read a config out of a query
 * string — the Draftmancer export needed exactly this.
 *
 * **A route handler does not run the layout above it**, so the visibility check
 * is repeated here, and it is `canUseCube` rather than `canViewCube` for the
 * same reason the export uses it: taking a cube's art away to post elsewhere is
 * *using* the cube, so a hidden cube or a suspended owner's must not render even
 * for its own owner.
 *
 * **It needs an account, unlike the Draftmancer export beside it.** That export
 * is a text file assembled from rows we already hold; this fetches seventeen
 * images from Riot's CDN and composites them, which is by a wide margin the most
 * expensive thing on the site and was reachable signed out. Requiring a session
 * is also the only rate limit here that costs nothing to run: an account needs a
 * magic link, and that endpoint is already metered upstream.
 *
 * `runtime = "nodejs"` is load-bearing — sharp ships native bindings and cannot
 * run on Edge.
 */

import { getDraftCards } from "@/db/queries/drafts";
import { getDraftPools } from "@/db/queries/drafts";
import { canUseCube } from "@/lib/cube-access";
import { loadCube, loadViewer } from "@/lib/cube-request";
import { readDraftConfig, validateDraftConfig } from "@/lib/draft/config";
import { generatePacks } from "@/lib/draft/packs";
import { renderPackImage, type PackImageCard } from "@/lib/pack-image/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Card short side in output pixels.
 *
 * `full` is the download: card assets top out near 744px wide, so this is the
 * most detail that exists rather than an upscale.
 *
 * `preview` is what the page shows, and it is a *reading* size rather than a
 * thumbnail: the whole complaint this feature answers is that shared pack images
 * are too low-resolution to read the cards in, so a preview that cannot be read
 * fails the same way. 300 puts a six-column grid near 1930px, which is roughly
 * 2x a full-width browser column and stays sharp on a retina display.
 *
 * It is still a small fraction of the download. A preview asks Riot's CDN for
 * ~360px renditions where the download asks for ~900px, so shuffling repeatedly
 * — which is the loop this feature is built around — costs a fraction of one
 * download rather than a second copy of it.
 *
 * The build spec named both "480px per card" and "around 1200px wide". Those
 * were never in conflict: one is a card measurement and the other a canvas
 * measurement, and 480 per card is a 3086px canvas, which is a download.
 */
const TIERS = { preview: 300, full: 745 } as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string; slug: string }> },
) {
  const startedAt = Date.now();
  const { username, slug } = await params;
  const [cube, viewer] = await Promise.all([loadCube(username, slug), loadViewer()]);

  if (!canUseCube(cube, viewer?.profile?.id)) {
    return new Response("Not found", { status: 404 });
  }

  // Access is checked first so a signed-out visitor still cannot tell a private
  // cube from one that never existed — that distinction is what the 404 above
  // protects, and answering 401 before it would give it away.
  if (!viewer?.profile?.id) {
    return new Response("You need to be signed in.", { status: 401 });
  }

  const query = new URL(request.url).searchParams;
  const config = readDraftConfig(Object.fromEntries(query));
  const problems = validateDraftConfig(config);
  if (problems.length > 0) {
    return new Response(problems[0].message, { status: 400 });
  }

  const tier = query.get("tier") === "preview" ? "preview" : "full";
  // Absent, a fresh pack. The caller normally supplies one so the same URL keeps
  // giving the same pack, which is what makes the render cacheable later and
  // what a permalink will need.
  const seed = query.get("seed") ?? crypto.randomUUID();

  const pools = await getDraftPools(cube.id);
  // Deal the smallest grid that yields a pack, not the configured draft. The
  // config's seats and packs describe a whole event, and asking for all of them
  // makes `generatePacks` block on a cube that cannot fill 24 packs — which has
  // nothing to do with whether it can fill *one*. Two seats is the engine's
  // floor, so this is two packs dealt and one used.
  const generated = generatePacks({ ...config, seats: 2, packsPerPlayer: 1 }, pools, seed);
  if (!generated.ok) {
    return new Response(generated.error, { status: 400 });
  }

  // One pack, not the whole draft. `generatePacks` deals the grid it was asked
  // for and this takes the first seat's first pack: cheap, because it is pure
  // in-memory work over ids, and it keeps one definition of what a pack is.
  const pack = generated.packs[0]?.[0] ?? [];
  if (pack.length === 0) {
    return new Response("This cube cannot fill a pack.", { status: 400 });
  }

  const details = await getDraftCards(pack.map((card) => card.id));
  const cards: PackImageCard[] = [];
  for (const card of pack) {
    const found = details.get(card.id);
    // A card deleted from the database outright leaves a hole. Dropping it beats
    // drawing a gap, and the count in the footer then tells the truth about what
    // is actually in the image.
    if (!found?.imageFull) continue;
    cards.push({ url: found.imageFull, landscape: found.type === "Battlefield" });
  }
  if (cards.length === 0) {
    return new Response("No card art available for this pack.", { status: 400 });
  }

  const rendered = await renderPackImage({ cards, unit: TIERS[tier] });
  if (!rendered) {
    return new Response("This cube cannot fill a pack.", { status: 400 });
  }

  // What a render actually cost, so Vercel's logs answer "is this too
  // expensive" with numbers rather than estimates. The inbound figure is the one
  // that matters: it is bandwidth we never used to spend on card art at all.
  console.log(
    `[pack.png] cube=${cube.id} cards=${cards.length} tier=${tier} ` +
      `in=${Math.round(rendered.fetchedBytes / 1024)}KB out=${Math.round(rendered.buffer.byteLength / 1024)}KB ` +
      `${Date.now() - startedAt}ms`,
  );

  return new Response(new Uint8Array(rendered.buffer), {
    headers: {
      "Content-Type": "image/webp",
      // Only a download when something asked for one. The same route feeds the
      // preview `<img>` on the settings screen, and `attachment` there is at
      // best undefined behaviour and at worst a browser trying to save the
      // page's own image. The slug is URL- and filename-safe by construction
      // (`slugify`).
      "Content-Disposition": query.get("dl")
        ? `attachment; filename="${slug}-pack.webp"`
        : "inline",
      /**
       * `private`, so no CDN or shared proxy holds it: an unlisted cube's
       * contents are only as private as its URL, and this image *is* cube
       * contents. A shared cache would also serve the bytes to anyone who
       * guessed the URL, which would walk straight around the sign-in check
       * above — so edge-caching even the public cubes is off the table while
       * this route requires an account.
       *
       * `max-age` rather than `no-store` is the part that matters. `no-store`
       * forbade the *browser's* cache too, so a double-click on the download
       * button rendered the identical pack twice, and five clicks was five full
       * renders of byte-identical output. The URL is deterministic, so letting
       * the requester's own browser answer a repeat is free and correct. An hour
       * is well past a double-click and short enough that editing the cube shows
       * up in the next pack.
       */
      "Cache-Control": "private, max-age=3600",
    },
  });
}
