/**
 * Drives a full seeded 8-seat draft through the real engine.
 *
 * Pure: it builds its own pool rather than reading a cube, so it needs no
 * database and runs in CI. That also makes the fixture say what it is testing —
 * quantities above one, a colourless card, and enough legends and battlefields
 * to fill every guaranteed slot — instead of depending on whatever a live cube
 * happens to contain today.
 *
 *   npm run check:draft
 */
import { chooseBotPick, isInDomain } from "../src/lib/draft/bots";
import {
  DEFAULT_DRAFT_CONFIG,
  finalPoolSize,
  mainSlotsPerPack,
  canUseEitherSlot,
  passDirectionForRound,
  totalMainCardsNeeded,
  validateDraftConfig,
  type DraftConfig,
} from "../src/lib/draft/config";
import { applyPick, createDraft } from "../src/lib/draft/engine";
import {
  buildMainPool,
  generatePacks,
  type DraftPools,
  type PoolEntry,
} from "../src/lib/draft/packs";
import { createRng } from "../src/lib/draft/rng";

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const DOMAINS = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"];
const config: DraftConfig = DEFAULT_DRAFT_CONFIG;

/**
 * A pool comfortably larger than the draft needs, with deliberate quantities
 * above one so "at most its quantity" is actually exercised.
 */
function buildPools(): DraftPools {
  const main: PoolEntry[] = [];
  const needed = totalMainCardsNeeded(config);
  let copies = 0;
  let index = 0;
  while (copies < needed + 40) {
    // Every seventh card is a triple, every third a pair, the rest singletons.
    const quantity = index % 7 === 0 ? 3 : index % 3 === 0 ? 2 : 1;
    const domains =
      index % 11 === 0
        ? [] // colourless: a bot must never treat this as in-domain
        : index % 5 === 0
          ? [DOMAINS[index % 6], DOMAINS[(index + 2) % 6]]
          : [DOMAINS[index % 6]];
    main.push({
      card: { id: `MAIN-${index}`, name: `Main Card ${index}`, type: "Unit", domains },
      quantity,
    });
    copies += quantity;
    index++;
  }

  const legends: PoolEntry[] = Array.from({ length: 14 }, (_, i) => ({
    card: {
      id: `LEG-${i}`,
      name: `Legend ${i}`,
      type: "Legend",
      domains: [DOMAINS[i % 6], DOMAINS[(i + 3) % 6]],
    },
    quantity: i % 4 === 0 ? 2 : 1,
  }));

  const battlefields: PoolEntry[] = Array.from({ length: 12 }, (_, i) => ({
    card: { id: `BF-${i}`, name: `Battlefield ${i}`, type: "Battlefield", domains: [] },
    quantity: 1,
  }));

  return { main, legends, battlefields };
}

const pools = buildPools();

/** Singleton entries of one type, for the configurable-slot cases below, where
 *  the interesting variable is the slot counts rather than the quantities. */
function makeEntries(prefix: string, count: number, type: string): PoolEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    card: {
      id: `${prefix}-${i}`,
      name: `${prefix} ${i}`,
      type,
      domains: [DOMAINS[i % 6]],
    },
    quantity: 1,
  }));
}

function quantityOf(pools: DraftPools, id: string): number {
  for (const section of [pools.main, pools.legends, pools.battlefields]) {
    const entry = section.find((e) => e.card.id === id);
    if (entry) return entry.quantity;
  }
  return 0;
}

