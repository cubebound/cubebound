import type { Metadata } from "next";
import Link from "next/link";

import { btn, link } from "@/lib/ui";

export const metadata: Metadata = {
  title: "How to Draft a Riftbound Cube with Friends on Draftmancer",
  description:
    "Export any Riftbound cube from cubebound.gg as a Draftmancer card list and " +
    "draft it with friends in the browser, step by step.",
  alternates: { canonical: "/guides/draftmancer" },
};

/**
 * Step by step: from a cube here to a live draft with friends on Draftmancer.
 *
 * Draftmancer is how cubebound does multiplayer, rather than lobbies of its
 * own (see exports.md), so the path to it deserves a page that can be linked
 * from the home page and sent to a friend. The Draftmancer steps repeat the
 * three already on the export tab (`draftmancer-export.tsx`); if its UI moves,
 * both change together.
 *
 * Like the cube-drafting guide it makes no database call, which is why it has
 * no `loading.tsx`: there is nothing for a skeleton to stand in for.
 */
export default function DraftmancerGuide() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <article className="text-muted">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-subtle">Guide</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">
            Draft a cube with friends on Draftmancer
          </h1>
          <p className="mt-4 text-lg leading-relaxed">
            Draftmancer runs drafts for a whole table in the browser. Any cube on
            cubebound exports as a file Draftmancer can load, so you can draft
            it together in a few minutes. Exporting doesn&rsquo;t need an
            account.
          </p>
        </header>

        <ol className="mt-10 list-decimal space-y-6 pl-5 marker:font-semibold marker:text-ink">
          <li>
            <h2 className="font-semibold text-ink">Pick a cube</h2>
            <p className="mt-1">
              Open one of{" "}
              <Link href="/cubes" className={link}>
                your cubes
              </Link>
              , or find one on{" "}
              <Link href="/explore" className={link}>
                Explore
              </Link>
              .
            </p>
          </li>
          <li>
            <h2 className="font-semibold text-ink">Press Draft</h2>
            <p className="mt-1">
              The draft screen opens on <strong className="font-medium text-ink">Export to
              Draftmancer</strong>. Set how many packs each player opens. Players
              only checks the cube is big enough; the Draftmancer host sets the
              real number.
            </p>
          </li>
          <li>
            <h2 className="font-semibold text-ink">Download the cube file</h2>
            <p className="mt-1">It&rsquo;s a small text file with every card and its art.</p>
          </li>
          <li>
            <h2 className="font-semibold text-ink">Create a session on Draftmancer</h2>
            <p className="mt-1">
              Open{" "}
              <a
                href="https://draftmancer.com"
                target="_blank"
                rel="noreferrer noopener"
                className={link}
              >
                draftmancer.com
              </a>{" "}
              and create a session. Whoever does this is the host.
            </p>
          </li>
          <li>
            <h2 className="font-semibold text-ink">Load the cube</h2>
            <p className="mt-1">
              Under <strong className="font-medium text-ink">Settings → Card List</strong>,
              choose <strong className="font-medium text-ink">Load Custom Card List</strong>{" "}
              and pick the file you downloaded.
            </p>
          </li>
          <li>
            <h2 className="font-semibold text-ink">Invite your friends and start</h2>
            <p className="mt-1">
              Share the session with your friends so they join the same one,
              then start the draft.
            </p>
          </li>
        </ol>

        <p className="mt-10">
          New to cubes?{" "}
          <Link href="/guides/riftbound-cube-drafting" className={link}>
            Read how Riftbound cube drafting works
          </Link>
          .
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/explore" className={btn.primary}>
            Find a cube to draft
          </Link>
          <Link href="/cubes/new" className={btn.secondary}>
            Build your own
          </Link>
        </div>
      </article>
    </div>
  );
}
