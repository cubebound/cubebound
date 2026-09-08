/**
 * The edit panel stages changes and writes them in one go, and this is the part
 * that decides what "in one go" means.
 *
 * Pure and free of database imports on purpose: the `"use client"` panel and
 * the server action both import it, which is the same rule that put
 * `cardFilterParams` and `countCopies` in `src/lib/`. It also means the whole
 * of it is covered by `npm run check:staged-edit` without a browser or a
 * database.
 *
 * Staging exists for two reasons. It is how people actually edit a cube — swap
 * a card, change your mind, swap it back — and it turns what used to be one
 * write per click into one write per session. The old quick-add panel called
 * `addCardAction` per card, and a run of edits was a run of round trips against
 * a pool of six; see "Page speed" in CLAUDE.md for what that cost in
 * production.
 */

import { withChampionPrefix } from "@/lib/deck-export";
import { defaultSectionForType, isCubeSection, type CubeSection } from "@/lib/riftbound";

/**
 * One editing session, not a paste. The bulk path is the Import tab, which has
 * its own cap and its own preview-then-commit flow.
 */
export const MAX_STAGED_ROWS = 200;

/** Which board the panel is filing to. Sections are derived, never picked. */
export const EDIT_BOARDS = ["mainboard", "maybeboard"] as const;
export type EditBoard = (typeof EDIT_BOARDS)[number];

export type StagedOp = "add" | "remove" | "replace";

/**
 * What crosses to the server. Deliberately carries no display data: the action
 * re-reads every name from the database, exactly as `commitImportAction` does,
 * so the client is choosing among options rather than dictating them.
 */
export interface StagedEditRow {
  op: StagedOp;
  /** add and replace: the printing going in. remove: the printing coming out. */
  cardId: string;
  /** replace only: the printing coming out. */
  fromCardId?: string;
  section: string;
  quantity: number;
}

export interface StagedPlan {
  adds: { cardId: string; section: CubeSection; quantity: number }[];
  removes: { cardId: string; section: CubeSection; quantity: number }[];
  replaces: {
    fromCardId: string;
    toCardId: string;
    section: CubeSection;
    quantity: number;
  }[];
}

export type StagedPlanResult =
  | { ok: true; plan: StagedPlan; totalCopies: number }
  | { ok: false; error: string };

/**
 * Where a card lands, given the board the panel is set to.
 *
 * Mainboard is not a section — it means "file this the way the cube files
 * things", so a Legend still lands in `legends` and a Rune in `runes`. That
 * keeps the two-board control from the screenshots without flattening the six
 * sections the rest of the app is built on. The panel resolves this when the
 * row is staged so the staged row can *show* "Legends", rather than saying
 * "Mainboard" and doing something else.
 */
export function sectionForBoard(board: EditBoard, cardType: string): CubeSection {
  return board === "maybeboard" ? "maybeboard" : defaultSectionForType(cardType);
}

/**
 * `Name [set-collector]`, the way Cube Cobra writes a specific printing.
 *
 * The name goes through `withChampionPrefix` because a legend is stored as its
 * title alone — `Eye of Twilight`, champion `Shen`. Without it two printings of
 * one legend render as two identical rows with nothing to tell them apart but a
 * set code, and neither says whose legend it is.
 */
export function printingLabel(card: {
  id: string;
  name: string;
  champion?: string | null;
  type?: string;
}): string {
  const full = withChampionPrefix(card.name, {
    name: card.name,
    champion: card.champion ?? null,
    type: card.type ?? "",
  });
  // The card id, not set + collector number. An alt art shares its collector
  // number with the printing it varies (`VEN-138` and `VEN-138a` are both 138),
  // so the obvious label renders them as two identical rows — which is exactly
  // what "Specify versions" exists to tell apart. The id already *is*
  // set-collector plus the variant suffix, so it reads the same and is unique.
  return `${full} [${card.id.toLowerCase()}]`;
}

function quantityOf(value: unknown, maxQuantity: number): number | null {
  const quantity = Math.floor(Number(value));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > maxQuantity) return null;
  return quantity;
}