/** Runs a complete draft, choosing the human's picks from a seeded stream. */
function runDraft(seed: string) {
  const generated = generatePacks(config, pools, seed);
  if (!generated.ok) throw new Error(`pack generation failed: ${generated.error}`);

  let state = createDraft({ config, packs: generated.packs, seed });
  const log: { seat: number; round: number; pickNumber: number; cardId: string }[] = [];
  const humanRng = createRng(seed, "human-choices");

  // Everything the assertions need to look back at, captured as we go.
  const passObservations: { ok: boolean; round: number; pickNumber: number }[] = [];
  const botObservations: { inDomainAvailable: boolean; pickedInDomain: boolean }[] = [];

  let guard = 0;
  while (state.status === "active") {
    if (guard++ > 10_000) throw new Error("draft did not terminate");

    const before = state.packs.map((pack) => pack.map((card) => card.id));
    const committedBefore = state.committed.map((c) => (c ? [...c] : null));
    const { round, pickNumber } = state;

    const pack = state.packs[state.humanSeat];
    const choice = humanRng.pick(pack);
    if (!choice) throw new Error("human pack was empty while the draft was active");

    const result = applyPick(state, choice.id);

    for (const pick of result.picks) {
      log.push({ seat: pick.seat, round: pick.round, pickNumber: pick.pickNumber, cardId: pick.card.id });

      if (pick.seat === state.humanSeat) continue;
      const seatPack = state.packs[pick.seat];
      const committed = committedBefore[pick.seat];
      if (committed && committed.length > 0) {
        const available = seatPack.filter((card) => isInDomain(card, committed));
        botObservations.push({
          inDomainAvailable: available.length > 0,
          pickedInDomain: isInDomain(pick.card, committed),
        });
      }
      // The engine's bot choice must equal the pure function's, called cold.
      const expectedChoice = chooseBotPick(
        seatPack,
        committed,
        seed,
        round,
        pickNumber,
        pick.seat,
      );
      if (expectedChoice && expectedChoice.id !== pick.card.id) {
        failures.push(
          `bot at seat ${pick.seat} picked ${pick.card.id}, but chooseBotPick says ${expectedChoice.id}`,
        );
      }
    }

    // Passing: the pack that was at seat (s - step) should now be at seat s,
    // minus whatever that seat took from it.
    const after = result.state.packs.map((pack) => pack.map((card) => card.id));
    const openedNewRound = result.state.round !== round;
    if (!openedNewRound) {
      // Restate the alternation rule here rather than calling the engine's
      // helper: asserting through `directionForRound` would verify the engine
      // against itself and pass even if it stopped alternating. Round 0 goes
      // left, and it flips every round after.
      const step = round % 2 === 0 ? 1 : -1;
      const seats = config.seats;
      let ok = true;
      for (let seat = 0; seat < seats; seat++) {
        const from = (((seat - step) % seats) + seats) % seats;
        const taken = log.find(
          (l) => l.round === round && l.pickNumber === pickNumber && l.seat === from,
        );
        const expected = before[from].filter((id) => id !== taken?.cardId);
        // One copy removed, not every copy of a duplicated id.
        const expectedCounts = before[from].slice();
        const at = expectedCounts.indexOf(taken?.cardId ?? "");
        if (at >= 0) expectedCounts.splice(at, 1);
        const same =
          after[seat].length === expectedCounts.length &&
          after[seat].every((id, i) => id === expectedCounts[i]);
        if (!same) ok = false;
        void expected;
      }
      passObservations.push({ ok, round, pickNumber });
    }

    state = result.state;
  }

  return { state, log, generated, passObservations, botObservations };
}

const SEED = "check-draft-seed-1";
const run = runDraft(SEED);

// --- 1. Quantity is never exceeded across the whole draft --------------------
const dealtCounts = new Map<string, number>();
for (const round of run.generated.packs) {
  for (const pack of round) {
    for (const card of pack) dealtCounts.set(card.id, (dealtCounts.get(card.id) ?? 0) + 1);
  }
}
const overdealt = [...dealtCounts.entries()].filter(([id, n]) => n > quantityOf(pools, id));
expect(
  overdealt.length === 0,
  `no card may be dealt more than its quantity; over-dealt: ${overdealt
    .slice(0, 5)
    .map(([id, n]) => `${id} ${n}/${quantityOf(pools, id)}`)
    .join(", ")}`,
);

