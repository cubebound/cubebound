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
  totalMainCardsNeeded,
  type DraftConfig,
} from "../src/lib/draft/config";
import { applyPick, createDraft } from "../src/lib/draft/engine";
import { generatePacks, type DraftPools, type PoolEntry } from "../src/lib/draft/packs";
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
      // Derive the step from the configured direction *name*, never from the
      // engine's own helper — asserting through directionStep would verify the
      // engine against itself and pass even if it stopped alternating.
      const step = config.passDirections[round] === "left" ? 1 : -1;
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
  config.passDirections.slice(0, 3).join(",") === "left,right,left",
  `default passing should be left,right,left, got ${config.passDirections.join(",")}`,
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

console.log(
  `draft: ${config.seats} seats × ${config.packsPerPlayer} packs of ${config.packSize} ` +
    `(${mainSlotsPerPack(config)} main + ${config.legendOrBattlefieldSlots} L/B), ` +
    `${run.log.length} picks, pools of ${run.state.pools[0].length}`,
);
console.log(failures.length ? `\nFAILURES:\n - ${failures.join("\n - ")}` : "draft check passed");
process.exit(failures.length ? 1 : 0);
