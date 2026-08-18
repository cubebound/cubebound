/**
 * Turning a cube into a Draftmancer Custom Card List.
 *
 * Draftmancer runs multiplayer drafts in the browser and accepts an uploaded
 * cube file. Its **custom card** support is what makes it work for a game it
 * has never heard of: a `[CustomCards]` block defines cards by name, type and
 * image URL, and the sheets below reference them by name. Cubecana already
 * runs Lorcana cubes through it this way. Since our own drafting is solo
 * against deliberately dumb bots, this is how a cube gets drafted by eight
 * actual people today.
 *
 * The file has three parts and the order is fixed — `[CustomCards]` must come
 * first:
 *
 * ```
 * [CustomCards]
 * [ { "name": ..., "mana_cost": ..., "type": ... }, ... ]
 * [Main(11)]
 * 1 Card Name
 * [Identity(1)]
 * 1 Legend Name
 * ```
 *
 * **Sheet lines reference cards by name, so names must be unique**, and that
 * is the one thing in here that can produce a file Draftmancer rejects rather
 * than a file that merely reads oddly. See `draftmancerName`.
 *
 * ## What is deliberately not mapped
 *
 * **Domains do not become MTG colors.** Draftmancer's `colors` field takes
 * W/U/B/R/G, and Riftbound has six domains — Fury, Calm, Mind, Body, Chaos and
 * Order. Five slots do not hold six domains, and picking which one to drop, or
 * doubling two up, would be exactly the silent guess `import-list.ts` refuses
 * to make about card names. Domains ride in `subtypes` instead, where they show
 * on the card's type line and cost nothing if a reader ignores them. The
 * consequence is that Draftmancer's bots have no colour signal to read, which
 * is what `rating` is for and why it is the field this export cares most about.
 *
 * **Power cost does not become mana symbols.** `mana_cost` carries the generic
 * energy cost only (`{3}`); the domain pips have no faithful MTG symbol, so
 * they are written into `oracle_text` where they stay readable. A card with no
 * energy cost at all — every legend, rune and battlefield — gets an empty
 * `mana_cost` rather than `{0}`, because costless is not zero: that distinction
 * is why the analytics curve excludes those cards instead of bucketing them.
 */

import { cardFull } from "./card-images";
import { displayType } from "./cube-analytics";
import { withChampionPrefix } from "./deck-export";
import {
  DEFAULT_LEGEND_OR_BATTLEFIELD_SLOTS,
  DEFAULT_PACK_SIZE,
} from "./draft/config";
import { titleCase } from "./riftbound";
import { rulesTextToPlain } from "./rules-text";

import type { CubeSection } from "./riftbound";

export interface DraftmancerSourceCard {
  id: string;
  name: string;
  champion: string | null;
  type: string;
  supertype: string | null;
  rarity: string;
  /**
   * Rarity of this card's *canonical* printing (`cards.base_id`). Showcase and
   * Promo are printing treatments rather than power tiers, so the rating has to
   * look through them — see `draftmancerRating`.
   */
  baseRarity: string | null;
  domains: string[];
  energyCost: number | null;
  powerCost: Record<string, number> | null;
  might: number | null;
  rulesText: string | null;
  setCode: string;
  collectorNo: string;
  imageFull: string | null;
  section: CubeSection;
  quantity: number;
}

/**
 * Rarity → Draftmancer's 0–5 bot rating.
 *
 * **This is a deliberate exception to a rule stated elsewhere.** "Rarity plays
 * no part in pack construction" — a cube is a curated pool and re-imposing
 * Riot's rarity spread would put their choices above the owner's. That still
 * holds for *dealing packs*. This is a different question: Draftmancer's bots
 * have never seen a Riftbound card and, with no colour signal to read either,
 * an unrated pool makes them pick at random. Printed rarity is a weak proxy for
 * power, but it is the only signal we have until pick data exists, and a weak
 * ordering beats none for the humans drafting against them.
 *
 * Only the four real power tiers are mapped. `Showcase` and `Promo` are
 * *treatments*: 120 showcase rows all resolve through `base_id` to a genuine
 * tier (70 Rare, 42 Epic, 6 Common), so looking through the printing rates a
 * showcase bomb as the bomb it is. Promo mostly does not resolve — 73 of 117
 * are their own base — and those fall to `NEUTRAL_RATING`.
 *
 * **The fallback is not 0.** Zero is the bottom of Draftmancer's scale, not an
 * absence, so unrated cards would be picked dead last — and there are 339 Promo
 * rows sitting in real cubes today. 2 is the middle of the 1–4 range actually in
 * use, so an unmapped card is neither favoured nor buried.
 */