// --- 2. Every pack matches the template -------------------------------------
const packSizes = new Set<number>();
let packsWithWrongLb = 0;
for (const round of run.generated.packs) {
  for (const pack of round) {
    packSizes.add(pack.length);
    const lb = pack.filter((c) => c.type === "Legend" || c.type === "Battlefield").length;
    if (lb !== config.legendOrBattlefieldSlots) packsWithWrongLb++;
  }
}
expect(
  packSizes.size === 1 && packSizes.has(config.packSize),
  `every pack should hold ${config.packSize} cards, saw sizes ${[...packSizes].join(", ")}`,
);
expect(
  packsWithWrongLb === 0,
  `every pack should hold exactly ${config.legendOrBattlefieldSlots} legend/battlefield ` +
    `card with this fixture (it has enough of both); ${packsWithWrongLb} did not`,
);
expect(
  run.generated.warnings.length === 0,
  `a pool this size should raise no warnings, got: ${run.generated.warnings.join(" | ")}`,
);
const totalDealt = config.seats * config.packsPerPlayer * config.packSize;
expect(
  [...dealtCounts.values()].reduce((a, b) => a + b, 0) === totalDealt,
  "the dealt cards should total seats × packs × packSize",
);

// --- 3. Passing alternates left, right, left --------------------------------
expect(
  [0, 1, 2, 3, 4].map((r) => passDirectionForRound(config, r)).join(",") ===
    "left,right,left,right,left",
  `passing should alternate from left for any number of rounds, got ` +
    `${[0, 1, 2, 3, 4].map((r) => passDirectionForRound(config, r)).join(",")}`,
);
const badPasses = run.passObservations.filter((o) => !o.ok);
expect(
  badPasses.length === 0,
  `packs must move one seat in the round's direction each pick; ${badPasses.length} pick(s) ` +
    `passed wrongly (first at round ${badPasses[0]?.round}, pick ${badPasses[0]?.pickNumber})`,
);

// --- 4. Bots stay in-domain when the pack allows ----------------------------
const missedInDomain = run.botObservations.filter((o) => o.inDomainAvailable && !o.pickedInDomain);
expect(
  missedInDomain.length === 0,
  `a bot must take an in-domain card whenever one is in the pack; ${missedInDomain.length} did not`,
);
expect(
  run.botObservations.some((o) => o.inDomainAvailable),
  "the fixture should actually offer bots in-domain choices, or this proves nothing",
);

// --- 5. Final pools are exactly packs × packSize ----------------------------
const expectedPool = finalPoolSize(config);
const wrongPools = run.state.pools
  .map((pool, seat) => ({ seat, size: pool.length }))
  .filter((p) => p.size !== expectedPool);
expect(
  wrongPools.length === 0,
  `every seat should end with ${expectedPool} cards; wrong: ${wrongPools
    .map((p) => `seat ${p.seat}=${p.size}`)
    .join(", ")}`,
);
expect(run.state.status === "complete", "the draft should end complete");

// --- 6. The same seed reproduces the identical draft ------------------------
const rerun = runDraft(SEED);
expect(
  JSON.stringify(rerun.log) === JSON.stringify(run.log),
  "the same seed must reproduce an identical pick log",
);
const other = runDraft("a-different-seed");
expect(
  JSON.stringify(other.log) !== JSON.stringify(run.log),
  "a different seed should produce a different draft, or the seed is being ignored",
);

// --- 7. The blocking rule ---------------------------------------------------
const tiny = generatePacks(config, { main: pools.main.slice(0, 3), legends: [], battlefields: [] }, SEED);
expect(tiny.ok === false, "a main section too small to fill the packs must block the draft");
if (!tiny.ok) {
  expect(
    tiny.error.includes(String(totalMainCardsNeeded(config))),
    `the block message should state how many cards are needed, got: ${tiny.error}`,
  );
}

