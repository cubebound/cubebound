/**
 * Draft configuration.
 *
 * Chosen per draft on the start screen and **snapshotted into `drafts.config`**
 * when the draft is created, so editing the cube — or picking different
 * settings next time — cannot change a draft already in flight. The engine
 * takes a config object rather than reading globals, which is what makes it
 * pure and replayable.
 *
 * The default pack template reserves one Legend-or-Battlefield slot, chosen
 * 50/50, and fills the rest of the pack from the main pool. That slot is the
 * one Riot's boosters guarantee from Legacy (Set 6, January 2027) onward, and
 * matching it is the whole of what "follows retail" means here.
 *
 * **Pack size deliberately does not track a retail pack's card count.** A
 * retail pack's rarity, rune and insert slots have no cube equivalent — rarity
 * plays no part below, and runes are resources rather than picks — so copying
 * the printed card count would be imitating slots this engine never deals.
 * Twelve cards with one either-slot is eleven from main.
 *
 * Legends and battlefields are the deck's identity rather than its body — you
 * play one legend and a small number of battlefields — so dealing them from the
 * main pool would both flood packs with cards nobody can use twice and starve
 * drafters of the one card that fixes their domains. A guaranteed slot per pack
 * gives every seat a shot at each.
 *
 * **Rarity plays no part in pack construction.** A cube is already a curated
 * pool; re-imposing the printed rarity distribution on top would double-filter
 * it and make a cube owner's choices subordinate to Riot's.
 */

export type PassDirection = "left" | "right";

export interface DraftConfig {
  /** Packs opened per seat, one round each. */
  packsPerPlayer: number;
  /** Cards in a fresh pack, **including** every reserved slot below. */
  packSize: number;
  /** Slots that must be a Legend. */
  legendSlots: number;
  /** Slots that must be a Battlefield. */
  battlefieldSlots: number;
  /** Slots that are one or the other, chosen at random per slot. */
  legendOrBattlefieldSlots: number;
  /**
   * Deal legends from the ordinary main slots instead of reserving any.
   *
   * For cubes that shuffle everything together and build packs off the pile.
   * Mutually exclusive with reserving the type: a legend is either something
   * the pack template guarantees a number of, or just another card in the
   * shuffle, and both at once makes the guaranteed number a lie. The
   * either-slot counts as reserving both types, so it has to be zero too.
   */
  shuffleLegendsIntoPacks: boolean;
  shuffleBattlefieldsIntoPacks: boolean;
  seats: number;
  /**
   * Direction each round passes, indexed by round.
   *
   * **Only present on drafts created before directions were derived.** New
   * drafts omit it and `directionForRound` computes the alternation, which is
   * what allows more than three packs — the stored array was fixed at three
   * and threw on round four. Kept readable so those older drafts replay
   * against exactly the directions they were dealt with.
   */
  passDirections?: PassDirection[];
}

export const DEFAULT_PACKS_PER_PLAYER = 3;
export const DEFAULT_PACK_SIZE = 12;
export const DEFAULT_LEGEND_SLOTS = 0;
export const DEFAULT_BATTLEFIELD_SLOTS = 0;
export const DEFAULT_LEGEND_OR_BATTLEFIELD_SLOTS = 1;
export const DEFAULT_SEATS = 8;

export const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  packsPerPlayer: DEFAULT_PACKS_PER_PLAYER,
  packSize: DEFAULT_PACK_SIZE,
  legendSlots: DEFAULT_LEGEND_SLOTS,
  battlefieldSlots: DEFAULT_BATTLEFIELD_SLOTS,
  legendOrBattlefieldSlots: DEFAULT_LEGEND_OR_BATTLEFIELD_SLOTS,
  shuffleLegendsIntoPacks: false,
  shuffleBattlefieldsIntoPacks: false,
  seats: DEFAULT_SEATS,
};

/**
 * Rebuilds a config from untrusted input.
 *
 * Field by field rather than a spread, so a caller cannot smuggle in extra keys
 * that would be snapshotted into `drafts.config` and read back later — most
 * pointedly `passDirections`, which would let them pin the passing order.
 *
 * Lives here rather than beside the draft action because two callers need it:
 * the start action, reading a form, and the Draftmancer export route, reading a
 * query string. That is also why the booleans accept `"true"` and `"1"` — a URL
 * has no booleans, and the alternative is a second parser that could disagree
 * with this one about what a config is.
 */