/**
 * **Draftmancer validates `rarity` against a fixed set and rejects the whole
 * file otherwise**, with `Invalid mandatory property 'rarity' in custom card,
 * must be one of [common, uncommon, rare, mythic, special]`. Its own
 * documentation says the field is optional and unconstrained; the running
 * validator disagrees on both counts, so this is written against the validator.
 * Riftbound's own vocabulary — Epic, Showcase, Promo — is not accepted.
 */
export type DraftmancerRarity = "common" | "uncommon" | "rare" | "mythic" | "special";

/** Our four power tiers onto theirs. Epic is the top of our scale, so it maps
 *  to their top, `mythic`. */
const RIFTBOUND_RARITY: Record<string, DraftmancerRarity> = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "mythic",
};

/**
 * Where a card sits on Draftmancer's scale, looking through printing
 * treatments to the printing that actually carries a power tier.
 *
 * `Showcase` and `Promo` are treatments rather than tiers, and `base_id` is the
 * canonical printing: all 120 showcase rows resolve that way (70 Rare, 42
 * Epic), so a showcase bomb is rated as the bomb it is. Promo mostly does not —
 * 73 of 117 are their own base — and those land on `special`, which is exactly
 * what that value is for.
 */
export function draftmancerRarity(
  card: Pick<DraftmancerSourceCard, "rarity" | "baseRarity">,
): DraftmancerRarity {
  return (
    RIFTBOUND_RARITY[card.rarity?.toLowerCase() ?? ""] ??
    RIFTBOUND_RARITY[card.baseRarity?.toLowerCase() ?? ""] ??
    "special"
  );
}

/**
 * Bot rating, derived from the same resolution as the rarity so the two can
 * never disagree about what a card is.
 *
 * **`special` rates 2, not 0.** Zero is the bottom of Draftmancer's scale
 * rather than an absence, so an unresolvable card would be picked dead last —
 * and there are 339 Promo rows sitting in real cubes. 2 is the middle of the
 * 1–4 range actually in use, so it is neither favoured nor buried.
 */
const RARITY_RATING: Record<DraftmancerRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  mythic: 4,
  special: 2,
};

export function draftmancerRating(
  card: Pick<DraftmancerSourceCard, "rarity" | "baseRarity">,
): number {
  return RARITY_RATING[draftmancerRarity(card)];
}

/**
 * The name Draftmancer will know a card by.
 *
 * Legends are rebuilt as `Kai'Sa, Daughter of the Void`, because the sync
 * stores only the title with the champion in its own column — the same fix
 * `deckListName` makes for text decklists, sharing `withChampionPrefix` so the
 * rule has one definition.
 *
 * **Unlike `deckListName`, promo variant suffixes are kept.** That function
 * strips `(Metal)` so a list re-imports into other builders, which is right
 * there and wrong here: a cube running both `Battle Mistress` and
 * `Battle Mistress (Metal)` would produce two `[CustomCards]` entries with one
 * name, and since sheets reference cards by name the file becomes ambiguous.
 * They are also genuinely different pictures, which is most of what a custom
 * card is. Collisions are resolved by `uniqueNames` rather than by hoping.
 */
export function draftmancerName(card: DraftmancerSourceCard): string {
  return withChampionPrefix(card.name, card);
}

/**
 * Guarantees every card a distinct name, appending its printing id when two
 * collide.
 *
 * No name in the pool maps to two cards today, so this normally changes
 * nothing. It exists because the failure it prevents is silent: Draftmancer
 * would bind both sheet lines to whichever entry it saw last, and the cube
 * would draft with one card missing and another doubled.
 */
