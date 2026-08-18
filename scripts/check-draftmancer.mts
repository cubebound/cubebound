/**
 * Guards the Draftmancer cube file.
 *
 * Pure — no database, no server — so it runs in CI like `check:draft` and
 * `check:analytics`. Every assertion is on a hand-built cube where the right
 * answer is obvious by inspection.
 *
 * Two of these stand between a working export and a broken one, and neither
 * fails loudly on its own. Draftmancer resolves sheet lines against
 * `[CustomCards]` **by name**, so a duplicate name silently binds both lines to
 * one entry and the cube drafts with a card missing and another doubled. And it
 * validates `rarity` against a closed set, rejecting the whole file on anything
 * else — its documentation says the field is optional and unconstrained, and is
 * wrong on both counts.
 *
 *   npm run check:draftmancer
 */
import { DEFAULT_DRAFT_CONFIG, type DraftConfig } from "../src/lib/draft/config";
import { deckListName } from "../src/lib/deck-export";
import {
  draftmancerName,
  draftmancerPlan,
  draftmancerRarity,
  draftmancerRating,
  toDraftmancerCubeFile,
  type DraftmancerSourceCard,
} from "../src/lib/draftmancer-export";

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

const config = (over: Partial<DraftConfig> = {}): DraftConfig => ({
  ...DEFAULT_DRAFT_CONFIG,
  ...over,
});

interface LayoutSlot {
  name: string;
  count: number;
  sheets?: { name: string; weight: number }[];
}

/** Parses a built file back into its parts, the way Draftmancer would. */
function parse(text: string) {
  const lines = text.split("\n");
  const settingsAt = lines.indexOf("[Settings]");
  const isSheetHeader = (line: string, i: number) =>
    i > settingsAt && /^\[[^\]()]+\]$/.test(line);
  const sheetIndexes = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => isSheetHeader(line, i));

  const customCards = JSON.parse(
    lines.slice(lines.indexOf("[CustomCards]") + 1, settingsAt).join("\n"),
  ) as Record<string, unknown>[];

  const settings = JSON.parse(
    lines.slice(settingsAt + 1, sheetIndexes[0]?.i ?? lines.length).join("\n"),
  ) as Record<string, unknown> & {
    layouts: { Default: { weight: number; slots: LayoutSlot[] } };
  };

  const sheets = sheetIndexes.map(({ line, i }, n) => ({
    name: line.slice(1, -1),
    lines: lines
      .slice(i + 1, sheetIndexes[n + 1]?.i ?? lines.length)
      .filter((l) => l.trim() !== ""),
  }));

  return { customCards, settings, sheets, slots: settings.layouts.Default.slots };
}

const slotNamed = (slots: LayoutSlot[], name: string) =>
  slots.find((s) => s.name === name);
const sheetNamed = (sheets: { name: string; lines: string[] }[], name: string) =>
  sheets.find((s) => s.name === name);

// --- rarity + rating: the four real tiers ------------------------------------
{
  scenario();
  const tiers: [string, string, number][] = [
    ["Common", "common", 1],
    ["Uncommon", "uncommon", 2],
    ["Rare", "rare", 3],
    // Epic is the top of our scale, so it maps to the top of theirs.
    ["Epic", "mythic", 4],
  ];
  for (const [rarity, wantRarity, wantRating] of tiers) {
    const gotRarity = draftmancerRarity({ rarity, baseRarity: rarity });
    const gotRating = draftmancerRating({ rarity, baseRarity: rarity });
    expect(gotRarity === wantRarity, `${rarity} should map to ${wantRarity}, got ${gotRarity}`);
    expect(gotRating === wantRating, `${rarity} should rate ${wantRating}, got ${gotRating}`);
  }
}

