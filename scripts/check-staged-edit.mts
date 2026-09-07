/**
 * Guards the edit panel's staging rules.
 *
 * The panel accumulates changes and writes them in one batch, which means one
 * function decides what a session of clicking actually does to the cube. The
 * failures it can have are all silent ones: a batch that drops an edit, applies
 * one twice, or - worst - produces two rows for the same (card, section), which
 * Postgres refuses inside a single `ON CONFLICT DO UPDATE`, so the whole save
 * fails on a constraint rather than on anything the user did.
 *
 * All of it is pure, so none of this needs a browser, a session or a database.
 *
 * Needs nothing. Runs in CI.
 *
 *   npm run check:staged-edit
 */
import {
  cardIdsInPlan,
  MAX_STAGED_ROWS,
  planStagedEdits,
  printingLabel,
  sectionForBoard,
  type StagedEditRow,
} from "../src/lib/staged-edit";

const MAX_QUANTITY = 99;
const failures: string[] = [];
let checks = 0;

function expect(what: string, actual: unknown, expected: unknown): void {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${what}: expected ${e}, got ${a}`);
}

function expectTrue(what: string, value: boolean): void {
  checks += 1;
  if (!value) failures.push(what);
}

function plan(rows: Partial<StagedEditRow>[]) {
  return planStagedEdits(rows as StagedEditRow[], MAX_QUANTITY);
}

function ok(rows: Partial<StagedEditRow>[]) {
  const result = plan(rows);
  if (!result.ok) throw new Error(`expected a plan, got error: ${result.error}`);
  return result;
}

function err(rows: Partial<StagedEditRow>[]): string {
  const result = plan(rows);
  return result.ok ? "" : result.error;
}

const add = (cardId: string, section = "main", quantity = 1) => ({
  op: "add" as const,
  cardId,
  section,
  quantity,
});
const remove = (cardId: string, section = "main", quantity = 1) => ({
  op: "remove" as const,
  cardId,
  section,
  quantity,
});

/* ── Board mapping ────────────────────────────────────────────────────── */
// Mainboard is not a section: it means "file it the way the cube files
// things", which is what keeps the two-board control honest against six
// sections. If this drifts, a Legend silently lands in `main` and stops being
// drafted as a legend.
expect("Legend on mainboard files to legends", sectionForBoard("mainboard", "Legend"), "legends");
expect("Rune on mainboard files to runes", sectionForBoard("mainboard", "Rune"), "runes");
expect(
  "Battlefield on mainboard files to battlefields",
  sectionForBoard("mainboard", "Battlefield"),
  "battlefields",
);
expect("Unit on mainboard files to main", sectionForBoard("mainboard", "Unit"), "main");
expect("Spell on mainboard files to main", sectionForBoard("mainboard", "Spell"), "main");
// The maybeboard is a shortlist, so it takes everything regardless of type.
expect("Legend on maybeboard stays there", sectionForBoard("maybeboard", "Legend"), "maybeboard");
expect("Unit on maybeboard stays there", sectionForBoard("maybeboard", "Unit"), "maybeboard");

/* ── Collapsing: the ON CONFLICT rule ─────────────────────────────────── */
// addCubeCards upserts every add in one statement, and Postgres will not let a
// single ON CONFLICT DO UPDATE touch one row twice. Two adds of the same
// printing to the same section must therefore arrive as one row.
{
  const { plan: p } = ok([add("OGN-001"), add("OGN-001")]);
  expect("two adds of one printing collapse to one row", p.adds, [
    { cardId: "OGN-001", section: "main", quantity: 2 },
  ]);
}
{
  const { plan: p } = ok([add("OGN-001", "main"), add("OGN-001", "sideboard")]);
  expectTrue("the same card in two sections stays two rows", p.adds.length === 2);
}
{
  const { plan: p } = ok([add("OGN-001"), add("OGN-002"), remove("OGN-003")]);
  const keys = p.adds.map((row) => `${row.cardId}|${row.section}`);
  expect("distinct cards stay distinct", keys, ["OGN-001|main", "OGN-002|main"]);
  expect("removes are separate from adds", p.removes.length, 1);
}
// Every plan the action can produce must be unique on (cardId, section), or the
// save fails on a constraint instead of on anything the reader did.
{
  const { plan: p } = ok([
    add("OGN-001"),
    add("OGN-001"),
    add("OGN-001", "sideboard"),
    add("OGN-002"),
  ]);
  const keys = p.adds.map((row) => `${row.cardId}|${row.section}`);
  expect("no duplicate upsert targets", keys.length, new Set(keys).size);
}

/* ── Netting ──────────────────────────────────────────────────────────── */
// Adding a card and taking it back out again did not change the cube, so it
// must write nothing and log nothing - two entries describing no net effect is
// a worse record than no entry at all.
expect(
  "adding then removing the same printing cancels",
  err([add("OGN-001"), remove("OGN-001")]),
  "Those changes cancel out, so there's nothing to save.",
);
// But two *different* printings are a real change, even though it is the same
// card - that is a swap of one art for another and the reader means it.
{
  const { plan: p } = ok([add("OGN-001a"), remove("OGN-001")]);
  expect("different printings do not cancel", p.adds.length + p.removes.length, 2);
}
// Nor do the same printing in different sections: that is a move.
{
  const { plan: p } = ok([add("OGN-001", "sideboard"), remove("OGN-001", "main")]);
  expect("same printing across sections does not cancel", p.adds.length + p.removes.length, 2);
}
{
  const { plan: p } = ok([add("OGN-001", "main", 3), remove("OGN-001", "main", 1)]);
  expect("partial cancellation leaves the remainder", p.adds, [
    { cardId: "OGN-001", section: "main", quantity: 2 },
  ]);
  expect("and writes no remove", p.removes.length, 0);
}
{
  const { plan: p } = ok([add("OGN-001", "main", 1), remove("OGN-001", "main", 3)]);
  expect("netting can flip an add into a remove", p.removes, [
    { cardId: "OGN-001", section: "main", quantity: 2 },
  ]);
  expect("and writes no add", p.adds.length, 0);
}

/* ── Quantity bounds ──────────────────────────────────────────────────── */
expect("quantity 0 is refused", err([add("OGN-001", "main", 0)]), "A staged change had an invalid quantity.");
expect("negative quantity is refused", err([add("OGN-001", "main", -2)]), "A staged change had an invalid quantity.");
expect(
  "quantity above the cap is refused",
  err([add("OGN-001", "main", MAX_QUANTITY + 1)]),
  "A staged change had an invalid quantity.",
);
{
  const { plan: p } = ok([add("OGN-001", "main", 60), add("OGN-001", "main", 60)]);
  expect("collapsed quantities clamp at the cap", p.adds[0].quantity, MAX_QUANTITY);
}

/* ── Replaces ─────────────────────────────────────────────────────────── */
{
  const { plan: p } = ok([
    { op: "replace", cardId: "OGN-001a", fromCardId: "OGN-001", section: "main", quantity: 1 },
  ]);
  expect("a replace carries both sides", p.replaces, [
    { fromCardId: "OGN-001", toCardId: "OGN-001a", section: "main", quantity: 1 },
  ]);
}
{
  const rows: Partial<StagedEditRow>[] = [
    { op: "replace", cardId: "OGN-001a", fromCardId: "OGN-001", section: "main", quantity: 1 },
    { op: "replace", cardId: "OGN-001a", fromCardId: "OGN-001", section: "main", quantity: 1 },
  ];
  const { plan: p } = ok(rows);
  expect("identical replaces collapse", p.replaces.length, 1);
  expect("and sum their quantities", p.replaces[0].quantity, 2);
}
// A no-op swap would return false from moveOneCopy and log nothing, so it is
// refused rather than silently doing nothing.
expect(
  "replacing a printing with itself is refused",
  err([{ op: "replace", cardId: "OGN-001", fromCardId: "OGN-001", section: "main", quantity: 1 }]),
  "A staged swap replaced a printing with itself.",
);
expect(
  "a replace missing its source is refused",
  err([{ op: "replace", cardId: "OGN-001a", section: "main", quantity: 1 }]),
  "A staged swap was missing the card it replaces.",
);
expect(
  "only a swap may name a card to replace",
  err([{ op: "add", cardId: "OGN-001a", fromCardId: "OGN-001", section: "main", quantity: 1 }]),
  "Only a swap may name a card to replace.",
);

/* ── Shape validation ─────────────────────────────────────────────────── */
// These arrive from a browser, so every field is re-derived rather than
// trusted, the same way readDraftConfig rebuilds a draft config field by field.
expect("an empty batch is refused", err([]), "Nothing to save.");
expect("a non-array is refused", planStagedEdits("nope", MAX_QUANTITY).ok, false);
expect(
  "an unknown section is refused",
  err([add("OGN-001", "mainboard")]),
  "A staged change named a section that doesn't exist.",
);
expect(
  "an unknown op is refused",
  err([{ op: "delete" as never, cardId: "OGN-001", section: "main", quantity: 1 }]),
  "A staged change had an unknown kind.",
);
expect(
  "a missing card is refused",
  err([{ op: "add", cardId: "", section: "main", quantity: 1 }]),
  "A staged change was missing its card.",
);
{
  const tooMany = Array.from({ length: MAX_STAGED_ROWS + 1 }, (_, i) => add(`OGN-${i}`));
  expect(
    "a batch over the row cap is refused",
    err(tooMany),
    `A single save can carry at most ${MAX_STAGED_ROWS} changes.`,
  );
}

/* ── cardIdsInPlan ────────────────────────────────────────────────────── */
// The action re-reads every id this returns. Missing one means an unvalidated
// card id reaches a foreign key mid-batch.
{
  const { plan: p } = ok([
    add("A"),
    remove("B"),
    { op: "replace", cardId: "D", fromCardId: "C", section: "main", quantity: 1 },
  ]);
  expect("every id in the plan is offered for re-validation", cardIdsInPlan(p).sort(), [
    "A",
    "B",
    "C",
    "D",
  ]);
}

/* ── printingLabel ────────────────────────────────────────────────────── */
expect(
  "a printing reads as name plus set and number",
  printingLabel({ name: "Mother of Runes", setCode: "CMA", collectorNo: "17" }),
  "Mother of Runes [cma-17]",
);
expect(
  "a card with no printing data is just its name",
  printingLabel({ name: "Mother of Runes", setCode: null, collectorNo: null }),
  "Mother of Runes",
);

if (failures.length > 0) {
  console.error(`staged edit check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log(`staged edit check passed (${checks} cases)`);
}
process.exit(failures.length > 0 ? 1 : 0);