export function readDraftConfig(input: unknown): DraftConfig {
  const source = (input ?? {}) as Record<string, unknown>;
  const num = (key: keyof DraftConfig, fallback: number) => {
    const value = Number(source[key]);
    return Number.isFinite(value) ? Math.floor(value) : fallback;
  };
  const flag = (key: keyof DraftConfig) => {
    const value = source[key];
    return value === true || value === "true" || value === "1";
  };
  return {
    seats: num("seats", DEFAULT_DRAFT_CONFIG.seats),
    packsPerPlayer: num("packsPerPlayer", DEFAULT_DRAFT_CONFIG.packsPerPlayer),
    packSize: num("packSize", DEFAULT_DRAFT_CONFIG.packSize),
    legendSlots: num("legendSlots", DEFAULT_DRAFT_CONFIG.legendSlots),
    battlefieldSlots: num("battlefieldSlots", DEFAULT_DRAFT_CONFIG.battlefieldSlots),
    legendOrBattlefieldSlots: num(
      "legendOrBattlefieldSlots",
      DEFAULT_DRAFT_CONFIG.legendOrBattlefieldSlots,
    ),
    shuffleLegendsIntoPacks: flag("shuffleLegendsIntoPacks"),
    shuffleBattlefieldsIntoPacks: flag("shuffleBattlefieldsIntoPacks"),
  };
}

/**
 * How a type reaches a pack. The UI offers this as one choice per type, which
 * is what makes the exclusivity structural rather than a rule the form has to
 * police; the config stores it flat so an older snapshot still reads.
 */
export type TypeMode = "reserved" | "shuffled";

export function legendMode(config: DraftConfig): TypeMode {
  return config.shuffleLegendsIntoPacks ? "shuffled" : "reserved";
}
export function battlefieldMode(config: DraftConfig): TypeMode {
  return config.shuffleBattlefieldsIntoPacks ? "shuffled" : "reserved";
}

/** Whether the either-slot is available: it draws both types, so it needs both
 *  of them reserved. */
export function canUseEitherSlot(config: DraftConfig): boolean {
  return !config.shuffleLegendsIntoPacks && !config.shuffleBattlefieldsIntoPacks;
}

/**
 * Bounds, enforced on the server rather than only in the form.
 *
 * The start action takes these numbers from a client, so the form is a
 * convenience and this is the rule. Two seats is the floor because passing has
 * no meaning with one.
 *
 * Sixteen is the ceiling, and it is a sanity bound on input from a browser
 * rather than a product opinion. It used to be eight, which was the standard
 * draft pod size read as a limit: nothing in the engine cares how many seats
 * there are, and for a Draftmancer export `seats` is never written to the
 * file at all — it only sizes the "is this cube big enough" arithmetic, so
 * capping it at eight meant a twelve-person pod could not even be checked for.
 * A cube too small for the seats asked for still blocks, with the real numbers.
 */
export const DRAFT_LIMITS = {
  seats: { min: 2, max: 16 },
  packsPerPlayer: { min: 1, max: 6 },
  packSize: { min: 1, max: 24 },
  slots: { min: 0, max: 24 },
} as const;

/** Reserved slots of every kind in one pack. */
export function reservedSlotsPerPack(config: DraftConfig): number {
  return config.legendSlots + config.battlefieldSlots + config.legendOrBattlefieldSlots;
}

/** Main-pool cards in one pack: everything the reserved slots don't claim. */
export function mainSlotsPerPack(config: DraftConfig): number {
  return config.packSize - reservedSlotsPerPack(config);
}

const totalFor = (config: DraftConfig, perPack: number) =>
  config.seats * config.packsPerPlayer * perPack;

/** Total main-pool cards a whole draft consumes. */
export function totalMainCardsNeeded(config: DraftConfig): number {
  return totalFor(config, mainSlotsPerPack(config));
}

/** Total cards each reserved slot type consumes across the whole draft. */
export function totalLegendsNeeded(config: DraftConfig): number {
  return totalFor(config, config.legendSlots);
}
export function totalBattlefieldsNeeded(config: DraftConfig): number {
  return totalFor(config, config.battlefieldSlots);
}
export function totalLegendOrBattlefieldNeeded(config: DraftConfig): number {
  return totalFor(config, config.legendOrBattlefieldSlots);
}

/** Cards a single seat ends up with. */
export function finalPoolSize(config: DraftConfig): number {
  return config.packsPerPlayer * config.packSize;
}

export interface ConfigProblem {
  field: string;
  message: string;
}

/**
 * Whether a config is coherent, independent of any particular cube.
 *
 * Pool sufficiency is a separate question answered by `generatePacks`, which
 * needs the cube. This only rejects settings that could never work.
 */
