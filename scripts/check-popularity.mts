/**
 * Guards the card popularity arithmetic.
 *
 * Pure — no database, no server — so it runs in CI like `check:analytics`, and
 * every assertion is on a hand-built corpus where the right answer can be
 * counted on your fingers. That matters more here than usual for two reasons.
 *
 * These percentages are computed over cubes their owners marked **private**,
 * and the only thing that makes that acceptable is that nothing identifying can
 * be recovered from what is shown. The owner floor and the percentage rounding
 * are the whole of that promise, so they are asserted directly rather than
 * inferred from a page that renders.
 *
 * And a wrong percentage is invisible: a chart that is quietly off by a factor
 * looks exactly like one that is right, and nobody can check it against
 * anything, because the underlying cubes are not theirs to see.
 *
 *   npm run check:popularity
 */
import { readFileSync, existsSync } from "node:fs";

import {
  CARD_PAGE_MIN_OWNERS,
  cardPageName,
  cardPagePath,
  cardPagesFor,
  cardSlug,
  commonlyCubedWith,
  findCardByPath,
  hasCardPage,
  popularityForCards,
  popularityLabel,
  sharePercent,
  summarise,
  type CubeCardSet,
} from "../src/lib/card-popularity";

const failures: string[] = [];
let scenarios = 0;
const expect = (ok: boolean, message: string) => {
  scenarios += 1;
  if (!ok) failures.push(message);
};

const cube = (cubeId: string, ownerId: string, keys: string[]): CubeCardSet => ({
  cubeId,
  ownerId,
  keys,
});

/** Cards are `name|Type`, the same shape `collapseIdentityKey` builds. */
const k = (name: string) => `${name}|Unit`;

// --- a cube counts once per card, whatever it holds --------------------------
{
  // Three copies, two printings, one card. The reader aggregates with
  // `array_agg(distinct …)`, but a cube counted twice for one card would push a
  // percentage past what the denominator can justify, so the summary refuses it
  // too — this is the one arithmetic error the whole feature exists to avoid.
  const snapshot = summarise([
    cube("c1", "o1", [k("poro"), k("poro"), k("poro")]),
    cube("c2", "o2", [k("poro")]),
  ]);
  expect(snapshot.total === 2, `two cubes is a denominator of 2, got ${snapshot.total}`);
  expect(
    snapshot.byKey.get(k("poro"))?.cubes === 2,
    `a card held three times in one cube is one cube, got ${snapshot.byKey.get(k("poro"))?.cubes}`,
  );
  expect(
    popularityLabel(snapshot, k("poro")) === "In 100% of cubes",
    `both cubes really do run it, so 100% is true here: got ${popularityLabel(snapshot, k("poro"))}`,
  );
}

// --- the owner floor, which is the privacy promise ---------------------------
{
  const fourOwners = summarise(
    Array.from({ length: CARD_PAGE_MIN_OWNERS - 1 }, (_, i) =>
      cube(`c${i}`, `owner${i}`, [k("ahri")]),
    ),
  );
  expect(
    !hasCardPage(fourOwners, k("ahri")),
    `${CARD_PAGE_MIN_OWNERS - 1} owners must not unlock a pairings page`,
  );

  const fiveOwners = summarise(
    Array.from({ length: CARD_PAGE_MIN_OWNERS }, (_, i) => cube(`c${i}`, `owner${i}`, [k("ahri")])),
  );
  expect(
    hasCardPage(fiveOwners, k("ahri")),
    `${CARD_PAGE_MIN_OWNERS} distinct owners should unlock the page`,
  );

  // The case the floor is actually written against: one person's own cubes,
  // private clones included, must never add up to a published page about them.
  const oneOwner = summarise(
    Array.from({ length: CARD_PAGE_MIN_OWNERS + 3 }, (_, i) => cube(`c${i}`, "solo", [k("ahri")])),
  );
  expect(
    !hasCardPage(oneOwner, k("ahri")),
    "one owner's eight cubes must not unlock a page — the floor counts people, not cubes",
  );
  expect(
    oneOwner.byKey.get(k("ahri"))?.cubes === CARD_PAGE_MIN_OWNERS + 3,
    "…while still counting every one of them toward the percentage",
  );
}