// --- rarity: treatments look through to the canonical printing ---------------
{
  scenario();
  // 120 Showcase rows all resolve through base_id — 70 to Rare, 42 to Epic.
  expect(
    draftmancerRarity({ rarity: "Showcase", baseRarity: "Epic" }) === "mythic",
    "a showcase Epic resolves through its base printing",
  );
  const showcaseEpic = draftmancerRating({ rarity: "Showcase", baseRarity: "Epic" });
  expect(showcaseEpic === 4, `a showcase Epic should rate 4, got ${showcaseEpic}`);

  // 73 of 117 Promo rows are their own base, so there is nothing to look through.
  expect(
    draftmancerRarity({ rarity: "Promo", baseRarity: "Promo" }) === "special",
    "an unresolvable Promo is 'special', the value that exists for exactly this",
  );
  const promo = draftmancerRating({ rarity: "Promo", baseRarity: "Promo" });
  expect(promo === 2, `an unresolvable Promo should rate the neutral 2, got ${promo}`);

  // The fallback must never be 0: that is the bottom of the scale, not an
  // absence, and 339 Promo rows sit in real cubes today.
  expect(promo !== 0, "an unrated card must not be rated 0 — bots would take it last");

  expect(
    draftmancerRarity({ rarity: "SomeFutureRarity", baseRarity: null }) === "special",
    "a rarity from a future set must not produce a value Draftmancer rejects",
  );
}

// --- every emitted rarity is one Draftmancer accepts --------------------------
{
  scenario();
  const ACCEPTED = new Set(["common", "uncommon", "rare", "mythic", "special"]);
  const file = toDraftmancerCubeFile(
    ["Common", "Uncommon", "Rare", "Epic", "Showcase", "Promo", "Mythic Whatever"].map(
      (rarity, i) => card({ id: `c${i}`, name: `Card ${i}`, rarity, baseRarity: rarity }),
    ),
  );
  for (const entry of parse(file.text).customCards) {
    expect(
      ACCEPTED.has(entry.rarity as string),
      `rarity "${entry.rarity}" would be rejected on upload`,
    );
  }
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
  const names = customCards.map((c) => c.name as string);
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
  expect(sheetNamed(sheets, "Main")!.lines.length === 2, "both copies still appear");
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
  const names = customCards.map((c) => c.name as string);

  for (const excluded of ["A Rune", "Cut Card", "Maybe Card"]) {
    expect(!names.includes(excluded), `${excluded} must not be exported`);
  }
  expect(names.includes("Main Card"), "main section is exported");
  expect(file.cardCount === 3, `three drafted copies, got ${file.cardCount}`);
  expect(sheetNamed(sheets, "Legends")!.lines.length === 1, "legends get their own sheet");
  expect(
    sheetNamed(sheets, "Battlefields")!.lines.length === 1,
    "battlefields get their own sheet",
  );
}

// --- the default layout is our Legacy booster, and the either-slot is 50/50 ---
{
  scenario();
  const file = toDraftmancerCubeFile([
    card({ id: "a", section: "main" }),
    card({ id: "b", section: "legends", type: "Legend" }),
    card({ id: "c", section: "battlefields", type: "Battlefield" }),
  ]);
  const { slots, settings } = parse(file.text);

  const main = slotNamed(slots, "Main")!;
  const either = slots.find((s) => s.sheets)!;
  expect(main.count === 11, `11 main cards a pack, got ${main.count}`);
  expect(either.count === 1, `one legend-or-battlefield a pack, got ${either.count}`);
  expect(
    main.count + either.count === file.packSize,
    `the slots must sum to the pack size (${file.packSize})`,
  );

  // The whole reason this is a weighted slot rather than one mixed sheet: a
  // mixed sheet draws in proportion to the cube's own split (26 legends against
  // 56 battlefields on the dev cube — about 68% battlefield).
  const weights = either.sheets!.map((s) => s.weight);
  expect(
    either.sheets!.length === 2 && weights[0] === weights[1],
    `the either-slot must weight both types equally, got ${JSON.stringify(either.sheets)}`,
  );
  expect(
    either.sheets!.map((s) => s.name).join(",") === "Legends,Battlefields",
    "it draws from both type sheets",
  );

  expect(settings.boostersPerPlayer === 3, "packs per player is a default for the host");
}