// A cube with no legends or battlefields still drafts, with a warning.
const noLb = generatePacks(config, { main: pools.main, legends: [], battlefields: [] }, SEED);
expect(noLb.ok === true, "a cube with no legends or battlefields should still draft");
if (noLb.ok) {
  expect(
    noLb.warnings.length > 0,
    "filling legend/battlefield slots from main must warn rather than pass silently",
  );
  const sizes = new Set(noLb.packs.flat().map((p) => p.length));
  expect(
    sizes.size === 1 && sizes.has(config.packSize),
    "fallback packs should still be full size",
  );
}

// --- configurable slots -------------------------------------------------------
// Every setting the start screen offers, and the rule each one must obey.

/** A pool big enough that nothing runs short unless a case means it to. */
const bigPools = (): DraftPools => ({
  main: makeEntries("M", 600, "Unit"),
  legends: makeEntries("L", 200, "Legend"),
  battlefields: makeEntries("B", 200, "Battlefield"),
});

const typesIn = (packs: { type: string }[][][]) => {
  const counts = new Map<string, number>();
  for (const card of packs.flat().flat()) {
    counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
  }
  return counts;
};

{
  // Dedicated slots deliver exactly what was reserved, in every pack.
  const custom: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 4,
    packsPerPlayer: 2,
    packSize: 10,
    legendSlots: 2,
    battlefieldSlots: 3,
    legendOrBattlefieldSlots: 0,
  };
  const dealt = generatePacks(custom, bigPools(), "slots");
  expect(dealt.ok === true, "a fully supplied custom config should deal");
  if (dealt.ok) {
    expect(
      dealt.warnings.length === 0,
      `no warnings expected with a big pool, got: ${dealt.warnings.join(" | ")}`,
    );
    expect(
      dealt.packs.length === 2 && dealt.packs[0].length === 4,
      "the grid should be rounds by seats as configured",
    );
    const sizes = new Set(dealt.packs.flat().map((pack) => pack.length));
    expect(sizes.size === 1 && sizes.has(10), `every pack should hold 10, got ${[...sizes]}`);

    for (const pack of dealt.packs.flat()) {
      const legends = pack.filter((c) => c.type === "Legend").length;
      const fields = pack.filter((c) => c.type === "Battlefield").length;
      expect(legends === 2, `each pack should hold exactly 2 legends, got ${legends}`);
      expect(fields === 3, `each pack should hold exactly 3 battlefields, got ${fields}`);
    }
    expect(
      (typesIn(dealt.packs).get("Unit") ?? 0) === 4 * 2 * 5,
      `main slots should fill the remainder, got ${typesIn(dealt.packs).get("Unit")}`,
    );
  }
}

{
  // Legends and battlefields reach a pack ONLY through a reserved slot. With
  // none reserved none may appear, even though the cube holds plenty and some
  // are filed in the main section.
  const pools: DraftPools = {
    main: [
      ...makeEntries("M", 200, "Unit"),
      ...makeEntries("StrayL", 5, "Legend"),
      ...makeEntries("StrayB", 5, "Battlefield"),
    ],
    legends: makeEntries("L", 50, "Legend"),
    battlefields: makeEntries("B", 50, "Battlefield"),
  };
  const noReserved: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 4,
    packsPerPlayer: 1,
    packSize: 8,
    legendSlots: 0,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 0,
  };
  const dealt = generatePacks(noReserved, pools, "none");
  expect(dealt.ok === true, "reserving nothing should still deal");
  if (dealt.ok) {
    const counts = typesIn(dealt.packs);
    expect(
      !counts.has("Legend") && !counts.has("Battlefield"),
      `with no reserved slots neither type may appear, got ${counts.get("Legend") ?? 0} ` +
        `legends and ${counts.get("Battlefield") ?? 0} battlefields`,
    );
    expect(
      dealt.warnings.some((w) => w.includes("main section")),
      "dropping legends or battlefields filed in main must be reported, not silent",
    );
  }

  const filtered = buildMainPool(pools, noReserved);
  expect(filtered.removed === 10, `10 stray cards should be removed, got ${filtered.removed}`);
  expect(
    filtered.pool.every((e: PoolEntry) => e.card.type === "Unit"),
    "nothing of a reserved type may survive the main-pool filter",
  );
}

