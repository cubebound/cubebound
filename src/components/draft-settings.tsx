"use client";

import { useState } from "react";

import {
  canUseEitherSlot,
  DEFAULT_DRAFT_CONFIG,
  DRAFT_LIMITS,
  finalPoolSize,
  mainSlotsPerPack,
  reservedSlotsPerPack,
  totalBattlefieldsNeeded,
  totalLegendOrBattlefieldNeeded,
  totalLegendsNeeded,
  totalMainCardsNeeded,
  validateDraftConfig,
  type DraftConfig,
} from "@/lib/draft/config";

export interface PoolCounts {
  main: number;
  legends: number;
  battlefields: number;
}

/**
 * The draft settings, with the pool arithmetic shown live.
 *
 * Lives in `src/components/` rather than under the draft route because two
 * surfaces use it: starting a solo draft, and choosing the pack template for a
 * Draftmancer export. One form means the two ways of drafting a cube cannot
 * come to disagree about what a legend slot is, and the exclusivity rules only
 * have to be right once.
 *
 * The arithmetic is the point. An 8-seat, 3-pack draft with one legend slot
 * needs 24 legends, and most cubes hold far fewer — so it is very easy to pick
 * settings this cube cannot fill. The server still validates and
 * `generatePacks` still blocks, but finding out *after* pressing start is a bad
 * way to learn that a number was too big. Everything here recomputes as you
 * type.
 *
 * A shortfall in a reserved section is a **warning**, not a block: those slots
 * fall back to the main section, which is the documented behaviour. Only a main
 * pool too small to cover everything actually stops the draft.
 */
