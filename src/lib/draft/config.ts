/**
 * Draft configuration.
 *
 * Fixed for milestone A: there is no settings UI, and the engine takes a config
 * object purely so the numbers are named and snapshotted rather than scattered
 * as literals. Every draft currently runs on `DEFAULT_DRAFT_CONFIG`.
 *
 * The pack template follows Riftbound's Legacy booster: eleven cards from the
 * main pool plus one Legend-or-Battlefield. Those two types are the deck's
 * identity rather than its body — you play one legend and a small number of
 * battlefields — so dealing them from the main pool would both flood the packs
 * with cards nobody can use twice and starve drafters of the one card that
 * fixes their domains. One guaranteed slot per pack gives every seat three
 * shots at each across the draft.
 *
 * **Rarity plays no part in pack construction.** A cube is already a curated
 * pool; re-imposing the printed rarity distribution on top would double-filter
 * it and make a cube owner's choices subordinate to Riot's.
 */

export type PassDirection = "left" | "right";

export interface DraftConfig {
  /** Packs opened per seat, one round each. */
  packsPerPlayer: number;
  /** Cards in a fresh pack, including the legend-or-battlefield slot. */
  packSize: number;
  /** Guaranteed Legend-or-Battlefield slots per pack. */
  legendOrBattlefieldSlots: number;
  seats: number;
  /**
   * Direction each round passes, indexed by round. Shorter than
   * `packsPerPlayer` would be a bug, so it is validated at draft creation.
   */
  passDirections: PassDirection[];
}

export const DEFAULT_PACKS_PER_PLAYER = 3;
export const DEFAULT_PACK_SIZE = 12;
export const DEFAULT_LEGEND_OR_BATTLEFIELD_SLOTS = 1;
export const DEFAULT_SEATS = 8;

/** Left, then right, then left — the standard alternation. */
export const DEFAULT_PASS_DIRECTIONS: PassDirection[] = ["left", "right", "left"];

export const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  packsPerPlayer: DEFAULT_PACKS_PER_PLAYER,
  packSize: DEFAULT_PACK_SIZE,
  legendOrBattlefieldSlots: DEFAULT_LEGEND_OR_BATTLEFIELD_SLOTS,
  seats: DEFAULT_SEATS,
  passDirections: DEFAULT_PASS_DIRECTIONS,
};

/** Main-pool cards in one pack: everything but the guaranteed L/B slots. */
export function mainSlotsPerPack(config: DraftConfig): number {
  return config.packSize - config.legendOrBattlefieldSlots;
}

/** Total main-pool cards a whole draft consumes. */
export function totalMainCardsNeeded(config: DraftConfig): number {
  return config.seats * config.packsPerPlayer * mainSlotsPerPack(config);
}

/** Total legend-or-battlefield cards a whole draft consumes. */
export function totalLegendOrBattlefieldNeeded(config: DraftConfig): number {
  return config.seats * config.packsPerPlayer * config.legendOrBattlefieldSlots;
}

/** Cards a single seat ends up with. */
export function finalPoolSize(config: DraftConfig): number {
  return config.packsPerPlayer * config.packSize;
}