// --- shuffled into the packs --------------------------------------------------
{
  const pools: DraftPools = {
    main: [
      ...makeEntries("M", 200, "Unit"),
      ...makeEntries("StrayL", 4, "Legend"),
    ],
    legends: makeEntries("L", 30, "Legend"),
    battlefields: makeEntries("B", 40, "Battlefield"),
  };

  // Shuffling a type in folds its whole section into the main pile, and stops
  // strays of that type being dropped — there is no reserved count to protect.
  const shuffled = buildMainPool(pools, {
    ...DEFAULT_DRAFT_CONFIG,
    legendSlots: 0,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 0,
    shuffleLegendsIntoPacks: true,
  });
  expect(
    shuffled.removed === 0,
    `a shuffled type's strays stay put, got ${shuffled.removed} removed`,
  );
  expect(
    shuffled.pool.length === 200 + 4 + 30,
    `main should gain the legends section, got ${shuffled.pool.length}`,
  );
  expect(
    shuffled.shuffledIn.join(",") === "legends",
    `what was folded in should be reported, got ${shuffled.shuffledIn.join(",")}`,
  );
  // Battlefields are still reserved here, so they stay out of main.
  expect(
    shuffled.pool.every((e: PoolEntry) => e.card.type !== "Battlefield"),
    "a type that is still reserved must not be shuffled in as well",
  );

  const both = buildMainPool(pools, {
    ...DEFAULT_DRAFT_CONFIG,
    legendSlots: 0,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 0,
    shuffleLegendsIntoPacks: true,
    shuffleBattlefieldsIntoPacks: true,
  });
  expect(
    both.pool.length === 200 + 4 + 30 + 40,
    `both sections should fold in, got ${both.pool.length}`,
  );

  // Dealt for real: legends turn up in ordinary slots, and never twice.
  const config: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 4,
    packsPerPlayer: 2,
    packSize: 10,
    legendSlots: 0,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 0,
    shuffleLegendsIntoPacks: true,
  };
  const dealt = generatePacks(config, pools, "shuffled");
  expect(dealt.ok === true, "a shuffled config should deal");
  if (dealt.ok) {
    const counts = typesIn(dealt.packs);
    expect(
      (counts.get("Legend") ?? 0) > 0,
      "legends shuffled in should actually appear in packs",
    );
    expect(
      !counts.has("Battlefield"),
      "battlefields are still reserved with zero slots, so none may appear",
    );
    // Without replacement still holds across the merged pile.
    const ids = dealt.packs.flat().flat().map((c) => c.id);
    expect(new Set(ids).size === ids.length, "no card may be dealt twice from the merged pool");
    expect(
      dealt.warnings.some((w) => w.includes("shuffled into the packs")),
      "shuffling a section in should be reported",
    );
  }

  // The reserved deck is emptied when a type is shuffled, and *that* is what
  // stops a card being dealt from both piles. `validateDraftConfig` normally
  // makes the combination unreachable, so the guard is only exercised by
  // building the incoherent config on purpose — which a future caller of
  // `generatePacks` could do, since it does not validate.
  const contradictory: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 4,
    packsPerPlayer: 2,
    packSize: 10,
    legendSlots: 2,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 1,
    shuffleLegendsIntoPacks: true,
  };
  expect(
    validateDraftConfig(contradictory).length > 0,
    "the contradictory config must be one validation rejects",
  );
  const doubled = generatePacks(contradictory, pools, "nodouble");
  expect(doubled.ok === true, "it should still deal rather than throw");
  if (doubled.ok) {
    const ids = doubled.packs.flat().flat().map((c) => c.id);
    expect(
      new Set(ids).size === ids.length,
      `a shuffled type must not also be dealt from its reserved deck — ` +
        `${ids.length - new Set(ids).size} card(s) appeared twice`,
    );
  }
}

