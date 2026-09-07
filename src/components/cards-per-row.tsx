"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import {
  CARDS_PER_ROW,
  CARDS_PER_ROW_COOKIE,
  CARDS_PER_ROW_COOKIE_MAX_AGE,
  type CardsPerRow,
} from "@/lib/cards-per-row";
import { segment } from "@/lib/ui";

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