function uniqueNames(cards: DraftmancerSourceCard[]): Map<string, string> {
  const byName = new Map<string, DraftmancerSourceCard[]>();
  for (const card of cards) {
    const name = draftmancerName(card);
    byName.set(name, [...(byName.get(name) ?? []), card]);
  }

  const resolved = new Map<string, string>();
  for (const [name, group] of byName) {
    for (const card of group) {
      resolved.set(card.id, group.length === 1 ? name : `${name} (${card.id})`);
    }
  }
  return resolved;
}

/** `{"fury": 2}` → `2 Fury`, in the order the source listed them. */
function powerCostText(powerCost: Record<string, number> | null): string {
  if (!powerCost) return "";
  return Object.entries(powerCost)
    .map(([domain, pips]) => `${pips} ${titleCase(domain)}`)
    .join(", ");
}

/**
 * The source stores the cost/effect separator HTML-escaped — `Action&gt; Exhaust`
 * — and nothing downstream of us un-escapes it. On our own pages that text goes
 * into JSX, where React would render the entity as written; here it lands in a
 * plain-text JSON field that Draftmancer shows verbatim, so it has to be real
 * characters. Only the five predefined XML entities, decoded `&amp;` last so a
 * literal `&amp;gt;` does not become `>`.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Everything `mana_cost` cannot carry, in the field Draftmancer searches.
 *
 * Power cost and might have no MTG equivalent, and the rules text has to go
 * through `rulesTextToPlain` or it arrives full of `:rb_energy_1:` tokens.
 */
function oracleText(card: DraftmancerSourceCard): string {
  const parts: string[] = [];
  const power = powerCostText(card.powerCost);
  if (power) parts.push(`Power: ${power}`);
  if (card.might !== null) parts.push(`Might ${card.might}`);
  if (card.rulesText?.trim()) {
    parts.push(decodeEntities(rulesTextToPlain(card.rulesText)));
  }
  return parts.join("\n");
}

interface DraftmancerCustomCard {
  name: string;
  mana_cost: string;
  type: string;
  image?: string;
  set: string;
  collector_number: string;
  /** Typed to the accepted set so an unmapped value is a compile error rather
   *  than a file Draftmancer rejects on upload. */
  rarity: DraftmancerRarity;
  subtypes?: string[];
  rating: number;
  oracle_text?: string;
}

function customCard(
  card: DraftmancerSourceCard,
  name: string,
): DraftmancerCustomCard {
  const image = cardFull(card.imageFull);
  const oracle = oracleText(card);
  return {
    name,
    // Costless is an empty string, not `{0}` — see the note at the top.
    mana_cost: card.energyCost === null ? "" : `{${card.energyCost}}`,
    type: displayType(card),
    ...(image ? { image } : {}),
    set: card.setCode,
    collector_number: card.collectorNo,
    rarity: draftmancerRarity(card),
    ...(card.domains.length > 0 ? { subtypes: card.domains.map(titleCase) } : {}),
    rating: draftmancerRating(card),
    ...(oracle ? { oracle_text: oracle } : {}),
  };
}

/**
 * Sheet names. Single words with no punctuation, because the header syntax is
 * `[Name(CardsPerBooster)]` and a name containing brackets or parens has no
 * documented escape.
 */
const MAIN_SHEET = "Main";
const IDENTITY_SHEET = "Identity";

/**
 * Which sections are drafted, and where they land.
 *
 * The same rule the engine's `buildMainPool` applies: only `main` is the body
 * of the draft, legends and battlefields are the guaranteed slot, and runes,
 * sideboard and maybeboard are not drafted at all — runes are a resource
 * supplied outside the draft, the sideboard is cards the owner deliberately
 * took out, and the maybeboard is not part of the cube.
 */
const IDENTITY_SECTIONS: CubeSection[] = ["legends", "battlefields"];

/** The minimum a caller needs to describe an export without building one. */
export type PlannableCard = Pick<
  DraftmancerSourceCard,
  "section" | "quantity" | "imageFull"
>;

export interface DraftmancerPlan {
  /** Copies exported, not rows. */
  cardCount: number;
  mainCount: number;
  identityCount: number;
  /** Cards per booster the file declares. */
  packSize: number;
  mainPerPack: number;
  /** Zero when the cube has no legends or battlefields to reserve a slot for. */
  identityPerPack: number;
  /** Things the user should know before uploading. Never silent. */
  warnings: string[];
}