export function validateDraftConfig(config: DraftConfig): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const whole = (value: number) => Number.isInteger(value);

  const range = (field: keyof typeof DRAFT_LIMITS, value: number, label: string) => {
    const { min, max } = DRAFT_LIMITS[field];
    if (!whole(value) || value < min || value > max) {
      problems.push({ field, message: `${label} must be a whole number from ${min} to ${max}.` });
    }
  };

  range("seats", config.seats, "Players");
  range("packsPerPlayer", config.packsPerPlayer, "Packs per player");
  range("packSize", config.packSize, "Cards per pack");
  for (const [field, value, label] of [
    ["slots", config.legendSlots, "Legend slots"],
    ["slots", config.battlefieldSlots, "Battlefield slots"],
    ["slots", config.legendOrBattlefieldSlots, "Legend-or-battlefield slots"],
  ] as const) {
    range(field, value, label);
  }

  // A type is either reserved or shuffled, never both — otherwise the
  // guaranteed count is a lie, and the either-slot silently changes meaning
  // because the deck it draws from has been emptied into main.
  if (config.shuffleLegendsIntoPacks && config.legendSlots > 0) {
    problems.push({
      field: "legendSlots",
      message: "Legends can be reserved or shuffled into the packs, not both.",
    });
  }
  if (config.shuffleBattlefieldsIntoPacks && config.battlefieldSlots > 0) {
    problems.push({
      field: "battlefieldSlots",
      message: "Battlefields can be reserved or shuffled into the packs, not both.",
    });
  }
  if (!canUseEitherSlot(config) && config.legendOrBattlefieldSlots > 0) {
    problems.push({
      field: "legendOrBattlefieldSlots",
      message:
        "A legend-or-battlefield slot draws both types, so it needs both reserved. " +
        "Shuffling either one in leaves it nothing to guarantee.",
    });
  }

  const reserved = reservedSlotsPerPack(config);
  if (whole(reserved) && whole(config.packSize) && reserved > config.packSize) {
    problems.push({
      field: "packSize",
      message:
        `Reserved slots (${reserved}) exceed the pack size (${config.packSize}). ` +
        `Reserved slots come out of the pack, not on top of it.`,
    });
  }

  return problems;
}

/**
 * Which way round `round` passes.
 *
 * Derived rather than stored: the old fixed `["left","right","left"]` threw on
 * round four, which capped a draft at three packs. The alternation it produces
 * for rounds 0–2 is identical, so a draft dealt under the old scheme replays
 * the same way — and one that stored an explicit list still wins, so nothing
 * in flight can drift.
 */
export function passDirectionForRound(config: DraftConfig, round: number): PassDirection {
  const stored = config.passDirections?.[round];
  if (stored) return stored;
  return round % 2 === 0 ? "left" : "right";
}

/**
 * How many cards a Draftmancer sheet needs, which is **not** what our own
 * engine needs.
 *
 * Draftmancer's legend-or-battlefield slot is a weighted slot: it picks a
 * *sheet* 50/50 and then takes a card off it. There is no fallback. If the
 * chosen sheet is empty the whole booster generation fails, and the session
 * reports "Make sure there are enough cards in the list" with nothing to say
 * which sheet ran dry. Our engine does the opposite: `generatePacks` takes the
 * other type, then main, and only warns. So the same cube can draft here and
 * refuse to start there, which is why this lives beside the pool math rather
 * than inside the exporter.
 *
 * That makes the pooled question the wrong one. Legends plus battlefields
 * covering the slot total says nothing, because a slot that has already chosen
 * Legends cannot spend a battlefield. Each sheet has to cover **its own half**.
 *
 * And the half is a mean, not a bound. Legend draws across the draft are
 * binomial, so a cube holding exactly half the slot count fails about half the
 * time — measured, not theorised: 48 legends against 96 slots generated on
 * roughly one attempt in two, and 12 against 24 did the same. Draftmancer
 * retries, so that reads as "it errored a few times and then worked", which is
 * a worse thing to hand someone than a clean refusal. `SHEET_CONFIDENCE_Z`
 * buys the headroom that turns a coin flip into a near-certainty: 2.33 standard
 * deviations is about 99% per attempt, and it is what makes 96 slots ask for 59
 * rather than 48.
 */
const SHEET_CONFIDENCE_Z = 2.33;

/** Packs opened across the whole draft. */
export function totalPacks(config: DraftConfig): number {
  return config.seats * config.packsPerPlayer;
}

/**
 * Cards the named type needs on its own sheet for a Draftmancer export to
 * generate reliably.
 *
 * `share` is the slot's chance of choosing this sheet: 0.5 for the ordinary
 * either-slot, and 1 when the cube holds none of the other type, since the
 * exporter narrows the slot to a single sheet in that case.
 */
export function draftmancerSheetNeeded(
  config: DraftConfig,
  type: "legends" | "battlefields",
  share = 0.5,
): number {
  const packs = totalPacks(config);
  const dedicated =
    (type === "legends" ? config.legendSlots : config.battlefieldSlots) * packs;
  const flexible = config.legendOrBattlefieldSlots * packs;
  if (flexible === 0) return dedicated;
  // Binomial: the slot picks this sheet `share` of the time, so the draw count
  // has this mean and this spread. Dedicated slots are deterministic and add on
  // top rather than varying.
  const mean = flexible * share;
  const spread = Math.sqrt(flexible * share * (1 - share));
  return dedicated + Math.ceil(mean + SHEET_CONFIDENCE_Z * spread);
}