// --- settings that must not be left to Draftmancer's defaults ----------------
{
  scenario();
  const { settings } = parse(toDraftmancerCubeFile([card()]).text);
  // colorBalance defaults ON and would balance the largest slot against a
  // `colors` field we deliberately never emit.
  expect(settings.colorBalance === false, "colorBalance must be off");
  expect(settings.withReplacement === false, "a card held once appears once");
  expect(settings.refillWhenEmpty === false, "an exhausted sheet must fail loudly");
  expect(settings.duplicateProtection === true, "no pack shows the same card twice");
  expect(
    settings.name === undefined,
    "no cube name was given, so none is written",
  );
  const named = parse(
    toDraftmancerCubeFile([card()], { cubeName: "My Cube" }).text,
  ).settings;
  expect(named.name === "My Cube", `the cube name is carried, got ${named.name}`);
}

// --- separate reserved slots get their own slots and sheets ------------------
{
  scenario();
  const file = toDraftmancerCubeFile(
    [
      card({ id: "a", section: "main" }),
      card({ id: "b", section: "legends", type: "Legend" }),
      card({ id: "c", section: "battlefields", type: "Battlefield" }),
    ],
    { config: config({ legendSlots: 2, battlefieldSlots: 1, legendOrBattlefieldSlots: 0 }) },
  );
  const { slots } = parse(file.text);
  expect(slotNamed(slots, "Legends")?.count === 2, "two legend slots");
  expect(slotNamed(slots, "Battlefields")?.count === 1, "one battlefield slot");
  expect(slotNamed(slots, "Main")?.count === 9, "main takes what is left of 12");
  expect(!slots.some((s) => s.sheets), "no weighted slot without an either-slot");
}

// --- a shuffled type folds into main and emits no sheet ----------------------
{
  scenario();
  const file = toDraftmancerCubeFile(
    [
      card({ id: "a", section: "main" }),
      card({ id: "b", section: "legends", type: "Legend" }),
      card({ id: "c", section: "battlefields", type: "Battlefield" }),
    ],
    {
      config: config({
        shuffleLegendsIntoPacks: true,
        legendOrBattlefieldSlots: 0,
        battlefieldSlots: 1,
      }),
    },
  );
  const { slots, sheets } = parse(file.text);
  expect(!slotNamed(slots, "Legends"), "a shuffled type has no slot");
  expect(!sheetNamed(sheets, "Legends"), "and no sheet — it is part of main");
  expect(
    sheetNamed(sheets, "Main")!.lines.length === 2,
    "the legend is dealt from the main pile",
  );
  expect(file.legendCount === 0, "and is not counted as a reserved legend");
}

// --- a reserved type the cube hasn't got falls back to main, and says so -----
{
  scenario();
  const file = toDraftmancerCubeFile([card({ id: "a", section: "main" })], {
    config: config({ legendOrBattlefieldSlots: 1 }),
  });
  const { slots, sheets } = parse(file.text);
  expect(slots.length === 1, `only a main slot survives, got ${slots.length}`);
  expect(slotNamed(slots, "Main")!.count === 12, "the freed slot goes back to main");
  expect(sheets.length === 1, "and no empty sheet is emitted");
  expect(
    file.warnings.some((w) => w.includes("no legends or battlefields")),
    "the user is told why",
  );
}