{
  // Reserved and shuffled are one choice, not two settings.
  const bad = (patch: Partial<DraftConfig>) =>
    validateDraftConfig({ ...DEFAULT_DRAFT_CONFIG, ...patch }).length > 0;
  expect(
    bad({ shuffleLegendsIntoPacks: true, legendSlots: 1, legendOrBattlefieldSlots: 0 }),
    "legends cannot be reserved and shuffled at once",
  );
  expect(
    bad({ shuffleBattlefieldsIntoPacks: true, battlefieldSlots: 2, legendOrBattlefieldSlots: 0 }),
    "battlefields cannot be reserved and shuffled at once",
  );
  expect(
    bad({ shuffleLegendsIntoPacks: true, legendSlots: 0 }),
    "the default either-slot must be rejected once legends are shuffled in",
  );
  expect(
    bad({ shuffleBattlefieldsIntoPacks: true, battlefieldSlots: 0 }),
    "and once battlefields are",
  );
  expect(
    !bad({
      shuffleLegendsIntoPacks: true,
      legendSlots: 0,
      legendOrBattlefieldSlots: 0,
      battlefieldSlots: 1,
    }),
    "shuffling one type while reserving the other is legal",
  );
  expect(
    canUseEitherSlot(DEFAULT_DRAFT_CONFIG),
    "the either-slot is available by default",
  );
  expect(
    !canUseEitherSlot({ ...DEFAULT_DRAFT_CONFIG, shuffleBattlefieldsIntoPacks: true }),
    "and unavailable as soon as a type is shuffled in",
  );
}

{
  // A dedicated slot never substitutes the other type: short on legends, it
  // fills from main even though battlefields are plentiful.
  const pools: DraftPools = {
    main: makeEntries("M", 400, "Unit"),
    legends: makeEntries("L", 3, "Legend"),
    battlefields: makeEntries("B", 200, "Battlefield"),
  };
  const custom: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 4,
    packsPerPlayer: 2,
    packSize: 10,
    legendSlots: 1,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 0,
  };
  const dealt = generatePacks(custom, pools, "short-legends");
  expect(dealt.ok === true, "a legend shortfall should fall back rather than block");
  if (dealt.ok) {
    const counts = typesIn(dealt.packs);
    expect(
      (counts.get("Legend") ?? 0) === 3,
      `only the 3 real legends should be dealt, got ${counts.get("Legend")}`,
    );
    expect(
      !counts.has("Battlefield"),
      "a legend slot must never take a battlefield — that type was not asked for",
    );
    expect(dealt.warnings.some((w) => w.includes("legend")), "a legend shortfall must warn");
  }
}

{
  // The flexible slot is the one that swaps.
  const pools: DraftPools = {
    main: makeEntries("M", 400, "Unit"),
    legends: [],
    battlefields: makeEntries("B", 200, "Battlefield"),
  };
  const custom: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 4,
    packsPerPlayer: 1,
    packSize: 10,
    legendSlots: 0,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 2,
  };
  const dealt = generatePacks(custom, pools, "flex");
  expect(dealt.ok === true, "an either-slot should deal from whichever side exists");
  if (dealt.ok) {
    expect(
      (typesIn(dealt.packs).get("Battlefield") ?? 0) === 4 * 2,
      `every either-slot should have taken a battlefield, got ` +
        `${typesIn(dealt.packs).get("Battlefield")}`,
    );
    expect(dealt.warnings.length === 0, "swapping inside an either-slot is not a shortfall");
  }
}