// --- percentages: both ends of the rounding ----------------------------------
{
  expect(sharePercent(1, 3) === "33%", `1 of 3 is 33%, got ${sharePercent(1, 3)}`);
  expect(sharePercent(2, 3) === "67%", `2 of 3 rounds up to 67%, got ${sharePercent(2, 3)}`);

  // A card somebody runs must never read 0%: that says "nobody runs this"
  // about a card that is demonstrably in a cube.
  expect(
    sharePercent(1, 300) === "under 1%",
    `1 of 300 must not round to 0%, got ${sharePercent(1, 300)}`,
  );
  expect(
    sharePercent(1, 100_000) === "under 1%",
    "however small the share, a present card is never 0%",
  );

  // …and 100% is a claim about *every* cube, so it is held back unless it is.
  expect(
    sharePercent(399, 400) === "99%",
    `99.75% must not be reported as 100%, got ${sharePercent(399, 400)}`,
  );
  expect(sharePercent(400, 400) === "100%", "a card in every cube really is 100%");

  const present = summarise([
    cube("c1", "o1", [k("rare")]),
    ...Array.from({ length: 299 }, (_, i) => cube(`x${i}`, `o${i}`, [k("common")])),
  ]);
  expect(
    popularityLabel(present, k("rare")) === "In under 1% of cubes",
    `a present card's label must never contain 0%, got ${popularityLabel(present, k("rare"))}`,
  );
  expect(
    popularityLabel(present, k("never-cubed")) === null,
    "a card nobody has cubed has no label at all, rather than a 0% one",
  );
  expect(
    popularityLabel(summarise([]), k("rare")) === null,
    "with no qualifying cubes there is no statistic to state",
  );
}

// --- pairings: support, lift and order ---------------------------------------
{
  // Ten cubes. `a` is in the first five. Everything below is countable by hand:
  //   k  cubes 0-3        with a 4 of 4   lift (4/5)/(4/10)  = 2.0
  //   h  cubes 0-2        with a 3 of 3   lift (3/5)/(3/10)  = 2.0
  //   m  cubes 0-2        with a 3 of 3   lift               = 2.0
  //   j  cubes 0-2,5      with a 3 of 4   lift (3/5)/(4/10)  = 1.5
  //   i  cubes 0-2,5-7    with a 3 of 6   lift (3/5)/(6/10)  = 1.0  dropped
  //   l  every cube       with a 5 of 10  lift               = 1.0  dropped
  const corpus = [
    cube("c0", "o0", [k("a"), k("k"), k("h"), k("m"), k("j"), k("i"), k("l")]),
    cube("c1", "o1", [k("a"), k("k"), k("h"), k("m"), k("j"), k("i"), k("l")]),
    cube("c2", "o2", [k("a"), k("k"), k("h"), k("m"), k("j"), k("i"), k("l")]),
    cube("c3", "o3", [k("a"), k("k"), k("l")]),
    cube("c4", "o4", [k("a"), k("l")]),
    cube("c5", "o5", [k("j"), k("i"), k("l")]),
    cube("c6", "o6", [k("i"), k("l")]),
    cube("c7", "o7", [k("i"), k("l")]),
    cube("c8", "o8", [k("l")]),
    cube("c9", "o9", [k("l")]),
  ];
  const snapshot = summarise(corpus);
  const rows = commonlyCubedWith(snapshot, k("a"));
  const order = rows.map((row) => row.key.split("|")[0]).join(",");

  expect(
    order === "k,h,m,j",
    `pairings should rank by lift, then shared cubes, then key: got ${order}`,
  );
  expect(
    !rows.some((row) => row.key === k("a")),
    "a card is never listed as commonly cubed with itself",
  );
  expect(
    !rows.some((row) => row.key === k("l")),
    "a card in every cube has lift 1 and says nothing — it must be dropped, not " +
      "shown as the strongest pairing, which is what ranking by raw count would do",
  );
  expect(
    !rows.some((row) => row.key === k("i")),
    "lift of exactly 1 is not a pairing",
  );
  expect(
    rows[0].withPct === "80%" && rows[0].overallPct === "40%",
    `the leading row is 4 of a's 5 cubes and 4 of 10 overall, got ` +
      `${rows[0].withPct} / ${rows[0].overallPct}`,
  );

  // Support is the guard against one quirky cube minting a 100% pairing: lift
  // cannot tell two cubes agreeing from two hundred agreeing.
  const strict = commonlyCubedWith(snapshot, k("a"), { support: 4 });
  expect(
    strict.map((row) => row.key.split("|")[0]).join(",") === "k",
    `raising the support floor should drop the 3-cube pairings, got ` +
      `${strict.map((row) => row.key.split("|")[0]).join(",")}`,
  );
  const loose = commonlyCubedWith(snapshot, k("a"), { support: 1 });
  expect(loose.length >= rows.length, "lowering the floor cannot remove a pairing");

  expect(
    commonlyCubedWith(snapshot, k("a"), { limit: 2 }).length === 2,
    "the page is a list people read, so it is capped",
  );
  expect(
    commonlyCubedWith(snapshot, k("never-cubed")).length === 0,
    "a card in no cubes has no pairings",
  );
  expect(
    commonlyCubedWith(summarise([]), k("a")).length === 0,
    "an empty corpus must not throw or invent a pairing",
  );

  // Below the floor the page does not exist, so nothing may link to it.
  expect(
    rows.every((row) => row.hasPage === hasCardPage(snapshot, row.key)),
    "a listed card is linked only when it clears the owner floor itself",
  );
  expect(
    rows.some((row) => !row.hasPage),
    "the corpus must contain an unlinkable row, or that rule is untested here",
  );
  // The two rules are independent, and this is the pair that proves it: `l` is
  // in every cube, so it clears the owner floor easily and still says nothing
  // about `a`.
  expect(
    hasCardPage(snapshot, k("l")) && !rows.some((row) => row.key === k("l")),
    "having a page of its own must not make a card a pairing",
  );
}

