/**
 * Guards the Draftmancer cube file.
 *
 * Pure — no database, no server — so it runs in CI like `check:draft` and
 * `check:analytics`. Every assertion is on a hand-built cube where the right
 * answer is obvious by inspection.
 *
 * The load-bearing one is the last block. Draftmancer resolves sheet lines
 * against `[CustomCards]` **by name**, so a duplicate name does not error — it
 * silently binds both lines to one entry, and the cube drafts with a card
 * missing and another doubled. That failure is invisible in the file and
 * invisible in Draftmancer until somebody notices they never saw a card.
 *
 *   npm run check:draftmancer
 */
import {
  draftmancerName,
  draftmancerPlan,
  draftmancerRating,
  toDraftmancerCubeFile,
  type DraftmancerSourceCard,
} from "../src/lib/draftmancer-export";
import { deckListName } from "../src/lib/deck-export";

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

let scenarios = 0;
const scenario = () => {
  scenarios += 1;
};

function card(over: Partial<DraftmancerSourceCard> = {}): DraftmancerSourceCard {
  return {
    id: "OGN-001",
    name: "Test Card",
    champion: null,
    type: "Unit",
    supertype: null,
    rarity: "Common",
    baseRarity: "Common",
    domains: ["Fury"],
    energyCost: 2,
    powerCost: null,
    might: null,
    rulesText: null,
    setCode: "OGN",
    collectorNo: "001",
    imageFull: "https://cmsassets.rgpub.io/card.png",
    section: "main",
    quantity: 1,
    ...over,
  };
}

/** Parses a built file back into its parts, the way Draftmancer would. */
function parse(text: string) {
  const lines = text.split("\n");
  const customStart = lines.indexOf("[CustomCards]");
  const sheetIndexes = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => i > customStart && /^\[[^\]]+\(\d+\)\]$/.test(line));

  const json = lines.slice(customStart + 1, sheetIndexes[0]?.i).join("\n");
  const customCards = JSON.parse(json) as { name: string; [k: string]: unknown }[];

  const sheets = sheetIndexes.map(({ line, i }, n) => {
    const end = sheetIndexes[n + 1]?.i ?? lines.length;
    const [, name, perBooster] = line.match(/^\[([^(]+)\((\d+)\)\]$/)!;
    return {
      name,
      perBooster: Number(perBooster),
      lines: lines.slice(i + 1, end).filter((l) => l.trim() !== ""),
    };
  });

  return { customCards, sheets };
}

// --- rating: the four real tiers ---------------------------------------------
{
  scenario();
  const tiers: [string, number][] = [
    ["Common", 1],
    ["Uncommon", 2],
    ["Rare", 3],
    ["Epic", 4],
  ];
  for (const [rarity, want] of tiers) {
    const got = draftmancerRating({ rarity, baseRarity: rarity });
    expect(got === want, `${rarity} should rate ${want}, got ${got}`);
  }
}

// --- rating: treatments look through to the canonical printing ---------------
{
  scenario();
  // 120 Showcase rows all resolve through base_id — 70 to Rare, 42 to Epic.
  const showcaseEpic = draftmancerRating({ rarity: "Showcase", baseRarity: "Epic" });
  expect(showcaseEpic === 4, `a showcase Epic should rate 4, got ${showcaseEpic}`);

  // 73 of 117 Promo rows are their own base, so there is nothing to look through.
  const promo = draftmancerRating({ rarity: "Promo", baseRarity: "Promo" });
  expect(promo === 2, `an unresolvable Promo should rate the neutral 2, got ${promo}`);

  // The fallback must never be 0: that is the bottom of the scale, not an
  // absence, and 339 Promo rows sit in real cubes today.
  expect(promo !== 0, "an unrated card must not be rated 0 — bots would take it last");

  const unknown = draftmancerRating({ rarity: "SomeFutureRarity", baseRarity: null });
  expect(unknown === 2, `an unknown rarity should rate the neutral 2, got ${unknown}`);
}

