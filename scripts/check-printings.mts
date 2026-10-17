/**
 * Guards how printings collapse in the card browser.
 *
 * `cards.base_id` names the canonical printing of a card. It is resolved from
 * card data, not from the id string, because sets reprint cards in their
 * high-numbered showcase slots both within a set and across sets — see
 * src/lib/card-ids.ts. Two definitions exist (TypeScript for the sync, SQL for
 * the migration) and this asserts they agree on every row.
 *
 *   npm run check:printings
 *
 * Read-only: it never writes to the database.
 */

import postgres from "postgres";

import { fromEnvFile } from "./lib/env";

import {
  assignBaseIds,
  cardIdentityKey,
  collapseIdentityKey,
  composeCardId,
  isTokenCard,
  nameWithoutTreatment,
  provisionalBaseId,
  TOKEN_ID_PATTERN,
} from "../src/lib/card-ids";
import { cardPagePath } from "../src/lib/card-popularity";
import {
  galleryCardId,
  type GalleryCard,
  mapGalleryCards,
} from "./card-sources/riot-gallery";

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

/**
 * Cards that legitimately share a name while being different cards. Empty
 * today; add an id with a reason if a set ever ships one, so the check below
 * stays meaningful instead of being loosened.
 */
const DOCUMENTED_SPLITS: Record<string, string> = {};