// --- the client view ----------------------------------------------------------
{
  // Five owners run the legend, so it gets a page. The unit is in three cubes
  // but only two people's, which is the floor doing its job.
  const snapshot = summarise([
    ...Array.from({ length: CARD_PAGE_MIN_OWNERS }, (_, i) =>
      cube(`c${i}`, `owner${i}`, [
        "nine-tailed fox|Legend",
        ...(i < 2 ? ["poro herder|Unit"] : []),
      ]),
    ),
    cube("lonely", "owner0", ["poro herder|Unit"]),
  ]);

  const view = popularityForCards(snapshot, [
    { id: "OGN-013", name: "Nine-Tailed Fox", type: "Legend", champion: "Ahri" },
    // The same card, a treatment printing: same identity, same numbers.
    { id: "SFD-224", name: "Nine-Tailed Fox (Metal)", type: "Legend", champion: "Ahri" },
    { id: "OGN-020", name: "Poro Herder", type: "Unit", champion: null },
    { id: "OGN-999", name: "Never Cubed", type: "Unit", champion: null },
  ]);

  expect(
    view["OGN-013"]?.label === `In ${sharePercent(5, 6)} of cubes`,
    `the legend is in 5 of 6 cubes, got ${view["OGN-013"]?.label}`,
  );
  expect(
    view["SFD-224"]?.label === view["OGN-013"]?.label,
    "a treatment printing carries the card's popularity, not its own",
  );
  expect(
    view["OGN-013"]?.href === "/cards/legend/ahri-nine-tailed-fox",
    `a legend links to its champion-prefixed page, got ${view["OGN-013"]?.href}`,
  );
  expect(
    view["OGN-020"]?.href === null,
    "a card below the owner floor gets a label but no link",
  );
  expect(
    !("OGN-999" in view),
    "a card nobody cubes is absent from the map rather than present and blank — " +
      "a call site cannot then render an empty line by forgetting to check",
  );
  expect(
    // A bare zero, not the one inside 50% or 100%.
    Object.values(view).every((entry) => !/(?<!\d)0%/.test(entry.label)),
    `no rendered label may claim 0%: ${Object.values(view).map((e) => e.label).join(", ")}`,
  );
}

// --- the URLs -----------------------------------------------------------------
{
  expect(cardSlug("Poro Herder") === "poro-herder", `got ${cardSlug("Poro Herder")}`);
  expect(
    cardSlug("Kai'Sa") === "kaisa",
    `an apostrophe is dropped, not turned into a separator: got ${cardSlug("Kai'Sa")}`,
  );
  expect(cardSlug("Kai’Sa") === "kaisa", "including a curly apostrophe");
  expect(
    cardSlug("Recruit (271) // Buff") === "recruit-271-buff",
    `punctuation collapses to single separators, got ${cardSlug("Recruit (271) // Buff")}`,
  );

  expect(
    cardPagePath({ name: "Poro Herder", type: "Unit", champion: null }) === "/cards/unit/poro-herder",
    "an ordinary card is /cards/{type}/{name}",
  );
  expect(
    cardPagePath({ name: "Nine-Tailed Fox (Metal)", type: "Legend", champion: "Ahri" }) ===
      "/cards/legend/ahri-nine-tailed-fox",
    "the treatment is stripped, so a promo is not a second URL for the same card",
  );
  expect(
    cardPagePath({ name: "Darius, Trifarian", type: "Unit", champion: "Darius" }) ===
      "/cards/unit/darius-trifarian",
    "a champion unit already carries its champion and must not get it twice",
  );
  expect(
    cardPagePath({ name: "Battlefield Name", type: "Battlefield", champion: null }) ===
      "/cards/battlefield/battlefield-name",
    "the type segment is the game's own vocabulary",
  );

  // The name in the title and the copy must be spelled the way the URL is, or
  // a legend's page is headed "Nine-Tailed Fox" at /cards/legend/ahri-...
  expect(
    cardPageName({ name: "Nine-Tailed Fox (Metal)", type: "Legend", champion: "Ahri" }) ===
      "Ahri, Nine-Tailed Fox",
    "the page's name restores the champion and drops the treatment",
  );
}

