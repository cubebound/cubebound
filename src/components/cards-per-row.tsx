"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import {
  CARDS_PER_ROW,
  CARDS_PER_ROW_COOKIE,
  CARDS_PER_ROW_COOKIE_MAX_AGE,
  type CardsPerRow,
} from "@/lib/cards-per-row";
import { segment, selectSm } from "@/lib/ui";

/**
 * How many tiles a cube's visual view puts on a row, shared between the control
 * in the toolbar and the grid in the body.
 *
 * It is context rather than a prop because those two sit in different parts of
 * the tree, and it is client state rather than a URL param because the count is
 * a CSS class on a list the server has already rendered — pushing a param would
 * spend a round trip on a dynamic route to change a class. So the state changes
 * on the click's own frame and the cookie only has to be right for the *next*
 * request, which is exactly how the theme toggle works.
 */
const Ctx = createContext<{
  perRow: CardsPerRow;
  choose: (count: CardsPerRow) => void;
} | null>(null);

/** Kept out of the component body: writing a global from inside one trips the
 *  compiler's immutability rule, and this is a plain browser side effect. */
function rememberChoice(count: CardsPerRow): void {
  document.cookie = `${CARDS_PER_ROW_COOKIE}=${count}; path=/; max-age=${CARDS_PER_ROW_COOKIE_MAX_AGE}; samesite=lax`;
}

export function CardsPerRowProvider({
  initial,
  children,
}: {
  initial: CardsPerRow;
  children: ReactNode;
}) {
  const [perRow, setPerRow] = useState<CardsPerRow>(initial);

  function choose(count: CardsPerRow) {
    setPerRow(count);
    rememberChoice(count);
  }

  return <Ctx.Provider value={{ perRow, choose }}>{children}</Ctx.Provider>;
}

/**
 * `undefined` outside a provider, and that is the useful case: a card grid with
 * no density control renders the responsive default, so the card browser and
 * the editor's browse grid are unaffected by any of this.
 */
export function useCardsPerRow(): CardsPerRow | undefined {
  return useContext(Ctx)?.perRow;
}

export function CardsPerRowToggle() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;

  return (
    <div
      role="group"
      aria-label="Cards per row"
      className="inline-flex overflow-hidden rounded-md border border-line"
    >
      {CARDS_PER_ROW.map((count) => (
        <button
          key={count}
          type="button"
          onClick={() => ctx.choose(count)}
          aria-pressed={count === ctx.perRow}
          title={`${count} cards per row`}
          className={count === ctx.perRow ? segment.active : segment.inactive}
        >
          {count}
        </button>
      ))}
    </div>
  );
}

/**
 * The same choice, as a plain native select.
 *
 * It used to be a `<details>` menu labelled "Display", which hid the current
 * value behind a click - you could not tell what the grid was set to without
 * opening it, and the label named a category rather than a setting. A select
 * wears its answer on its face, and hands the whole interaction to the browser:
 * keyboard, type-ahead, touch, and the platform's own picker, in place of an
 * effect listening for outside clicks and Escape to close a popover by hand.
 *
 * The option text is the full sentence rather than a bare number for the same
 * reason - closed, `6` alone says nothing about what it counts. It is always
 * plural because `CARDS_PER_ROW` starts at four; a one-card option would need
 * the singular, and the type would flag it here.
 */
export function CardsPerRowSelect() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;

  return (
    // Hidden below `sm`, where it does nothing: every option renders
    // `grid-cols-2` at that width, so this would offer four choices with one
    // outcome. The cube's own breakpoints already pick a sane count for a phone;
    // density is a desktop preference.
    <select
      aria-label="Cards per row"
      value={ctx.perRow}
      onChange={(event) => ctx.choose(Number(event.target.value) as CardsPerRow)}
      className={`${selectSm} hidden cursor-pointer sm:block`}
    >
      {CARDS_PER_ROW.map((count) => (
        <option key={count} value={count}>
          {count} Cards Per Row
        </option>
      ))}
    </select>
  );
}