{
  // Main has to cover its own slots and any fallback, or the deal blocks.
  const tooBig: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 8,
    packsPerPlayer: 3,
    packSize: 12,
    legendSlots: 2,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 0,
  };
  const thin: DraftPools = {
    main: makeEntries("M", 240, "Unit"),
    legends: makeEntries("L", 10, "Legend"),
    battlefields: [],
  };
  const dealt = generatePacks(tooBig, thin, "thin");
  expect(dealt.ok === false, "main must cover the legend shortfall too, or blocking is wrong");
  if (!dealt.ok) {
    expect(
      dealt.error.includes("278"),
      `the error should state the real requirement, got: ${dealt.error}`,
    );
  }
}

{
  // More than three packs used to throw: directions were a fixed 3-array.
  const long: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    seats: 2,
    packsPerPlayer: 5,
    packSize: 4,
    legendSlots: 0,
    battlefieldSlots: 0,
    legendOrBattlefieldSlots: 0,
  };
  const dealt = generatePacks(long, bigPools(), "long");
  expect(dealt.ok === true, "five packs should deal");
  if (dealt.ok) {
    let running = createDraft({ config: long, packs: dealt.packs, seed: "long" });
    let picks = 0;
    while (running.status === "active" && picks < 500) {
      running = applyPick(running, running.packs[running.humanSeat][0].id).state;
      picks += 1;
    }
    expect(running.status === "complete", "a five-pack draft should run to completion");
    expect(
      running.pools[0].length === finalPoolSize(long),
      `a seat should finish with ${finalPoolSize(long)} cards, got ${running.pools[0].length}`,
    );
  }
}

{
  // Bounds are the server's rule, not the form's.
  const bad = (patch: Partial<DraftConfig>) =>
    validateDraftConfig({ ...DEFAULT_DRAFT_CONFIG, ...patch }).length > 0;
  expect(bad({ seats: 1 }), "one seat has nobody to pass to");
  expect(bad({ seats: 9 }), "nine seats is over the cap");
  expect(bad({ packsPerPlayer: 0 }), "zero packs is not a draft");
  expect(bad({ packSize: 0 }), "zero cards is not a pack");
  expect(bad({ seats: 2.5 }), "fractional seats are not a thing");
  expect(bad({ legendSlots: -1 }), "negative slots are not a thing");
  expect(
    bad({ packSize: 4, legendSlots: 3, battlefieldSlots: 3 }),
    "reserved slots must fit inside the pack",
  );
  expect(
    !bad({ packSize: 6, legendSlots: 3, battlefieldSlots: 3, legendOrBattlefieldSlots: 0 }),
    "reserving the whole pack is odd but legal",
  );
  expect(
    validateDraftConfig(DEFAULT_DRAFT_CONFIG).length === 0,
    "the default config must be valid",
  );
}

{
  // A draft dealt before directions were derived still replays with the ones it
  // stored, so nothing in flight can drift.
  const legacy: DraftConfig = {
    ...DEFAULT_DRAFT_CONFIG,
    passDirections: ["right", "right", "right"],
  };
  expect(
    [0, 1, 2].map((r) => passDirectionForRound(legacy, r)).join(",") === "right,right,right",
    "a stored direction list must win over the derivation",
  );
  expect(
    passDirectionForRound(legacy, 3) === "right",
    "and past its end the derivation takes over",
  );
}

console.log(
  `draft: ${config.seats} seats × ${config.packsPerPlayer} packs of ${config.packSize} ` +
    `(${mainSlotsPerPack(config)} main + ${config.legendOrBattlefieldSlots} L/B), ` +
    `${run.log.length} picks, pools of ${run.state.pools[0].length}`,
);
console.log(failures.length ? `\nFAILURES:\n - ${failures.join("\n - ")}` : "draft check passed");
process.exit(failures.length ? 1 : 0);
