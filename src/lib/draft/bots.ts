/**
 * Bot drafters — deliberately dumb for milestone A.
 *
 * A bot commits to the domains of its very first pick and thereafter takes a
 * random card that shares one of them, falling back to a random card when the
 * pack offers nothing in-domain. That is all: no curve, no signal reading, no
 * card quality. Milestone B replaces this.
 *
 * Dumb is still useful. It drains the packs of a plausible *shape* — each seat
 * pulls consistently from two domains — so the human sees cards get taken in a
 * way that resembles a real table, without pretending to a skill the engine
 * does not have. Anything cleverer here would be guesswork we could not
 * measure, and it would be harder to tell a bot bug from a bot opinion.
 */

import type { DraftCard } from "./packs";
import { createRng } from "./rng";

/** At most two domains, taken from the bot's first pick. */
export const MAX_BOT_DOMAINS = 2;

/**
 * The domains a bot locks onto, given its opening pick.
 *
 * A first pick with one domain commits the bot to one; there is nothing
 * principled to invent for the second, and guessing would make the bot's
 * behaviour depend on a coin flip nobody can see. A colourless first pick
 * commits it to nothing, so it keeps drafting at random until told otherwise.
 */
export function commitDomains(firstPick: DraftCard): string[] {
  return firstPick.domains.slice(0, MAX_BOT_DOMAINS);
}

export function isInDomain(card: DraftCard, committed: readonly string[]): boolean {
  if (committed.length === 0) return false;
  return card.domains.some((domain) => committed.includes(domain));
}

/**
 * Chooses a bot's pick from the pack in front of it.
 *
 * `committed` is null before the bot has picked anything. The rng must be
 * derived from the draft seed plus this seat and pick, so the choice replays
 * identically regardless of the order seats are evaluated in.
 */
export function chooseBotPick(
  pack: readonly DraftCard[],
  committed: readonly string[] | null,
  seed: string,
  round: number,
  pickNumber: number,
  seat: number,
): DraftCard | undefined {
  if (pack.length === 0) return undefined;
  const rng = createRng(seed, "bot", round, pickNumber, seat);

  if (committed && committed.length > 0) {
    const inDomain = pack.filter((card) => isInDomain(card, committed));
    if (inDomain.length > 0) return rng.pick(inDomain);
  }
  return rng.pick(pack);
}
