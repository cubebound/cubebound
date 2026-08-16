import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to Build and Draft a Riftbound Cube",
  description:
    "What a cube is in Riftbound, how legends, battlefields and runes change " +
    "drafting compared to Magic, how to size your pool and packs, and the house " +
    "rules groups actually use.",
  alternates: { canonical: "/guides/riftbound-cube-drafting" },
};

/** A section heading plus its body, so the page's rhythm is defined once. */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 scroll-mt-6" id={id}>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

const linkClass =
  "font-medium underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100";

/**
 * The one page on the site that explains the format rather than serving the
 * tool.
 *
 * It exists for two reasons that point the same way. Search-wise, every other
 * page is a login wall or a list of other people's cubes, which gives a crawler
 * nothing to understand the site *by*; this is the page that says what a
 * Riftbound cube is. Product-wise, the most common piece of feedback has been
 * from people who did not know a feature existed — so the guide links into the
 * parts of the app it describes rather than only describing them.
 *
 * Like every route here it is dynamic — the root layout resolves
 * `metadataBase` from the request — but it makes **no database call**, so it
 * renders in single-digit milliseconds. That is why it has no `loading.tsx`
 * despite the general rule: the boundary exists to stop a page appearing to
 * hang during a server render that waits on Supabase, and there is nothing
 * here to wait for. A skeleton would flash rather than help.
 */
