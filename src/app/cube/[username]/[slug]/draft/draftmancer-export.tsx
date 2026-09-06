"use client";

import {
  mainSlotsPerPack,
  reservedSlotsPerPack,
  type DraftConfig,
} from "@/lib/draft/config";
import { btn } from "@/lib/ui";

/**
 * The export half of the draft screen: the same cube, drafted somewhere else.
 *
 * Solo drafting here is one person against deliberately dumb bots. Draftmancer
 * runs multiplayer drafts in a browser, and its custom-card support is what lets
 * it handle a game it has never heard of — so this is the shortest path from a
 * cube to a real draft pod, and why the tab says what it is *for* rather than
 * merely what it does.
 *
 * **It renders no settings of its own.** The pack template comes from the
 * `DraftSettings` form above the tabs, which is the whole reason these are tabs
 * on one screen rather than two screens: a legend slot means the same thing
 * whichever way you draft the cube, so it is configured once. This component
 * only turns the resulting config into a link and explains what will be in the
 * file.
 */
export default function DraftmancerExport({
  exportPath,
  config,
  disabled,
}: {
  /** The cube's `draftmancer.txt` route; the config rides in its query string. */
  exportPath: string;
  config: DraftConfig;
  /** Set when the config is incoherent — the route would 400 on it anyway. */
  disabled: boolean;
}) {
  const reserved = reservedSlotsPerPack(config);
  const mainPerPack = mainSlotsPerPack(config);

  // Every field by name, so this and `readDraftConfig` cannot drift about what
  // a config is. The route re-reads and re-validates all of it.
  const href = `${exportPath}?${new URLSearchParams({
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {disabled ? (
          <span className="text-sm text-subtle">
            Fix the settings above to download.
          </span>
        ) : (
          <a
            href={href}
            download
            className={btn.primary}
          >
            Download cube file
          </a>
        )}
        <span className="text-sm tabular-nums text-subtle">
          {config.packSize}-card packs · {mainPerPack} main
          {reserved > 0 && ` + ${reserved} reserved`}
        </span>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Download the file.</li>
        <li>
          Open{" "}
          <a
            href="https://draftmancer.com"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium underline underline-offset-2"
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

      <p className="text-xs text-subtle">
        Main, legends and battlefields are exported.{" "}
        <strong className="font-medium">
          Runes, sideboard and maybeboard are not
        </strong>{" "}
        — the same sections our own draft leaves out. Draftmancer bots have never
        seen a Riftbound card, so each one carries a 0–5 rating derived from its
        rarity to give them something to pick on.
      </p>
    </div>
  );
}