// --- names: legends get their champion back ----------------------------------
{
  scenario();
  const legend = card({
    name: "Daughter of the Void",
    champion: "Kai'Sa",
    type: "Legend",
  });
  expect(
    draftmancerName(legend) === "Kai'Sa, Daughter of the Void",
    `a legend should be rebuilt, got ${draftmancerName(legend)}`,
  );

  // Champion units already carry it; applying the rule twice would give
  // "Darius, Darius, Trifarian".
  const unit = card({ name: "Darius, Trifarian", champion: "Darius", type: "Unit" });
  expect(
    draftmancerName(unit) === "Darius, Trifarian",
    `a champion unit must not double its champion, got ${draftmancerName(unit)}`,
  );
}

// --- names: variant suffixes are KEPT, unlike the text decklist ---------------
{
  scenario();
  const metal = card({ id: "OGN-100a", name: "Battle Mistress (Metal)" });
  expect(
    draftmancerName(metal) === "Battle Mistress (Metal)",
    `Draftmancer keeps the printing's suffix, got ${draftmancerName(metal)}`,
  );
  // The other export deliberately strips it, so the two must not be confused.
  expect(
    deckListName(metal) === "Battle Mistress",
    "deckListName still strips the suffix for other builders",
  );
}

// --- a genuine name collision is disambiguated, not emitted twice -------------
{
  scenario();
  const file = toDraftmancerCubeFile([
    card({ id: "OGN-010", name: "Twin Name" }),
    card({ id: "UNL-220", name: "Twin Name" }),
  ]);
  const { customCards, sheets } = parse(file.text);
  const names = customCards.map((c) => c.name);
  expect(
    new Set(names).size === names.length,
    `custom card names must be unique, got ${JSON.stringify(names)}`,
  );
  expect(
    names.includes("Twin Name (OGN-010)") && names.includes("Twin Name (UNL-220)"),
    `colliding names should carry their printing id, got ${JSON.stringify(names)}`,
  );
  expect(
    file.warnings.some((w) => w.includes("printing id")),
    "a rename must be reported, never silent",
  );
  expect(sheets[0].lines.length === 2, "both copies still appear in the sheet");
}

// --- sections: only what our own draft deals --------------------------------
{
  scenario();
  const file = toDraftmancerCubeFile([
    card({ id: "a", name: "Main Card", section: "main" }),
    card({ id: "b", name: "A Legend", section: "legends", type: "Legend" }),
    card({ id: "c", name: "A Field", section: "battlefields", type: "Battlefield" }),
    card({ id: "d", name: "A Rune", section: "runes", type: "Rune" }),
    card({ id: "e", name: "Cut Card", section: "sideboard" }),
    card({ id: "f", name: "Maybe Card", section: "maybeboard" }),
  ]);
  const { customCards, sheets } = parse(file.text);
  const names = customCards.map((c) => c.name);

  for (const excluded of ["A Rune", "Cut Card", "Maybe Card"]) {
    expect(!names.includes(excluded), `${excluded} must not be exported`);
  }
  expect(names.includes("Main Card"), "main section is exported");
  expect(file.cardCount === 3, `three drafted copies, got ${file.cardCount}`);

  expect(sheets.length === 2, `expected a main and an identity sheet, got ${sheets.length}`);
  expect(sheets[0].lines.length === 1, "one main card in the main sheet");
  expect(
    sheets[1].lines.length === 2,
    "legends and battlefields share the identity sheet",
  );
}

// --- the pack arithmetic matches our own Legacy booster ----------------------
{
  scenario();
  const file = toDraftmancerCubeFile([
    card({ id: "a", section: "main" }),
    card({ id: "b", section: "legends", type: "Legend" }),
  ]);
  const { sheets } = parse(file.text);
  expect(
    sheets[0].perBooster + sheets[1].perBooster === file.packSize,
    `the sheets must sum to the pack size (${file.packSize}), got ${sheets
      .map((s) => s.perBooster)
      .join(" + ")}`,
  );
  expect(sheets[1].perBooster === 1, "one legend-or-battlefield a pack");
}

// --- a cube with no legends or battlefields exports one full sheet -----------
{
  scenario();
  const file = toDraftmancerCubeFile([card({ id: "a", section: "main" })]);
  const { sheets } = parse(file.text);
  expect(sheets.length === 1, `expected a single sheet, got ${sheets.length}`);
  expect(
    sheets[0].perBooster === file.packSize,
    `the one sheet must fill the pack, got ${sheets[0].perBooster}`,
  );
  expect(
    file.warnings.some((w) => w.includes("no legends or battlefields")),
    "the user is told why every pack is main-only",
  );
}

