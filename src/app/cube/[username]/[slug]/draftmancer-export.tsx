"use client";

import { useState } from "react";

import DraftSettings, { type PoolCounts } from "@/components/draft-settings";
import {
  DEFAULT_DRAFT_CONFIG,
  validateDraftConfig,
  type DraftConfig,
} from "@/lib/draft/config";

/**
 * Offers the cube as a Draftmancer Custom Card List.
 *
 * Solo drafting here is one person against deliberately dumb bots. Draftmancer
 * is where eight actual people draft, and its custom-card support is what lets
 * it run a game it has never heard of — so this is the shortest path from a
 * cube to a real draft pod, and it is why the panel says what it is *for* and
 * not merely what it does.
 *
 * **The pack template is chosen here, not in Draftmancer.** Draftmancer has no
 * concept of a legend or a battlefield, so expressing "one legend-or-battlefield
 * per pack" in its own UI would mean hand-writing layout JSON. It reuses the
 * *same* `DraftSettings` form the solo draft uses, so the two ways of drafting a
 * cube cannot drift, and the pool arithmetic — which is the part people get
 * wrong — is already live in that component.
 *
 * What it deliberately does **not** decide is the session: the pick timer, and
 * who actually turns up. Players and packs are still asked for, because they
 * size the "is this cube big enough" arithmetic, and packs go into the file as
 * `boostersPerPlayer`; the Draftmancer host can override both.
 *
 * Collapsed by default — it is a power-user path, and the cube itself is what
 * the page is for.
 */
export default function DraftmancerExport({
  basePath,
  pools,
  missingArt,
}: {
  basePath: string;
  pools: PoolCounts;
  /** Cards with no art stored, counted server-side from rows already loaded. */
  missingArt: number;
}) {
  const [config, setConfig] = useState<DraftConfig>(DEFAULT_DRAFT_CONFIG);

  const total = pools.main + pools.legends + pools.battlefields;
  if (total === 0) return null;

  // The route re-reads and re-validates every one of these, so this only
  // decides whether to offer the link at all.
  const problems = validateDraftConfig(config);
  const href = `${basePath}/draftmancer.txt?${new URLSearchParams({
    seats: String(config.seats),
    packsPerPlayer: String(config.packsPerPlayer),
    packSize: String(config.packSize),
    legendSlots: String(config.legendSlots),
    battlefieldSlots: String(config.battlefieldSlots),
    legendOrBattlefieldSlots: String(config.legendOrBattlefieldSlots),
    shuffleLegendsIntoPacks: config.shuffleLegendsIntoPacks ? "1" : "0",
    shuffleBattlefieldsIntoPacks: config.shuffleBattlefieldsIntoPacks ? "1" : "0",
  })}`;

  return (
    <details className="mb-5 rounded-md border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900">
        Export to Draftmancer
        <span className="ml-2 font-normal text-zinc-500">
          to draft this cube with other people
        </span>
      </summary>

      <div className="space-y-4 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <DraftSettings pools={pools} onChange={setConfig} />

        <div className="flex flex-wrap items-center gap-3">
          {problems.length > 0 ? (
            <span className="text-sm text-zinc-500">
              Fix the settings above to download.
            </span>
          ) : (
            <a
              href={href}
              download
              className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Download cube file
            </a>
          )}
          <span className="text-sm text-zinc-500">
            <span className="tabular-nums">{total}</span>{" "}
            {total === 1 ? "card" : "cards"}
          </span>
        </div>

        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Download the file above.</li>
          <li>
            Open{" "}
            <a
              href="https://draftmancer.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium underline"
            >
              draftmancer.com
            </a>{" "}
            and create a session.
          </li>
          <li>
            Under <strong className="font-medium">Settings → Card List</strong>,
            choose <strong className="font-medium">Load Custom Card List</strong>{" "}
            and pick the file.
          </li>
        </ol>

        {missingArt > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-500">
            {missingArt} {missingArt === 1 ? "card has" : "cards have"} no art
            stored, so {missingArt === 1 ? "it" : "they"} will show as a blank
            frame in Draftmancer.
          </p>
        )}

        <p className="text-xs text-zinc-500">
          Main, legends and battlefields are exported.{" "}
          <strong className="font-medium">Runes, sideboard and maybeboard are
          not</strong> — the same sections our own draft leaves out. Draftmancer
          bots have never seen a Riftbound card, so each one carries a 0–5 rating
          derived from its rarity to give them something to pick on. Players and
          packs are only a starting point; whoever hosts the session can change
          them there.
        </p>
      </div>
    </details>
  );
}