// --- the either-slot with only one type available ----------------------------
{
  scenario();
  const file = toDraftmancerCubeFile(
    [
      card({ id: "a", section: "main" }),
      card({ id: "b", section: "legends", type: "Legend" }),
    ],
    { config: config({ legendOrBattlefieldSlots: 1 }) },
  );
  const { slots, sheets } = parse(file.text);
  const either = slots.find((s) => s.sheets)!;
  expect(either.sheets!.length === 1, "it draws only from the type that exists");
  expect(either.sheets![0].name === "Legends", "which is Legends here");
  expect(!sheetNamed(sheets, "Battlefields"), "no empty battlefield sheet");
  expect(
    file.warnings.some((w) => w.includes("can only draw legends")),
    "and that is reported rather than silently narrowing the slot",
  );
}

// --- no slot may reference a sheet that was not emitted ----------------------
{
  scenario();
  for (const cfg of [
    config(),
    config({ legendSlots: 1, battlefieldSlots: 1, legendOrBattlefieldSlots: 0 }),
    config({ shuffleLegendsIntoPacks: true, legendOrBattlefieldSlots: 0 }),
    config({ shuffleBattlefieldsIntoPacks: true, legendOrBattlefieldSlots: 0 }),
  ]) {
    const { slots, sheets } = parse(
      toDraftmancerCubeFile(
        [
          card({ id: "a", section: "main" }),
          card({ id: "b", section: "legends", type: "Legend" }),
          card({ id: "c", section: "battlefields", type: "Battlefield" }),
        ],
        { config: cfg },
      ).text,
    );
    const emitted = new Set(sheets.map((s) => s.name));
    for (const slot of slots) {
      for (const name of slot.sheets?.map((s) => s.name) ?? [slot.name]) {
        expect(emitted.has(name), `slot references sheet "${name}", which is not emitted`);
      }
    }
    for (const sheet of sheets) {
      expect(sheet.lines.length > 0, `sheet "${sheet.name}" is empty`);
    }
  }
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
  const oracle = parse(file.text).customCards[0].oracle_text as string;

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
    card({ id: "d", name: "Fieldy", section: "battlefields", type: "Battlefield" }),
  ]);
  const { customCards, sheets } = parse(file.text);

  expect(file.cardCount === 6, `copies, not rows: expected 6, got ${file.cardCount}`);
  expect(
    sheetNamed(sheets, "Main")!.lines.includes("3 Triple"),
    `quantity must lead the line, got ${JSON.stringify(sheetNamed(sheets, "Main")!.lines)}`,
  );

  // The property the whole format rests on: Draftmancer looks sheet lines up in
  // [CustomCards] by name, and an unresolved one is a card that never appears.
  const defined = new Set(customCards.map((c) => c.name as string));
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

// --- a cube too small for the session is warned about, not silently dealt ----
{
  scenario();
  // 8 players × 3 packs × 11 main = 264, and this cube has one.
  const file = toDraftmancerCubeFile([
    card({ id: "a", section: "main" }),
    card({ id: "b", section: "legends", type: "Legend" }),
    card({ id: "c", section: "battlefields", type: "Battlefield" }),
  ]);
  expect(
    file.warnings.some((w) => w.includes("264")),
    `the shortfall should be stated in cards, got ${JSON.stringify(file.warnings)}`,
  );
}

// --- the plan matches the file it describes ----------------------------------
{
  scenario();
  const cards = [
    card({ id: "a", section: "main", quantity: 2 }),
    card({ id: "b", section: "legends", type: "Legend" }),
    card({ id: "c", section: "runes", type: "Rune" }),
  ];
  const cfg = config({ legendSlots: 1, legendOrBattlefieldSlots: 0 });
  const plan = draftmancerPlan(cards, cfg);
  const file = toDraftmancerCubeFile(cards, { config: cfg });
  expect(
    plan.cardCount === file.cardCount &&
      plan.mainCount === file.mainCount &&
      plan.legendCount === file.legendCount &&
      plan.mainPerPack === file.mainPerPack,
    "the panel's summary must agree with the file it offers",
  );
  expect(plan.mainCount === 2, `main copies should be 2, got ${plan.mainCount}`);
  expect(plan.legendPerPack === 1, "the legend slot survives into the plan");
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
