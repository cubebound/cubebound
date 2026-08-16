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
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

const linkClass =
  "font-medium underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100";

/** Emphasis inside body copy — the term being defined, not a shout. */
function Term({ children }: { children: React.ReactNode }) {
  return (
    <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
  );
}

/**
 * The one page on the site that explains the format rather than serving the
 * tool.
 *
 * It exists for two reasons that point the same way. Search-wise, every other
 * page is a login wall or a list of other people's cubes, which gives a crawler
 * nothing to understand the site *by*; this is the page that says what a
 * Riftbound cube is. Product-wise, the most common piece of feedback has been
 * from people who did not know a feature existed — so wherever the copy names
 * something the site can do, it links there. The card-type mentions go to a
 * **pre-filtered** browser (`/cards?type=Legend`) rather than to `/cards`,
 * because "you need 24 legends" is only useful next to the legends.
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
            Welcome to the world of Riftbound Cubes! A cube is a curated pool of
            cards you draft over and over again. While Magic: the Gathering has a
            rich history and deep community of cube enthusiasts,
            Riftbound&rsquo;s legends, battlefields and runes make it work
            differently to a Magic cube. Here are some of the changes and nuances
            to running a cube for Riftbound specifically.
          </p>
        </header>

        <Section id="what-is-a-cube" title="What is a cube?">
          <p>
            Instead of opening sealed product, you build one pool of cards
            yourself, usually a few hundred, and draft out of it. A cube can be a
            list of the most powerful cards printed, a budget pool, a single-set
            pool, or a themed one built around a region or a mechanic. The
            possibilities are endless and this is a big part of why Cubes live in
            my head rent free!
          </p>
          <p>
            Cubes can be singleton (one of each card) or you can have more than
            one copy of cards in the cube (looking at you, spiderling enjoyers).
            Running three copies of a card you want turning up often is a normal
            thing to do, and it is how you control how frequently an effect shows
            up in packs.
          </p>
        </Section>

        <Section id="riftbound-differences" title="What Riftbound changes">
          <p>
            Riftbound decks are not one pile of cards. A deck is a{" "}
            <Link href="/cards?type=Legend" className={linkClass}>
              legend
            </Link>
            , a main deck, a separate{" "}
            <Link href="/cards?type=Rune" className={linkClass}>
              rune deck
            </Link>
            , and a set of{" "}
            <Link href="/cards?type=Battlefield" className={linkClass}>
              battlefields
            </Link>
            . That has three consequences for drafting.
          </p>
          <p>
            <Term>Legends determine domain identity.</Term> Your legend
            determines which two (or sometimes three in limited) domains you can
            access, and you play exactly one. A legend in a normal pack is a card
            most seats cannot use, and a drafter who never sees one has no deck
            at all. That is why many cubes guarantee legends rather than leaving
            them to the shuffle.
          </p>
          <p>
            <Term>Battlefields are a small, separate slot.</Term> You need a
            handful and no more, so they have a similar problem. Valuable to
            everyone, but only up to a point.
          </p>
          <p>
            <Term>Runes are resources, not picks.</Term> Almost every cube
            supplies them from outside the draft, the way a Magic cube supplies
            basic lands — drafting them would mean spending picks on your own
            mana base. A cube with no runes in it at all is perfectly normal.
          </p>
          <p>
            Signature spells are another interesting wrinkle. Most cubes I have
            seen allow any deck to play signature spells regardless of legend.
            This creates some very interesting legend and signature spell
            combinations that are not possible in constructed! Feel free to
            experiment with your own cube here.
          </p>
        </Section>

        <Section id="sizing" title="Sizing the pool">
          <p>
            When deciding how many cards to put in the cube, you need to consider
            a few things. How many players will be drafting the cube? How many
            packs will you open? How many cards will be in each pack? At a
            baseline, you need enough cards to fill the packs. Beyond that, it
            can be interesting to think about whether every card shows up every
            draft (if there are exactly enough cards to fill the packs), or if
            there will be some cards that are not in the packs on any given draft
            (more cards than are required). There are so many permutations and
            ways to play a cube. The best way to learn what your group prefers is
            just to try something and see how it goes! Iteration is the name of
            the game with a cube.
          </p>
          <p>
            Legends and battlefields need their own count. If every pack
            guarantees one legend, an eight-seat three-pack draft wants{" "}
            <Link href="/cards?type=Legend" className={linkClass}>
              24 legends
            </Link>
            . The{" "}
            <Link href="/cards" className={linkClass}>
              Cubebound card browser
            </Link>{" "}
            filters the full pool by set, domain, energy cost, type, rarity and
            trait, which is the fastest way to see what is actually available in
            a domain before you commit to it.
          </p>
        </Section>

        <Section id="pack-structure" title="How to structure packs">
          <p>There are two approaches, and they suit different cubes.</p>
          <ol className="ml-5 list-decimal space-y-4">
            <li>
              <Term>Reserved slots.</Term> Each pack contains a fixed number of
              legends and battlefields, and the rest comes from the main pool.
              Riftbound&rsquo;s own Legacy booster is the model most cubes copy:
              twelve cards, of which one is a legend or a battlefield chosen at
              random. Reserved slots come out of the pack size rather than on top
              of it. Twelve cards with one reserved slot is eleven main cards.
              This guarantees every seat gets shots at the cards their deck
              cannot do without.
            </li>
            <li>
              <Term>Shuffle everything together.</Term> Legends and battlefields
              go into the main pile and turn up wherever the shuffle puts them.
              Simpler, and some groups prefer the swinginess, but you should
              expect seats to occasionally end up with no legend, so agree in
              advance what happens when they do.
            </li>
          </ol>
          <p>
            A common third variant is a <Term>legend phase</Term>: before the
            main draft, everyone drafts a small pack of legends only (two per
            drafter is typical) so every seat starts with an identity and drafts
            toward it. It costs one extra pack and removes the worst outcome in
            the format.
          </p>
        </Section>

        <Section id="house-rules" title="House rules worth agreeing up front">
          <p>
            One of the most exciting things about Riftbound cubes is that
            drafting conventions are still community-defined. The game is young
            enough that no single approach has settled. The questions worth
            answering before you and your friends start a session:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <Term>Deck size.</Term> A fixed number keeps games comparable, and
              plenty of cubes settle on one rather than using the constructed
              minimum. Whatever you pick, the size you choose interacts with how
              many cards each drafter ends up with, so it is worth revisiting
              after your first session.
            </li>
            <li>
              <Term>Legends.</Term> Drafted, or picked freely after the draft the
              way runes are? Some groups treat the whole legend pool as available
              to everyone, which removes legend screw entirely and makes the
              draft purely about the main deck.
            </li>
            <li>
              <Term>Battlefields.</Term> Drafted, or a shared pool everyone
              builds from?
            </li>
            <li>
              <Term>Domains.</Term> Up to three is the standard limited rule.
              Depending on how the cube is designed though, two domains only can
              be totally doable.
            </li>
          </ul>
          <p>
            Whatever you land on, write it down where drafters will see it. Every
            cube on this site has a <Term>primer</Term>, a long-form write-up
            attached to the cube, and it is the right home for exactly this.
          </p>
        </Section>

        <Section id="start" title="Starting your own">
          <p>
            The quickest way in is to look at what other people have built.{" "}
            <Link href="/explore" className={linkClass}>
              Explore
            </Link>{" "}
            lists public cubes, and any of them can be cloned into your own
            account in one click and changed from there.
          </p>
          <p>
            When you are ready to test it, you can{" "}
            <Link href="/explore" className={linkClass}>
              draft any cube on the site
            </Link>{" "}
            against bots without waiting for a group, choosing seats, packs, pack
            size and how legends and battlefields are dealt. The bots are very
            stupid for now, but it is so satisfying to see your cube at work!
          </p>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            Good luck out on the Rift and happy cube-ing!
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
            <Link
              href="/cards"
              className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Browse cards
            </Link>
          </div>
        </Section>
      </article>
    </div>
  );
}