/**
 * Validates a staged batch and reduces it to the writes that actually have to
 * happen.
 *
 * The collapse is a correctness step, not tidiness. `addCubeCards` upserts in a
 * single statement, and Postgres refuses to let one `ON CONFLICT DO UPDATE`
 * touch the same row twice — so the plan has to be unique on
 * `(cardId, section)` before it ever reaches the query layer.
 *
 * Netting falls out of that for free, and gives exactly the behaviour asked
 * for: `cardId` *is* the printing, so staging +1 and −1 of the same printing in
 * the same section cancels and writes nothing, while +1 of one printing and −1
 * of another is two different keys and stays as two real changes.
 */
export function planStagedEdits(rows: unknown, maxQuantity: number): StagedPlanResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Nothing to save." };
  }
  if (rows.length > MAX_STAGED_ROWS) {
    return { ok: false, error: `A single save can carry at most ${MAX_STAGED_ROWS} changes.` };
  }

  // Adds and removes share a map keyed on (cardId, section) and carry a signed
  // quantity, which is what makes them cancel rather than both being written.
  const net = new Map<string, { cardId: string; section: CubeSection; delta: number }>();
  const replaces = new Map<string, StagedPlan["replaces"][number]>();

  for (const row of rows as StagedEditRow[]) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: "A staged change was malformed." };
    }
    if (row.op !== "add" && row.op !== "remove" && row.op !== "replace") {
      return { ok: false, error: "A staged change had an unknown kind." };
    }
    if (typeof row.cardId !== "string" || row.cardId.length === 0) {
      return { ok: false, error: "A staged change was missing its card." };
    }
    if (typeof row.section !== "string" || !isCubeSection(row.section)) {
      return { ok: false, error: "A staged change named a section that doesn't exist." };
    }
    const quantity = quantityOf(row.quantity, maxQuantity);
    if (quantity === null) {
      return { ok: false, error: "A staged change had an invalid quantity." };
    }
    const section = row.section as CubeSection;

    if (row.op === "replace") {
      if (typeof row.fromCardId !== "string" || row.fromCardId.length === 0) {
        return { ok: false, error: "A staged swap was missing the card it replaces." };
      }
      // Not merely a no-op: `moveOneCopy` would return false and log nothing,
      // so a silent nothing is worse than a refusal that says why.
      if (row.fromCardId === row.cardId) {
        return { ok: false, error: "A staged swap replaced a printing with itself." };
      }
      const key = `${row.fromCardId}|${row.cardId}|${section}`;
      const existing = replaces.get(key);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + quantity, maxQuantity);
      } else {
        replaces.set(key, {
          fromCardId: row.fromCardId,
          toCardId: row.cardId,
          section,
          quantity,
        });
      }
      continue;
    }

    if (row.fromCardId !== undefined) {
      return { ok: false, error: "Only a swap may name a card to replace." };
    }

    const key = `${row.cardId}|${section}`;
    const delta = row.op === "add" ? quantity : -quantity;
    const existing = net.get(key);
    if (existing) existing.delta += delta;
    else net.set(key, { cardId: row.cardId, section, delta });
  }

  const adds: StagedPlan["adds"] = [];
  const removes: StagedPlan["removes"] = [];
  for (const entry of net.values()) {
    if (entry.delta === 0) continue; // staged and unstaged: nothing happened.
    const quantity = Math.min(Math.abs(entry.delta), maxQuantity);
    const target = entry.delta > 0 ? adds : removes;
    target.push({ cardId: entry.cardId, section: entry.section, quantity });
  }

  const plan: StagedPlan = { adds, removes, replaces: [...replaces.values()] };
  if (plan.adds.length === 0 && plan.removes.length === 0 && plan.replaces.length === 0) {
    return { ok: false, error: "Those changes cancel out, so there's nothing to save." };
  }

  const totalCopies =
    plan.adds.reduce((sum, row) => sum + row.quantity, 0) +
    plan.removes.reduce((sum, row) => sum + row.quantity, 0) +
    plan.replaces.reduce((sum, row) => sum + row.quantity, 0);

  return { ok: true, plan, totalCopies };
}

/** Every card id a plan mentions, for the server's one re-validation read. */
export function cardIdsInPlan(plan: StagedPlan): string[] {
  const ids = new Set<string>();
  for (const row of plan.adds) ids.add(row.cardId);
  for (const row of plan.removes) ids.add(row.cardId);
  for (const row of plan.replaces) {
    ids.add(row.fromCardId);
    ids.add(row.toCardId);
  }
  return [...ids];
}
