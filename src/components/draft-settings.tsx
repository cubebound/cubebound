"use client";

import { useState, type ReactNode } from "react";

import {
  canUseEitherSlot,
  DEFAULT_DRAFT_CONFIG,
  DRAFT_LIMITS,
  draftmancerSheetNeeded,
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
import { check, errorText, help, inputSm, label as labelClass } from "@/lib/ui";

export interface PoolCounts {
  main: number;
  legends: number;
  battlefields: number;
}

/**
 * Where the config is headed.
 *
 * `bots` and `draftmancer` differ only in hint text and one sentence of the
 * summary. `pack` is the one that changes what is *shown*: a single pack image
 * has no seats and no rounds, so Players and Packs each are not merely
 * differently worded there, they are meaningless, and the whole-draft pool
 * arithmetic beneath them is answering a question nobody asked.
 */
export type DraftSettingsMode = "bots" | "draftmancer" | "pack";

/** Every field the form edits as a number. */
type NumericField =
  | "seats"
  | "packsPerPlayer"
  | "packSize"
  | "legendSlots"
  | "battlefieldSlots"
  | "legendOrBattlefieldSlots";

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
 *
 * **`mode` changes what the fields say, never what they do.** Two of them mean
 * different things per destination: exporting, Players is only the size of the
 * check below and never reaches the file, and Packs each is a default the
 * Draftmancer host may override. That used to be a paragraph above the form,
 * which is read once and then forgotten while the eye is on the fields — so the
 * qualification now sits on the field it qualifies. The config, the arithmetic
 * and the validation are identical either way, which is what keeps one form safe
 * to share between the two.
 */
export default function DraftSettings({
  pools,
  mode,
  onChange,
}: {
  pools: PoolCounts;
  mode: DraftSettingsMode;
  onChange?: (config: DraftConfig) => void;
}) {
  const [config, setConfig] = useState<DraftConfig>(DEFAULT_DRAFT_CONFIG);
  /**
   * What is in a number field while it is being typed in.
   *
   * `Number("")` is 0, so committing every keystroke straight to the config
   * meant select-all-delete set the field to zero: validation failed, the
   * summary box was replaced by a red error list and the panel jumped, all on
   * the way to typing a perfectly good number. The raw string lives here until
   * it parses, `config` stays numeric and stays the only thing anyone else
   * reads, and blurring an abandoned edit snaps the field back to the committed
   * value.
   */
  const [text, setText] = useState<Partial<Record<NumericField, string>>>({});

  const set = (patch: Partial<DraftConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    onChange?.(next);
  };

  /** Drop in-flight text for fields something other than typing just changed,
   *  so a shuffled section does not leave a stale number on screen. */
  const forget = (...keys: NumericField[]) =>
    setText((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });

  const setNumber = (key: NumericField, raw: string) => {
    setText((prev) => ({ ...prev, [key]: raw }));
    const value = Number(raw);
    if (raw.trim() !== "" && Number.isInteger(value)) {
      // A computed key off a union widens to a string index, which is what the
      // assertion is for; every member of NumericField holds a number.
      set({ [key]: value } as Partial<DraftConfig>);
    }
  };

  const problems = validateDraftConfig(config);
  const reserved = reservedSlotsPerPack(config);
  const mainPerPack = mainSlotsPerPack(config);
  const exporting = mode === "draftmancer";
  // One pack: no seats, no rounds, no pool to exhaust.
  const packOnly = mode === "pack";

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

  /**
   * What each sheet needs for a Draftmancer export, which is a different
   * question from what our own engine needs.
   *
   * The engine fills a short reserved section from main and warns. Draftmancer
   * cannot: its either-slot picks a *sheet* before it picks a card, and an empty
   * one fails the whole booster generation. So the pooled row below ("needs 24,
   * 74 spare") is the wrong check on this tab. It reads healthy on a cube
   * Draftmancer will refuse, which is exactly what it did on a 27-legend cube at
   * four either-slots.
   *
   * When the cube holds none of a type the exporter narrows the slot to a single
   * sheet, so the survivor carries the whole slot rather than half of it.
   */
  const sheets = (() => {
    if (!exporting || !canUseEitherSlot(config)) return null;
    const bothTypes = pools.legends > 0 && pools.battlefields > 0;
    const share = bothTypes ? 0.5 : 1;
    // `canUseEitherSlot` is already false when either type is shuffled, so a
    // shuffled section never reaches here and needs no case of its own.
    const rows = [
      { label: "Legends", have: pools.legends },
      { label: "Battlefields", have: pools.battlefields },
    ] as const;
    return rows
      .filter((sheet) => sheet.have > 0)
      .map((sheet) => {
        const need = draftmancerSheetNeeded(
          config,
          sheet.label === "Legends" ? "legends" : "battlefields",
          share,
        );
        return { ...sheet, need, short: Math.max(0, need - sheet.have) };
      });
  })();
  const sheetShort = sheets?.filter((sheet) => sheet.short > 0) ?? [];

  const numberInput = (
    key: NumericField,
    limits: { min: number; max: number },
    options: { className: string; disabled?: boolean; ariaLabel?: string },
  ) => (
    <input
      type="number"
      inputMode="numeric"
      min={limits.min}
      max={limits.max}
      value={text[key] ?? String(config[key])}
      disabled={options.disabled}
      aria-label={options.ariaLabel}
      onChange={(event) => setNumber(key, event.target.value)}
      onBlur={() => forget(key)}
      className={options.className}
    />
  );

  const field = (
    key: NumericField,
    label: string,
    limits: { min: number; max: number },
    hint?: ReactNode,
  ) => (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      {numberInput(key, limits, { className: `${inputSm} w-full sm:w-24` })}
      {hint && <span className={help}>{hint}</span>}
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
    key: NumericField,
    shuffled: boolean,
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
          className={`size-4 ${check}`}
        />
        <span>Reserved slots</span>
        {numberInput(key, DRAFT_LIMITS.slots, {
          className: `${inputSm} h-8 w-16 px-2 disabled:opacity-40`,
          disabled: shuffled,
          ariaLabel: `${label} slots per pack`,
        })}
        <span className="text-subtle">per pack</span>
      </label>

      <label className="mt-1.5 flex items-center gap-2 text-sm">
        <input
          type="radio"
          checked={shuffled}
          onChange={() => setShuffled(true)}
          className={`size-4 ${check}`}
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
            {" "}
            ({short} filled from main)
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name="config" value={JSON.stringify(config)} />

      <div className={`grid gap-3 ${packOnly ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}>
        {!packOnly && field(
          "seats",
          "Players",
          DRAFT_LIMITS.seats,
          exporting
            ? "Only checks the cube is big enough. Draftmancer’s host sets the real number."
            : "Empty seats are bots.",
        )}
        {!packOnly && field(
          "packsPerPlayer",
          "Packs each",
          DRAFT_LIMITS.packsPerPlayer,
          exporting ? "Goes in the file as the default. The host can change it." : undefined,
        )}
        {field(
          "packSize",
          "Cards per pack",
          DRAFT_LIMITS.packSize,
          "Includes reserved slots.",
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {typeMode(
          "Legends",
          "legendSlots",
          config.shuffleLegendsIntoPacks,
          (on) => {
            set({
              shuffleLegendsIntoPacks: on,
              // Reserving and shuffling are the two halves of one choice, so
              // picking one clears the other rather than leaving a stale number
              // for the server to reject.
              ...(on ? { legendSlots: 0, legendOrBattlefieldSlots: 0 } : {}),
            });
            if (on) forget("legendSlots", "legendOrBattlefieldSlots");
          },
          pools.legends,
        )}
        {typeMode(
          "Battlefields",
          "battlefieldSlots",
          config.shuffleBattlefieldsIntoPacks,
          (on) => {
            set({
              shuffleBattlefieldsIntoPacks: on,
              ...(on ? { battlefieldSlots: 0, legendOrBattlefieldSlots: 0 } : {}),
            });
            if (on) forget("battlefieldSlots", "legendOrBattlefieldSlots");
          },
          pools.battlefields,
        )}
      </div>

      <label className="flex max-w-sm flex-col gap-1">
        <span className={labelClass}>Legend-or-battlefield slots</span>
        {numberInput("legendOrBattlefieldSlots", DRAFT_LIMITS.slots, {
          className: `${inputSm} w-full sm:w-24 disabled:opacity-40`,
          disabled: !canUseEitherSlot(config),
        })}
        <span className={help}>
          {canUseEitherSlot(config)
            ? "One of the two per slot, at random."
            : "Needs both legends and battlefields reserved, since it draws from each."}
        </span>
      </label>

      {problems.length > 0 ? (
        <ul role="alert" className={`space-y-1 ${errorText}`}>
          {problems.map((problem) => (
            <li key={`${problem.field}:${problem.message}`}>{problem.message}</li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-line p-3 text-sm">
          {/* Exporting, the seat count is an assumption about a session the
              Draftmancer host will size themselves, so the line says so rather
              than stating it as fact. */}
          <p className="font-medium">
            {packOnly
              ? `${config.packSize} cards in the pack`
              : `${exporting ? `Sized for ${config.seats} players` : `${config.seats} seats`} · ${config.packsPerPlayer} packs each · ${config.packSize} cards per pack`}
          </p>
          <p className="mt-0.5 text-muted">
            {mainPerPack} main {mainPerPack === 1 ? "slot" : "slots"}
            {reserved > 0 && ` plus ${reserved} reserved`}.
            {!packOnly && (
              <>
                {" "}
                {exporting ? "Each player finishes with" : "You’ll finish with"}{" "}
                {finalPoolSize(config)} cards.
              </>
            )}
          </p>

          {!packOnly && (
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
                  {" "}
                  ({mainShort} short)
                </span>
              )}
            </li>
            {sheets
              ? sheets.map((sheet) => (
                  <li key={sheet.label} className="flex items-baseline gap-2">
                    <span className="w-36 shrink-0 text-muted">{sheet.label}</span>
                    <span className="tabular-nums">
                      needs {sheet.need}, cube has {sheet.have}
                    </span>
                    {sheet.short > 0 && (
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {" "}
                        ({sheet.short} short)
                      </span>
                    )}
                  </li>
                ))
              : null}
            {!sheets && row("Legend slots", needs.legends, pools.legends)}
            {!sheets && row("Battlefield slots", needs.battlefields, pools.battlefields)}
            {!sheets && needs.flexible > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="w-36 shrink-0 text-muted">
                  Either slots
                </span>
                <span className="tabular-nums">
                  needs {needs.flexible}, {spare} spare
                </span>
                {flexibleShort > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {" "}
                    ({flexibleShort} filled from main)
                  </span>
                )}
              </li>
            )}
          </ul>
          )}

          {!packOnly && mainShort > 0 && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              Add {mainShort} more cards, reserve fewer slots, or shuffle a section
              into the packs.
            </p>
          )}

          {/* Said in full rather than as a number, because the failure it
              prevents is opaque: Draftmancer refuses with "make sure there are
              enough cards in the list" and names no sheet, and because it
              retries, a cube near the line errors a few times and then works.
              Somebody debugging that from the other end has nothing to go on. */}
          {!packOnly && sheetShort.length > 0 && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
              <span className="font-medium">
                Draftmancer won&rsquo;t reliably build these packs.
              </span>{" "}
              It picks legend or battlefield per slot before it picks a card, so
              each section has to cover its own half and can&rsquo;t borrow from
              the other. Add{" "}
              {sheetShort
                .map((sheet) => `${sheet.short} ${sheet.label.toLowerCase()}`)
                .join(" and ")}
              , use fewer legend-or-battlefield slots, or size for fewer players.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