export default function DraftSettings({
  pools,
  onChange,
}: {
  pools: PoolCounts;
  onChange?: (config: DraftConfig) => void;
}) {
  const [config, setConfig] = useState<DraftConfig>(DEFAULT_DRAFT_CONFIG);

  const set = (patch: Partial<DraftConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    onChange?.(next);
  };

  const problems = validateDraftConfig(config);
  const reserved = reservedSlotsPerPack(config);
  const mainPerPack = mainSlotsPerPack(config);

  const needs = {
    main: totalMainCardsNeeded(config),
    legends: totalLegendsNeeded(config),
    battlefields: totalBattlefieldsNeeded(config),
    flexible: totalLegendOrBattlefieldNeeded(config),
  };

  // A shuffled type is part of the main pile, not a reserved section, so it
  // grows what main can draw from and needs nothing of its own.
  const mainAvailable =
    pools.main +
    (config.shuffleLegendsIntoPacks ? pools.legends : 0) +
    (config.shuffleBattlefieldsIntoPacks ? pools.battlefields : 0);

  const legendShort = Math.max(0, needs.legends - pools.legends);
  const battlefieldShort = Math.max(0, needs.battlefields - pools.battlefields);
  const spare =
    Math.max(0, pools.legends - needs.legends) +
    Math.max(0, pools.battlefields - needs.battlefields);
  const flexibleShort = Math.max(0, needs.flexible - spare);
  const fallback = legendShort + battlefieldShort + flexibleShort;
  const mainTotal = needs.main + fallback;
  const mainShort = Math.max(0, mainTotal - mainAvailable);

  const field = (
    label: string,
    value: number,
    onSet: (n: number) => void,
    limits: { min: number; max: number },
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={(event) => onSet(Number(event.target.value))}
        className="h-9 w-full rounded-md border border-line bg-sunken px-2 text-sm"
      />
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </label>
  );

  /**
   * One choice per type: reserve a number of slots, or shuffle the section into
   * the packs. A radio rather than a number plus a checkbox, so "both at once"
   * cannot be expressed — `validateDraftConfig` still rejects it, because the
   * config arrives from a browser, but the form should not offer it.
   */
  const typeMode = (
    label: string,
    slots: number,
    shuffled: boolean,
    setSlots: (n: number) => void,
    setShuffled: (on: boolean) => void,
    available: number,
  ) => (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium">
        {label}{" "}
        <span className="font-normal text-subtle">({available} in this cube)</span>
      </legend>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          checked={!shuffled}
          onChange={() => setShuffled(false)}
          className="size-4 accent-accent-strong"
        />
        <span>Reserved slots</span>
        <input
          type="number"
          inputMode="numeric"
          min={DRAFT_LIMITS.slots.min}
          max={DRAFT_LIMITS.slots.max}
          value={slots}
          disabled={shuffled}
          onChange={(event) => setSlots(Number(event.target.value))}
          aria-label={`${label} slots per pack`}
          className="h-8 w-16 rounded-md border border-line bg-sunken px-2 text-sm disabled:opacity-40"
        />
        <span className="text-subtle">per pack</span>
      </label>

      <label className="mt-1.5 flex items-center gap-2 text-sm">
        <input
          type="radio"
          checked={shuffled}
          onChange={() => setShuffled(true)}
          className="size-4 accent-accent-strong"
        />
        <span>Shuffled into the packs</span>
      </label>
    </fieldset>
  );

  const row = (label: string, need: number, have: number) => {
    if (need === 0) return null;
    const short = Math.max(0, need - have);
    return (
      <li className="flex items-baseline gap-2">
        <span className="w-36 shrink-0 text-muted">{label}</span>
        <span className="tabular-nums">
          needs {need}, cube has {have}
        </span>
        {short > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            — {short} filled from main
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name="config" value={JSON.stringify(config)} />

      <div className="grid gap-3 sm:grid-cols-3">
        {field("Players", config.seats, (n) => set({ seats: n }), DRAFT_LIMITS.seats, "Empty seats are bots.")}
        {field(
          "Packs each",
          config.packsPerPlayer,
          (n) => set({ packsPerPlayer: n }),
          DRAFT_LIMITS.packsPerPlayer,
        )}
        {field(
          "Cards per pack",
          config.packSize,
          (n) => set({ packSize: n }),
          DRAFT_LIMITS.packSize,
          "Includes reserved slots.",
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {typeMode(
          "Legends",
          config.legendSlots,
          config.shuffleLegendsIntoPacks,
          (n) => set({ legendSlots: n }),
          (on) =>
            set({
              shuffleLegendsIntoPacks: on,
              // Reserving and shuffling are the two halves of one choice, so
              // picking one clears the other rather than leaving a stale number
              // for the server to reject.
              ...(on ? { legendSlots: 0, legendOrBattlefieldSlots: 0 } : {}),
            }),
          pools.legends,
        )}
        {typeMode(
          "Battlefields",
          config.battlefieldSlots,
          config.shuffleBattlefieldsIntoPacks,
          (n) => set({ battlefieldSlots: n }),
          (on) =>
            set({
              shuffleBattlefieldsIntoPacks: on,
              ...(on ? { battlefieldSlots: 0, legendOrBattlefieldSlots: 0 } : {}),
            }),
          pools.battlefields,
        )}
      </div>

      <label className="flex max-w-sm flex-col gap-1">
        <span className="text-sm font-medium">Legend-or-battlefield slots</span>
        <input
          type="number"
          inputMode="numeric"
          min={DRAFT_LIMITS.slots.min}
          max={DRAFT_LIMITS.slots.max}
          value={config.legendOrBattlefieldSlots}
          disabled={!canUseEitherSlot(config)}
          onChange={(event) => set({ legendOrBattlefieldSlots: Number(event.target.value) })}
          className="h-9 w-full rounded-md border border-line bg-sunken px-2 text-sm disabled:opacity-40"
        />
        <span className="text-xs text-subtle">
          {canUseEitherSlot(config)
            ? "One of the two per slot, at random."
            : "Needs both legends and battlefields reserved — it draws from each."}
        </span>
      </label>

      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-red-600 dark:text-red-400">
          {problems.map((problem) => (
            <li key={`${problem.field}:${problem.message}`}>{problem.message}</li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-line p-3 text-sm">
          <p className="font-medium">
            {config.seats} seats · {config.packsPerPlayer} packs each ·{" "}
            {config.packSize} cards per pack
          </p>
          <p className="mt-0.5 text-muted">
            {mainPerPack} main {mainPerPack === 1 ? "slot" : "slots"}
            {reserved > 0 && ` plus ${reserved} reserved`}. You&rsquo;ll finish with{" "}
            {finalPoolSize(config)} cards.
          </p>

          <ul className="mt-2 space-y-0.5 text-xs">
            <li className="flex items-baseline gap-2">
              <span className="w-36 shrink-0 text-muted">
                Main pool
              </span>
              <span className="tabular-nums">
                needs {mainTotal}, cube has {mainAvailable}
              </span>
              {mainShort > 0 && (
                <span className="font-medium text-red-600 dark:text-red-400">
                  — {mainShort} short
                </span>
              )}
            </li>
            {row("Legend slots", needs.legends, pools.legends)}
            {row("Battlefield slots", needs.battlefields, pools.battlefields)}
            {needs.flexible > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="w-36 shrink-0 text-muted">
                  Either slots
                </span>
                <span className="tabular-nums">
                  needs {needs.flexible}, {spare} spare
                </span>
                {flexibleShort > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    — {flexibleShort} filled from main
                  </span>
                )}
              </li>
            )}
          </ul>

          {mainShort > 0 && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              Add {mainShort} more cards, reserve fewer slots, or shuffle a section
              into the packs.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