// --- costless is empty, not {0} ----------------------------------------------
{
  scenario();
  const file = toDraftmancerCubeFile([
    card({ id: "a", name: "Costed", energyCost: 3 }),
    card({ id: "b", name: "Zero", energyCost: 0 }),
    card({ id: "c", name: "Costless", energyCost: null, type: "Legend", section: "legends" }),
  ]);
  const { customCards } = parse(file.text);
  const cost = (name: string) =>
    customCards.find((c) => c.name === name)?.mana_cost as string;

  expect(cost("Costed") === "{3}", `energy 3 should be {3}, got ${cost("Costed")}`);
  expect(cost("Zero") === "{0}", `a real 0-cost card is {0}, got ${cost("Zero")}`);
  expect(
    cost("Costless") === "",
    `a card with no energy cost is empty, not {0} — got ${cost("Costless")}`,
  );
}

// --- oracle text is readable, not escaped or full of tokens ------------------
{
  scenario();
  const file = toDraftmancerCubeFile([
    card({
      name: "Wordy",
      rulesText: "Action&gt; Exhaust : Deal :rb_energy_1: damage.",
      powerCost: { fury: 2 },
      might: 3,
    }),
  ]);
  const { customCards } = parse(file.text);
  const oracle = customCards[0].oracle_text as string;

  expect(
    !oracle.includes("&gt;"),
    `HTML entities must be decoded for a plain-text field, got ${oracle}`,
  );
  expect(oracle.includes(">"), "the cost/effect separator survives as a real character");
  expect(
    !oracle.includes(":rb_energy_1:"),
    `symbol tokens must be resolved, got ${oracle}`,
  );
  expect(oracle.includes("Power: 2 Fury"), `power cost belongs in oracle text, got ${oracle}`);
  expect(oracle.includes("Might 3"), `might belongs in oracle text, got ${oracle}`);
}

// --- quantities survive, and every sheet line resolves ----------------------
{
  scenario();
  const file = toDraftmancerCubeFile([
    card({ id: "a", name: "Triple", quantity: 3 }),
    card({ id: "b", name: "Single", quantity: 1 }),
    card({ id: "c", name: "Legendary", section: "legends", type: "Legend" }),
  ]);
  const { customCards, sheets } = parse(file.text);

  expect(file.cardCount === 5, `copies, not rows: expected 5, got ${file.cardCount}`);
  expect(
    sheets[0].lines.includes("3 Triple"),
    `quantity must lead the line, got ${JSON.stringify(sheets[0].lines)}`,
  );

  // The property the whole format rests on: Draftmancer looks sheet lines up in
  // [CustomCards] by name, and an unresolved one is a card that never appears.
  const defined = new Set(customCards.map((c) => c.name));
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      const name = line.replace(/^\d+\s+/, "");
      expect(
        defined.has(name),
        `sheet line "${line}" names a card with no [CustomCards] entry`,
      );
    }
  }
}

// --- the plan matches the file it describes ----------------------------------
{
  scenario();
  const cards = [
    card({ id: "a", section: "main", quantity: 2 }),
    card({ id: "b", section: "legends", type: "Legend" }),
    card({ id: "c", section: "runes", type: "Rune" }),
  ];
  const plan = draftmancerPlan(cards);
  const file = toDraftmancerCubeFile(cards);
  expect(
    plan.cardCount === file.cardCount &&
      plan.mainCount === file.mainCount &&
      plan.identityCount === file.identityCount &&
      plan.mainPerPack === file.mainPerPack,
    "the panel's summary must agree with the file it offers",
  );
  expect(plan.mainCount === 2, `main copies should be 2, got ${plan.mainCount}`);
}

// --- an empty cube must not throw --------------------------------------------
{
  scenario();
  const file = toDraftmancerCubeFile([]);
  expect(file.cardCount === 0, "an empty cube exports nothing");
  expect(draftmancerPlan([]).cardCount === 0, "and plans nothing");
}

if (failures.length > 0) {
  console.error(`draftmancer check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`draftmancer check passed (${scenarios} scenarios)`);