try {
  const rows = await sql<
    {
      id: string;
      base_id: string;
      name: string;
      type: string;
      set_code: string;
      collector_no: string;
      rarity: string;
      supertype: string | null;
      champion: string | null;
      rules_text: string | null;
    }[]
  >`select id, base_id, name, type, set_code, collector_no, rarity, supertype, champion, rules_text from cards`;

  expect(rows.length > 0, "no cards in the database");

  // --- pure id helpers -------------------------------------------------------
  expect(provisionalBaseId("OGN-100a") === "OGN-100", "alt art should drop its letter");
  expect(provisionalBaseId("OGN-301-star") === "OGN-301", "signature should drop -star");
  expect(provisionalBaseId("UNL-T01") === "UNL-T01", "token ids have no suffix to strip");
  expect(composeCardId("ogn", 1, "") === "OGN-001", "compose should pad the collector number");
  expect(composeCardId("UNL", 3, "t03") === "UNL-T03", "compose should format tokens");

  // --- Riot's gallery ids and names map onto ours ----------------------------
  // Pure, against literal feed shapes. Both of the first two mistakes made
  // writing this adapter were here: an id rule that dropped the eleven
  // `ven-sp3-006` specials, and a signature champion read from a subtitle
  // that 44 of 60 signatures do not have.
  const idCases: [string, string | null][] = [
    ["ogn-119-298", "OGN-119"],
    ["ogn-119a-298", "OGN-119a"],
    ["sfd-227-star-221", "SFD-227-star"],
    ["ven-sp3-006", "VEN-SP3"],
    ["unl-t01", "UNL-T01"],
    ["rad-r04", "RAD-R04"],
    ["rad-r04a", "RAD-R04a"],
    ["ogn-119", null],
  ];
  for (const [raw, want] of idCases) {
    expect(galleryCardId(raw) === want, `galleryCardId(${raw}) should be ${want}, got ${galleryCardId(raw)}`);
  }

  const lbl = (label: string) => ({ id: label.toLowerCase(), label });
  const feedCard = (over: Partial<GalleryCard> & { id: string; name: string }): GalleryCard => ({
    collectorNumber: Number(/-(\d+)/.exec(over.id)?.[1] ?? 1),
    set: { value: { id: over.id.split("-")[0].toUpperCase(), label: "Test Set" } },
    domain: { values: [lbl("Mind")] },
    rarity: { value: lbl("Rare") },
    ...over,
  });
  const unitType = { type: [lbl("Unit")], superType: [lbl("Champion")] };
  const feed: GalleryCard[] = [
    feedCard({ id: "ogn-001-298", name: "Master Yi", subtitle: "Honed", cardType: unitType, tags: { tags: ["Master Yi"] } }),
    feedCard({ id: "ogn-002-298", name: "Kennen", subtitle: "Swift", cardType: unitType, tags: { tags: ["Kennen"] } }),
    // A signature names its champion in its tags; this subtitle is a nickname.
    feedCard({ id: "ogs-020-024", name: "Highlander", subtitle: "Yi", cardType: { type: [lbl("Spell")], superType: [lbl("Signature")] }, tags: { tags: ["Master Yi"] } }),
    // A legend with region tags beside its champion, and the gallery's stray Champion supertype.
    feedCard({ id: "ven-155-166", name: "Heart of the Tempest", cardType: { type: [lbl("Legend")], superType: [lbl("Champion")] }, tags: { tags: ["Yordle", "Kennen"] } }),
    // The OGS starter legends: Champion with subtitle "Starter", which is a treatment.
    feedCard({ id: "ogs-017-024", name: "Dark Child", subtitle: "Starter", cardType: { type: [lbl("Legend")], superType: [lbl("Champion")] }, tags: { tags: ["Annie"] } }),
    feedCard({
      id: "sfd-161-221", name: "B.F. Sword", cardType: { type: [lbl("Gear")] },
      might: { value: { id: 3, label: "3" } },
      text: { richText: { body: "<p>[Equip] :rb_energy_1:</p>" } },
      effect: { richText: { body: "<p>[Ganking]</p>" } },
    }),
    // Corrections: wrong domain and missing type, both applied while the feed still says `from`.
    feedCard({ id: "rad-067-167", name: "Clocktower Guardian", cardType: { type: [lbl("Unit")] }, domain: { values: [lbl("Fury")] } }),
    feedCard({ id: "rad-006-167", name: "Scorched Earth", domain: { values: [] } }),
    // ... and not once Riot has fixed it.
    feedCard({ id: "rad-001-167", name: "Amateur Demolitionist", cardType: { type: [lbl("Unit")] }, domain: { values: [lbl("Fury")] } }),
    feedCard({ id: "rad-999-167", name: "No Type Yet", domain: { values: [lbl("Calm")] } }),
  ];
  const mapped = mapGalleryCards(feed, new Date(0));
  const byId = new Map(mapped.rows.map((r) => [r.id, r]));
  const row = (id: string) => byId.get(id);
  expect(row("OGN-001")?.name === "Master Yi, Honed" && row("OGN-001")?.champion === "Master Yi", "a champion unit should be named champion-first");
  expect(row("OGS-020")?.name === "Highlander" && row("OGS-020")?.champion === "Master Yi", `a signature's champion comes from its tags, got ${row("OGS-020")?.champion}`);
  expect(row("VEN-155")?.champion === "Kennen" && row("VEN-155")?.supertype === null, "a legend's champion is the tag naming a champion, and it has no supertype");
  expect(row("OGS-017")?.name === "Dark Child" && row("OGS-017")?.champion === "Annie", `a starter legend keeps its title, got "${row("OGS-017")?.name}"`);
  expect(row("SFD-161")?.might === null, "gear's equip bonus must not be stored as might");
  expect(row("SFD-161")?.rulesText === "[Equip] :rb_energy_1:\n[Ganking]", `equipment effect text should follow the ability, got ${JSON.stringify(row("SFD-161")?.rulesText)}`);
  expect(JSON.stringify(row("RAD-067")?.domains) === '["Mind"]', "a domain correction applies while the feed still says the wrong value");
  expect(row("RAD-006")?.type === "Spell" && JSON.stringify(row("RAD-006")?.domains) === '["Fury"]', "a missing type and domain are filled from the corrections");
  expect(
    JSON.stringify(row("RAD-001")?.domains) === '["Fury"]' && mapped.notes.some((n) => n.includes("RAD-001") && n.includes("can be deleted")),
    "a correction Riot has caught up with is reported as deletable",
  );
  expect(!byId.has("RAD-999") && mapped.deliveredIds.has("RAD-999"), "an untyped card is skipped but still counted as delivered");

  // --- tokens are not cards --------------------------------------------------
  // Synthetic, because the half that matters most is not in dev at all: the
  // retired riftscribe tokens (`UNL-T01`…) have a null supertype and exist only
  // in production. A supertype-only rule would pass every live row below.
  const tokenCases: [string, string | null, string, boolean][] = [
    ["UNL-T01", null, "riftscribe token, null supertype, caught by id", true],
    ["SFD-T03", "Token", "riftcodex token by id and supertype", true],
    ["OGN-271", "Token", "token with an ordinary id, caught by supertype", true],
    ["UNL-T01a", null, "an alt-art token id", true],
    ["OGN-042", null, "an ordinary card", false],
    ["OGN-100a", null, "an alt art", false],
    ["OGN-301-star", null, "a signature", false],
    ["VEN-R01", "Basic", "a basic rune", false],
    ["VEN-SP3", null, "a special-slot reprint", false],
    ["OGN-150", "Champion", "a champion", false],
  ];
  for (const [id, supertype, label, token] of tokenCases) {
    expect(
      isTokenCard({ id, supertype }) === token,
      `isTokenCard(${id}, ${supertype}): ${label} should ${token ? "" : "not "}be a token`,
    );
  }

  // --- SQL and TypeScript must agree on every row ----------------------------
  const expected = assignBaseIds(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      setCode: r.set_code,
      collectorNo: r.collector_no,
      rarity: r.rarity,
    })),
  );
  const mismatches = rows.filter((r) => expected.get(r.id) !== r.base_id);
  expect(
    mismatches.length === 0,
    `SQL and assignBaseIds disagree on ${mismatches.length} row(s): ` +
      mismatches.slice(0, 5).map((m) => `${m.id} db=${m.base_id} ts=${expected.get(m.id)}`).join("; "),
  );

  // --- the bug this check exists for -----------------------------------------
  // Same card, more than one canonical printing => it shows up twice in the
  // collapsed browser. Identity is (name, type): rules text cannot be used,
  // because showcase reprints drop the parenthetical reminder text and
  // sometimes reword the ability entirely.
  const byIdentity = new Map<string, Set<string>>();
  const sampleIds = new Map<string, string[]>();
  for (const row of rows) {
    const key = cardIdentityKey({ name: row.name, type: row.type });
    if (!byIdentity.has(key)) {
      byIdentity.set(key, new Set());
      sampleIds.set(key, []);
    }
    byIdentity.get(key)!.add(row.base_id);
    sampleIds.get(key)!.push(row.id);
  }
  const split = [...byIdentity.entries()].filter(
    ([key, bases]) => bases.size > 1 && !DOCUMENTED_SPLITS[key],
  );
  expect(
    split.length === 0,
    `${split.length} card(s) collapse to more than one entry: ` +
      split.slice(0, 8).map(([key]) => `${key} (${sampleIds.get(key)!.join(", ")})`).join("; "),
  );

  // The stricter form the brief asked for: identical rules text must never be
  // split. This is a subset of the check above but fails louder when it trips.
  const byNameAndRules = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${row.name.trim().toLowerCase()}|${(row.rules_text ?? "").trim()}`;
    if (!byNameAndRules.has(key)) byNameAndRules.set(key, new Set());
    byNameAndRules.get(key)!.add(row.base_id);
  }
  const identicalSplit = [...byNameAndRules.entries()].filter(([, bases]) => bases.size > 1);
  expect(
    identicalSplit.length === 0,
    `${identicalSplit.length} row group(s) share a name AND identical rules text but have different base_ids: ` +
      identicalSplit.slice(0, 5).map(([key]) => key.split("|")[0]).join(", "),
  );

  // --- must NOT merge: different cards sharing a collector number ------------
  for (const row of rows.filter((r) => /-T\d+$/.test(r.id))) {
    const [set, token] = [row.id.split("-")[0], row.id.match(/-T(\d+)$/)![1]];
    const twinId = `${set}-${token.padStart(3, "0")}`;
    const twin = rows.find((r) => r.id === twinId);
    if (!twin) continue;
    if (twin.name.toLowerCase() === row.name.toLowerCase()) continue; // genuinely the same card
    expect(
      twin.base_id !== row.base_id,
      `${row.id} "${row.name}" and ${twin.id} "${twin.name}" are different cards but share base_id ${row.base_id}`,
    );
  }

  // --- tokens: SQL and TypeScript agree, and never share a group with a card --
  // `tokenCard` in src/db/queries/cards.ts is the SQL half; it binds the same
  // pattern, and must use `is not distinct from` because ordinary supertypes
  // are null. This script cannot import it (importing the query layer needs
  // DATABASE_URL at load), so the query below restates it: this proves the
  // pattern means the same in Postgres and JS. That the export itself leaves
  // tokens out is `check:card-filters` and `check:import`, through its results.
  const tokensInSql = new Set(
    (
      await sql<{ id: string }[]>`
        select id from cards
         where supertype is not distinct from 'Token' or id ~ ${TOKEN_ID_PATTERN}`
    ).map((r) => r.id),
  );
  const tokensInTs = new Set(rows.filter(isTokenCard).map((r) => r.id));
  const tokenDisagree = [
    ...[...tokensInSql].filter((id) => !tokensInTs.has(id)),
    ...[...tokensInTs].filter((id) => !tokensInSql.has(id)),
  ];
  expect(tokensInTs.size > 0, "no token rows found: has the source stopped serving them?");
  expect(
    tokenDisagree.length === 0,
    `SQL and isTokenCard disagree on ${tokenDisagree.length} row(s): ${tokenDisagree.slice(0, 5).join(", ")}`,
  );
  // The import catalog keeps only base printings that are not tokens, which is
  // safe only if no print group mixes the two.
  const mixedGroups = [...new Set(rows.map((r) => r.base_id))].filter((base) => {
    const group = rows.filter((r) => r.base_id === base);
    return group.some(isTokenCard) && !group.every(isTokenCard);
  });
  expect(
    mixedGroups.length === 0,
    `${mixedGroups.length} print group(s) mix tokens and cards: ${mixedGroups.slice(0, 5).join(", ")}`,
  );
  // And the rule is not a name match: a real card carrying a token's word
  // ("Recruit the Vanguard", "Sprite Queen") stays a card.
  const tokenWords = new Set(
    rows.filter(isTokenCard).flatMap((r) => nameWithoutTreatment(r.name).toLowerCase().split(/\W+/)),
  );
  const namesakes = rows.filter(
    (r) =>
      r.supertype !== "Token" &&
      !/-T\d/.test(r.id) &&
      r.name.toLowerCase().split(/\W+/).some((word) => word.length > 3 && tokenWords.has(word)),
  );
  expect(
    namesakes.every((r) => !isTokenCard(r)),
    `a card named after a token was classed as one: ` +
      namesakes.filter(isTokenCard).map((r) => `${r.id} "${r.name}"`).join("; "),
  );

  // Every base_id must point at a row that exists, and canonical rows point at
  // themselves.
  const ids = new Set(rows.map((r) => r.id));
  const dangling = rows.filter((r) => !ids.has(r.base_id));
  expect(dangling.length === 0, `${dangling.length} row(s) point at a base_id that does not exist`);

  const canonicals = new Set(rows.map((r) => r.base_id));
  const notSelfBased = [...canonicals].filter(
    (base) => rows.find((r) => r.id === base)?.base_id !== base,
  );
  expect(
    notSelfBased.length === 0,
    `${notSelfBased.length} canonical row(s) do not point at themselves: ${notSelfBased.slice(0, 5).join(", ")}`,
  );

  // --- what the card browser actually collapses on --------------------------
  // `base_id` is right for every card whose printings share a name, and wrong
  // for the ones whose treatment the source spells *in* the name. The browser
  // groups on `collapseKey` instead (src/db/queries/cards.ts); these assert the
  // TypeScript mirror of that regex agrees with Postgres on every row, and that
  // the rule does what it was added to do.
  const strippedInSql = await sql<{ id: string; stripped: string }[]>`
    select id, regexp_replace(name, '\\s*\\([^()]*\\)\\s*$', '') as stripped from cards`;
  const sqlStrip = new Map(strippedInSql.map((r) => [r.id, r.stripped.trim()]));
  const stripMismatches = rows.filter(
    (r) => sqlStrip.get(r.id) !== nameWithoutTreatment(r.name),
  );
  expect(
    stripMismatches.length === 0,
    `SQL and nameWithoutTreatment disagree on ${stripMismatches.length} row(s): ` +
      stripMismatches
        .slice(0, 5)
        .map((m) => `${m.id} sql="${sqlStrip.get(m.id)}" ts="${nameWithoutTreatment(m.name)}"`)
        .join("; "),
  );

  const collapsed = new Set(rows.map((r) => collapseIdentityKey(r)));

  // The bug this rule exists for: a promo whose name carries its treatment must
  // land on the same entry as the card it varies, not beside it.
  const treated = rows.filter((r) => nameWithoutTreatment(r.name) !== r.name.trim());
  expect(treated.length > 0, "no treatment-suffixed rows found — has the source changed?");
  const orphaned = treated.filter(
    (r) => !rows.some((o) => o !== r && collapseIdentityKey(o) === collapseIdentityKey(r)),
  );
  expect(
    orphaned.length === 0,
    `${orphaned.length} treatment printing(s) collapse to an entry of their own: ` +
      orphaned.slice(0, 5).map((o) => `${o.id} "${o.name}"`).join("; "),
  );

  // And the other half: a parenthetical that is *not* trailing is part of the
  // name. Riftcodex named four OGN tokens `Recruit (271) // Buff` and so on;
  // Riot's gallery calls them `Recruit (DE)`, so after the October 2026 source
  // switch no live row carries one. The rule is asserted on those names
  // directly, and the live loop still covers any row that does.
  for (const name of ["Recruit (271) // Buff", "Sprite (274) // Buff"]) {
    expect(nameWithoutTreatment(name) === name, `a mid-name parenthetical was stripped: "${name}"`);
  }
  expect(
    collapseIdentityKey({ name: "Recruit (271) // Buff", type: "Unit" }) !==
      collapseIdentityKey({ name: "Recruit (272) // Buff", type: "Unit" }),
    "two cards differing only in a mid-name parenthetical collapsed together",
  );
  const midName = rows.filter((r) => /\([^()]*\)/.test(r.name) && !/\([^()]*\)\s*$/.test(r.name));
  expect(
    midName.every((r) => nameWithoutTreatment(r.name) === r.name.trim()),
    `a mid-name parenthetical was stripped: ` +
      midName
        .filter((r) => nameWithoutTreatment(r.name) !== r.name.trim())
        .map((r) => `${r.id} "${r.name}"`)
        .join("; "),
  );
  expect(
    new Set(midName.map((r) => collapseIdentityKey(r))).size === midName.length,
    `mid-name parenthetical cards collapsed together: ` +
      midName.map((r) => `${r.id} "${r.name}"`).join("; "),
  );

  // ---- one card page per card, and one card per card page -----------------
  // `cardPagePath` slugifies, which is lossy: apostrophes and accents fold
  // away, and a legend's title is prefixed with its champion. Two cards landing
  // on the same URL would mean one of them is unreachable, and the layout
  // resolves a request by comparing paths, so the *other* one is whichever the
  // pool happens to list first. Asserted over the pool rather than reasoned
  // about, because it is a property of the card names a sync brings in.
  const pagePaths = new Map<string, string[]>();
  for (const row of rows) {
    if (isTokenCard(row)) continue; // never gets a page
    const key = collapseIdentityKey(row);
    const path = cardPagePath(row);
    const seen = pagePaths.get(path);
    if (seen) {
      if (!seen.includes(key)) seen.push(key);
    } else {
      pagePaths.set(path, [key]);
    }
  }
  const pageCollisions = [...pagePaths].filter(([, keys]) => keys.length > 1);
  expect(
    pageCollisions.length === 0,
    `${pageCollisions.length} card page URL(s) are claimed by more than one card, so ` +
      `one of each pair is unreachable: ` +
      pageCollisions
        .slice(0, 5)
        .map(([path, keys]) => `${path} <- ${keys.join(" / ")}`)
        .join("; "),
  );
  // And the reverse: every printing of one card must build the same URL, or
  // which printing represents the group would silently decide the address.
  const pathsPerCard = new Map<string, Set<string>>();
  for (const row of rows) {
    if (isTokenCard(row)) continue;
    const key = collapseIdentityKey(row);
    (pathsPerCard.get(key) ?? pathsPerCard.set(key, new Set()).get(key)!).add(cardPagePath(row));
  }
  const unstable = [...pathsPerCard].filter(([, paths]) => paths.size > 1);
  expect(
    unstable.length === 0,
    `${unstable.length} card(s) build more than one page URL across their printings: ` +
      unstable
        .slice(0, 5)
        .map(([key, paths]) => `${key} -> ${[...paths].join(" | ")}`)
        .join("; "),
  );

  console.log(
    `card pages: ${pagePaths.size} distinct URL(s) over ${pathsPerCard.size} card(s)`,
  );

  // ---- rules text arrives as text, not as the source's HTML ---------------
  // The source's `plain` field was stored for a year: HTML codes shown to
  // readers ("[Reaction][&gt;]", "&quot;") on 105 cards, and every line break
  // deleted, running one ability into the next on 625. The sync now reduces
  // `rich` instead (`richToRulesText`); this is what keeps it that way.
  const escaped = rows.filter((r) => /&(#?[a-z0-9]+);/i.test(r.rules_text ?? ""));
  expect(
    escaped.length === 0,
    `${escaped.length} card(s) store HTML character codes in their rules text, e.g. ` +
      escaped.slice(0, 3).map((r) => r.id).join(", "),
  );
  const tagged = rows.filter((r) => /<\/?[a-z][^>]*>/i.test(r.rules_text ?? ""));
  expect(
    tagged.length === 0,
    `${tagged.length} card(s) store HTML tags in their rules text, e.g. ` +
      tagged.slice(0, 3).map((r) => r.id).join(", "),
  );
  // Both sources write a literal "[NO TEXT]" on textless cards (runes, some
  // promos), and production showed it to readers until `richToRulesText`
  // learned to drop it.
  const placeholder = rows.filter((r) => (r.rules_text ?? "").includes("[NO TEXT]"));
  expect(
    placeholder.length === 0,
    `${placeholder.length} card(s) store the source's "[NO TEXT]" placeholder as rules text, e.g. ` +
      placeholder.slice(0, 3).map((r) => r.id).join(", "),
  );
  const multiLine = rows.filter((r) => (r.rules_text ?? "").includes("\n")).length;
  expect(
    multiLine > rows.length / 4,
    `only ${multiLine} card(s) keep a line break in their rules text; about half ` +
      `of all cards have more than one ability, so the sync is flattening them again`,
  );

  console.log(
    `printings: ${rows.length} rows -> ${canonicals.size} base_id group(s), ` +
      `${collapsed.size} entries as the browser collapses them ` +
      `(${treated.length} treatment printing(s) folded in), ${tokensInTs.size} token row(s), ` +
      `${namesakes.length} card(s) named after a token kept`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  await sql.end();
}

if (failures.length > 0) {
  console.error(`printing check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("printing check passed");