/**
 * What an export of these cards would contain.
 *
 * Split out from `toDraftmancerCubeFile` so the cube page can describe the
 * export — the counts, the pack arithmetic, the warnings — from the cards it
 * has **already loaded**, without a second round trip to build a file nobody
 * has asked for yet. Supabase is remote and a query costs ~60ms whatever it
 * returns, so a panel that costs a trip on every cube view is a panel that
 * taxes everyone who never clicks it.
 */
export function draftmancerPlan(cards: PlannableCard[]): DraftmancerPlan {
  const drafted = cards.filter(
    (card) => card.section === "main" || IDENTITY_SECTIONS.includes(card.section),
  );
  const main = drafted.filter((card) => card.section === "main");
  const identity = drafted.filter((card) => IDENTITY_SECTIONS.includes(card.section));

  const copies = (group: PlannableCard[]) =>
    group.reduce((sum, card) => sum + card.quantity, 0);

  const warnings: string[] = [];

  const missingArt = drafted.filter((card) => !card.imageFull).length;
  if (missingArt > 0) {
    warnings.push(
      `${missingArt} ${missingArt === 1 ? "card has" : "cards have"} no art stored, so ${
        missingArt === 1 ? "it" : "they"
      } will show as a blank frame in Draftmancer.`,
    );
  }

  const useIdentitySheet = identity.length > 0;
  if (!useIdentitySheet) {
    warnings.push(
      "This cube has no legends or battlefields, so every pack is main-section cards only.",
    );
  }

  const identityPerPack = useIdentitySheet ? DEFAULT_LEGEND_OR_BATTLEFIELD_SLOTS : 0;

  return {
    cardCount: copies(drafted),
    mainCount: copies(main),
    identityCount: copies(identity),
    packSize: DEFAULT_PACK_SIZE,
    mainPerPack: DEFAULT_PACK_SIZE - identityPerPack,
    identityPerPack,
    warnings,
  };
}

export interface DraftmancerCubeFile extends DraftmancerPlan {
  /** The file itself, ready to download. */
  text: string;
}

/**
 * Builds the file.
 *
 * The booster template mirrors our own: `DEFAULT_PACK_SIZE` cards, of which
 * `DEFAULT_LEGEND_OR_BATTLEFIELD_SLOTS` come from the identity sheet and the
 * rest from main — the Legacy booster, and the same arithmetic the draft
 * settings screen shows. Constants rather than literals so the two cannot
 * drift.
 *
 * A cube with no legends or battlefields exports as a **single** sheet of the
 * full pack size. An `[Identity(1)]` header over an empty list is a file
 * Draftmancer cannot build a booster from, and plenty of cubes legitimately
 * hold neither.
 */
export function toDraftmancerCubeFile(
  cards: DraftmancerSourceCard[],
): DraftmancerCubeFile {
  const drafted = cards.filter(
    (card) => card.section === "main" || IDENTITY_SECTIONS.includes(card.section),
  );
  const main = drafted.filter((card) => card.section === "main");
  const identity = drafted.filter((card) => IDENTITY_SECTIONS.includes(card.section));

  const plan = draftmancerPlan(drafted);
  const names = uniqueNames(drafted);

  const renamed = drafted.filter((card) => names.get(card.id) !== draftmancerName(card));
  const warnings = [...plan.warnings];
  if (renamed.length > 0) {
    warnings.push(
      `${renamed.length} ${
        renamed.length === 1 ? "card shares its name" : "cards share names"
      } with another printing, so the printing id was appended to keep them distinct.`,
    );
  }

  const sheetLines = (group: DraftmancerSourceCard[]) =>
    group.map((card) => `${card.quantity} ${names.get(card.id)!}`).sort();

  const sections = [
    "[CustomCards]",
    JSON.stringify(
      drafted.map((card) => customCard(card, names.get(card.id)!)),
      null,
      2,
    ),
    `[${MAIN_SHEET}(${plan.mainPerPack})]`,
    ...sheetLines(main),
  ];

  if (plan.identityPerPack > 0) {
    sections.push(
      `[${IDENTITY_SHEET}(${plan.identityPerPack})]`,
      ...sheetLines(identity),
    );
  }

  return { ...plan, warnings, text: `${sections.join("\n")}\n` };
}
