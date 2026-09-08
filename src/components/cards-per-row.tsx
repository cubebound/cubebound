"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import {
  CARDS_PER_ROW,
  CARDS_PER_ROW_COOKIE,
  CARDS_PER_ROW_COOKIE_MAX_AGE,
  type CardsPerRow,
} from "@/lib/cards-per-row";
import { menu, menuItem, segment } from "@/lib/ui";

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
 * The same choice, folded into a menu.
 *
 * Four visible chips plus a two-way view toggle is most of a phone's width, and
 * the density is a setting you change occasionally rather than a control you
 * reach for — so it earns a menu, not a permanent row. Built on `<details>`
 * like the card browser's filter menus: it opens and closes with no React state
 * and keeps working with JavaScript off.
 */
export function CardsPerRowMenu() {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      el.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!ctx) return null;

  return (
    <details ref={ref} className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-line px-3 py-1.5 text-sm text-muted select-none hover:bg-hover">
        Display
      </summary>
      <div className={`${menu} absolute right-0 mt-1 w-44`}>
        <p className="px-3 py-1.5 text-xs text-subtle">Cards per row</p>
        {CARDS_PER_ROW.map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => {
              ctx.choose(count);
              if (ref.current) ref.current.open = false;
            }}
            aria-pressed={count === ctx.perRow}
            className={`${menuItem} ${count === ctx.perRow ? "text-accent" : ""}`}
          >
            {count}
            {count === ctx.perRow ? " ✓" : ""}
          </button>
        ))}
      </div>
    </details>
  );
}
