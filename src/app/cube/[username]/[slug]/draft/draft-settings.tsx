"use client";

import { useState } from "react";

import {
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

  const legendShort = Math.max(0, needs.legends - pools.legends);
  const battlefieldShort = Math.max(0, needs.battlefields - pools.battlefields);
  const spare =
    Math.max(0, pools.legends - needs.legends) +
    Math.max(0, pools.battlefields - needs.battlefields);
  const flexibleShort = Math.max(0, needs.flexible - spare);
  const fallback = legendShort + battlefieldShort + flexibleShort;
  const mainTotal = needs.main + fallback;
  const mainShort = Math.max(0, mainTotal - pools.main);

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
        className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );

  const row = (label: string, need: number, have: number) => {
    if (need === 0) return null;
    const short = Math.max(0, need - have);
    return (
      <li className="flex items-baseline gap-2">
        <span className="w-36 shrink-0 text-zinc-600 dark:text-zinc-400">{label}</span>
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

      <div className="grid gap-3 sm:grid-cols-3">
        {field("Legend slots", config.legendSlots, (n) => set({ legendSlots: n }), DRAFT_LIMITS.slots)}
        {field(
          "Battlefield slots",
          config.battlefieldSlots,
          (n) => set({ battlefieldSlots: n }),
          DRAFT_LIMITS.slots,
        )}
        {field(
          "Either slots",
          config.legendOrBattlefieldSlots,
          (n) => set({ legendOrBattlefieldSlots: n }),
          DRAFT_LIMITS.slots,
          "One of the two, at random.",
        )}
      </div>

      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-red-600 dark:text-red-400">
          {problems.map((problem) => (
            <li key={`${problem.field}:${problem.message}`}>{problem.message}</li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <p className="font-medium">
            {config.seats} seats · {config.packsPerPlayer} packs each ·{" "}
            {config.packSize} cards per pack
          </p>
          <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
            {mainPerPack} from the main section
            {reserved > 0 && ` plus ${reserved} reserved`}. You&rsquo;ll finish with{" "}
            {finalPoolSize(config)} cards.
          </p>

          <ul className="mt-2 space-y-0.5 text-xs">
            <li className="flex items-baseline gap-2">
              <span className="w-36 shrink-0 text-zinc-600 dark:text-zinc-400">Main section</span>
              <span className="tabular-nums">
                needs {mainTotal}, cube has {pools.main}
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
                <span className="w-36 shrink-0 text-zinc-600 dark:text-zinc-400">
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
              Add {mainShort} more cards to the main section, or reserve fewer slots.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
