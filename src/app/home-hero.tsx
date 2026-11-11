import CardArt from "@/components/card-art";

import { loadHeroCards } from "./home-data";

/**
 * Where each of the three cards sits. Literal class strings, because Tailwind
 * scans source text and a computed offset would emit no CSS. The first pick is
 * the upright one in front.
 */
const FAN_POSITIONS = [
  "z-10 w-[180px] shadow-2xl shadow-black/45",
  "w-[170px] -translate-x-[110px] -rotate-[10deg]",
  "w-[170px] translate-x-[110px] rotate-[10deg]",
] as const;

/** The same footprint whether or not the cards have arrived, so the hero's
 *  text does not move when they do. Hidden below `lg`, per the mobile layout. */
const FAN_FRAME = "relative hidden h-[340px] w-[400px] shrink-0 items-center justify-center lg:flex";

export function HeroFanPlaceholder() {
  return <div aria-hidden className={FAN_FRAME} />;
}

/**
 * Three of the most-cubed cards, fanned, changing once a day.
 *
 * Decoration: the same cards are named and linked in the most-cubed row
 * further down, so this is hidden from assistive tech rather than announced
 * twice. The images are lazy, and a lazy image inside `display: none` is never
 * requested, so a phone does not pay for art it does not show.
 */
export default async function HeroFan() {
  const { cards, featured } = await loadHeroCards();
  if (cards.length < 3) return <HeroFanPlaceholder />;

  return (
    <div aria-hidden className={FAN_FRAME}>
      {/* Only over the daily picks: over the fallback covers it would be
          false. Hidden with the fan, which the most-cubed row repeats. */}
      {featured && (
        <p className="absolute inset-x-0 bottom-0 text-center text-xs text-subtle">
          Three of the most-cubed cards. New cards featured every day.
        </p>
      )}
      {cards.map((card, index) => (
        <div
          key={card.id}
          className={`absolute overflow-hidden rounded-[10px] bg-sunken ring-1 ring-black/5 dark:ring-white/10 ${FAN_POSITIONS[index]}`}
          style={{ aspectRatio: "5 / 7" }}
        >
          <CardArt src={card.src} name={card.name} turned={card.turned} className="object-cover" />
        </div>
      ))}
    </div>
  );
}