// --- resolving a request back to a card ---------------------------------------
{
  // Slugs are lossy, so resolution has to go forwards. The cases that matter
  // are the ones that must *not* resolve: a second spelling of a real page is
  // a duplicate URL, which is exactly what the canonical tag exists to avoid.
  const pool = [
    { id: "OGN-001", name: "Poro Herder", type: "Unit", champion: null },
    { id: "OGN-002", name: "Kai'Sa", type: "Unit", champion: null },
    { id: "SFD-224", name: "Nine-Tailed Fox (Metal)", type: "Legend", champion: "Ahri" },
  ];

  expect(
    findCardByPath(pool, "/cards/unit/poro-herder")?.id === "OGN-001",
    "an exact path resolves",
  );
  expect(
    findCardByPath(pool, "/cards/unit/kaisa")?.id === "OGN-002",
    "a lossy slug still resolves, because the comparison is forwards",
  );
  expect(
    findCardByPath(pool, "/cards/legend/ahri-nine-tailed-fox")?.id === "SFD-224",
    "a legend resolves under its champion",
  );
  expect(
    findCardByPath(pool, "/cards/Unit/Poro-Herder") === null,
    "a non-canonical case must not resolve, or one page has two URLs",
  );
  expect(
    findCardByPath(pool, "/cards/spell/poro-herder") === null,
    "the type segment is part of the identity, not decoration",
  );
  expect(findCardByPath(pool, "/cards/unit/nothing-here") === null, "an unknown slug is null");
  expect(findCardByPath([], "/cards/unit/poro-herder") === null, "an empty pool resolves nothing");

  // The sitemap and the page must agree about which pages exist, or the
  // sitemap publishes URLs that 404.
  const sets: CubeCardSet[] = [];
  for (let i = 0; i < 5; i += 1) {
    sets.push({ cubeId: `c${i}`, ownerId: `owner${i}`, keys: ["poro herder|Unit"] });
  }
  // Two cubes, one owner: real, and below the floor.
  sets.push({ cubeId: "d0", ownerId: "solo", keys: ["kai'sa|Unit"] });
  sets.push({ cubeId: "d1", ownerId: "solo", keys: ["kai'sa|Unit"] });
  const listed = cardPagesFor(summarise(sets), pool);

  expect(
    listed.join(",") === "/cards/unit/poro-herder",
    `only cards over the owner floor are listed, got ${listed.join(", ") || "nothing"}`,
  );
  expect(
    listed.every((path) => findCardByPath(pool, path) !== null),
    "every listed path must resolve back to a card, or the sitemap 404s",
  );
  expect(
    cardPagesFor(summarise([]), pool).length === 0,
    "an empty corpus advertises no card pages at all",
  );
}

// --- the copy carries no em dash ---------------------------------------------
{
  // The site's copy avoids the em dash; a page `<title>` is the documented
  // exception. Comments are exempt, so they are stripped first.
  const sources = [
    "src/lib/card-popularity.ts",
    "src/app/cards/[type]/[slug]/page.tsx",
    "src/app/cards/[type]/[slug]/layout.tsx",
    "src/app/cards/[type]/[slug]/loading.tsx",
  ].filter((path) => existsSync(path));
  expect(sources.length > 0, "the em-dash scan found nothing to read");

  for (const path of sources) {
    const code = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const offenders = code
      .split("\n")
      .filter((line) => line.includes("—") && !/\btitle\b/.test(line));
    expect(
      offenders.length === 0,
      `${path} uses an em dash in copy: ${offenders[0]?.trim()}`,
    );
  }
}

if (failures.length > 0) {
  console.error(`popularity check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`popularity check passed (${scenarios} cases)`);