export default function CubeDraftingGuide() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <article className="text-zinc-700 dark:text-zinc-300">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Guide
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            How to build and draft a Riftbound cube
          </h1>
          <p className="mt-4 text-lg leading-relaxed">
            A cube is a hand-picked pool of cards you draft over and over with
            the same group. Riftbound&rsquo;s legends, battlefields and runes make
            it work differently to a Magic cube — here is what changes, and how
            groups are actually running it.
          </p>
        </header>

        <Section id="what-is-a-cube" title="What a cube is">
          <p>
            Instead of opening sealed product, you build one pool of cards
            yourself — a few hundred, chosen deliberately — and draft out of it.
            The same cards come back every time, so the format is whatever its
            owner decides it is. A cube can be a greatest-hits list of the most
            powerful cards printed, a budget pool, a single-set pool, or a
            themed one built around a region or a mechanic.
          </p>
          <p>
            Nothing about a cube is singleton. Running three copies of a card
            you want turning up often is a normal thing to do, and it is how you
            control how frequently an effect shows up in packs.
          </p>
        </Section>

        <Section id="riftbound-differences" title="What Riftbound changes">
          <p>
            Riftbound decks are not one pile of cards. A deck is a{" "}
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              legend
            </strong>
            , a main deck, a separate{" "}
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              rune deck
            </strong>
            , and a set of{" "}
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              battlefields
            </strong>
            . That has three consequences for drafting.
          </p>
          <p>
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              Legends are identity, not playables.
            </strong>{" "}
            Your legend determines which two domains you can access, and you
            play exactly one. A legend in a normal pack is a card most seats
            cannot use, and a drafter who never sees one has no deck at all.
            That is why most cubes guarantee legends rather than leaving them to
            the shuffle.
          </p>
          <p>
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              Battlefields are a small, separate slot.
            </strong>{" "}
            You need a handful and no more, so they have the same problem in
            miniature: valuable to everyone, but only up to a point.
          </p>
          <p>
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              Runes are resources, not picks.
            </strong>{" "}
            They are the cards you exhaust and recycle to produce Energy and
            Power. Almost every cube supplies them from outside the draft, the
            way a Magic cube supplies basic lands — drafting them would mean
            spending picks on your own mana base. A cube with no runes in it at
            all is a perfectly normal cube.
          </p>
          <p>
            One more thing worth knowing before you build: a deck may use cards
            from up to three domains, while a legend grants two. Signature
            spells are tied to a champion by flavour, not by a deckbuilding
            restriction — you can play one without running that champion. And no
            legend or champion is strictly required.
          </p>
        </Section>

        <Section id="sizing" title="Sizing the pool">
          <p>
            The floor is set by arithmetic:{" "}
            <em>seats × packs per player × cards per pack</em>. Eight players
            drafting three packs of twelve need 288 cards to deal from, before
            you have decided anything about what is in them. Most groups build
            somewhat above the floor so the pool is not fully exhausted every
            time, which keeps drafts from repeating themselves.
          </p>
          <p>
            Legends and battlefields need their own count. If every pack
            guarantees one legend, an eight-seat three-pack draft wants 24
            legends — more than a lot of cubes hold. This is the number people
            most often discover too late, so it is worth checking before the
            first draft rather than during it.
          </p>
          <p>
            Our{" "}
            <Link href="/cards" className={linkClass}>
              card browser
            </Link>{" "}
            filters the full pool by set, domain, energy cost, type, rarity and
            trait, which is the fastest way to see what is actually available in
            a domain before you commit to it.
          </p>
        </Section>

        <Section id="pack-structure" title="How to structure packs">
          <p>
            There are two approaches, and they suit different cubes.
          </p>
          <p>
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              Reserved slots.
            </strong>{" "}
            Each pack contains a fixed number of legends and battlefields, and
            the rest comes from the main pool. Riftbound&rsquo;s own Legacy
            booster is the model most cubes copy: twelve cards, of which one is
            a legend <em>or</em> a battlefield chosen at random. Reserved slots
            come out of the pack size rather than on top of it — twelve cards
            with one reserved slot is eleven main cards. This guarantees every
            seat gets shots at the cards their deck cannot do without.
          </p>
          <p>
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              Shuffle everything together.
            </strong>{" "}
            Legends and battlefields go into the main pile and turn up wherever
            the shuffle puts them. Simpler, and some groups prefer the swinginess
            — but you should expect seats to occasionally end up with no legend,
            so agree in advance what happens when they do.
          </p>
          <p>
            A common third variant is a{" "}
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              legend phase
            </strong>
            : before the main draft, everyone drafts a small pack of legends
            only — two per drafter is typical — so every seat starts with an
            identity and drafts toward it. It costs one extra pack and removes
            the worst outcome in the format.
          </p>
        </Section>

        <Section id="house-rules" title="House rules worth agreeing up front">
          <p>
            Cube drafting conventions in Riftbound are still community-defined,
            and the game is young enough that no single approach has settled.
            The questions worth answering before you sit down:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                Deck size.
              </strong>{" "}
              Many cubes fix it — exactly 25 cards is a common choice — rather
              than using the constructed minimum.
            </li>
            <li>
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                Legends.
              </strong>{" "}
              Drafted, or picked freely after the draft the way runes are? Some
              groups treat the whole legend pool as available to everyone, which
              removes legend screw entirely and makes the draft purely about the
              main deck.
            </li>
            <li>
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                Runes.
              </strong>{" "}
              Almost always supplied freely, but say so, and say how many.
            </li>
            <li>
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                Battlefields.
              </strong>{" "}
              Drafted, or a shared pool everyone builds from?
            </li>
            <li>
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                Domains.
              </strong>{" "}
              Up to three is the constructed rule; some cubes cap at two to keep
              decks focused when the card pool is small.
            </li>
          </ul>
          <p>
            Whatever you land on, write it down where drafters will see it. Every
            cube on this site has a{" "}
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              primer
            </strong>{" "}
            — a long-form write-up attached to the cube — and it is the right
            home for exactly this. The most common confusion we hear about is a
            house rule that lived only in someone&rsquo;s head.
          </p>
        </Section>

        <Section id="start" title="Starting your own">
          <p>
            The quickest way in is to look at what other people have built.{" "}
            <Link href="/explore" className={linkClass}>
              Explore
            </Link>{" "}
            lists public cubes, and any of them can be cloned into your own
            account in one click and changed from there — a working cube is a far
            better starting point than an empty one.
          </p>
          <p>
            When you are ready to test it, you can draft any cube on the site
            against bots without waiting for a group, choosing seats, packs, pack
            size and how legends and battlefields are dealt. It is the cheapest
            way to find out that your curve is wrong or that you are four legends
            short.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/cubes/new"
              className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Build a cube
            </Link>
            <Link
              href="/explore"
              className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Browse cubes
            </Link>
          </div>
        </Section>
      </article>
    </div>
  );
}
