import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What cubebound.gg stores, who it is shared with, and how to get it deleted.",
  alternates: { canonical: "/privacy" },
};

/** The date the wording below last changed. Update it when the policy does. */
const LAST_UPDATED = "16 August 2026";

/** Where privacy requests go. Defined once — it appears four times below, and
 *  a policy that lists an address nobody reads is worse than no policy. */
const CONTACT = "contact@cubebound.gg";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

const linkClass = "underline underline-offset-2 hover:text-ink";

/**
 * The privacy policy.
 *
 * Written to describe what the code actually does, so it has to be updated
 * with the code rather than treated as boilerplate. Specifically: the cookie
 * list matches `THEME_COOKIE`, `CUBE_VIEW_COOKIE` and `BACKUP_NOTICE_COOKIE`,
 * "analytics" means the
 * Vercel Analytics component in the root layout, and the deletion section says
 * plainly that self-serve account deletion does not exist yet — promising a
 * button that isn't built would be the one genuinely dishonest thing this page
 * could do.
 */
export default function PrivacyPolicy() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <article className="text-sm leading-relaxed text-muted">
        <h1 className="text-3xl font-semibold text-ink">
          Privacy Policy
        </h1>
        <p className="mt-2 text-xs text-subtle">Last updated {LAST_UPDATED}</p>

        <p className="mt-6">
          cubebound.gg is a free, unofficial fan project for building and
          drafting Riftbound cubes. It is run by one person. This page describes
          everything it stores about you, in plain language.
        </p>
        <p className="mt-3 font-medium text-ink">
          We do not sell your data, show advertising, or use tracking or
          advertising cookies.
        </p>

        <Section title="What we store">
          <p>If you create an account, we store:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="font-medium">Your email address</strong>, used
              only to sign you in and, rarely, to contact you about the site.
            </li>
            <li>
              <strong className="font-medium">Your username</strong>, which is
              public and appears in the address of every cube you make.
            </li>
            <li>
              <strong className="font-medium">The content you create</strong> —
              cubes, card lists, descriptions, primers, drafts and which cubes
              you follow.
            </li>
          </ul>
          <p>
            Cubes you mark <em>public</em> are visible to anyone and are listed
            on Explore and in search engines. <em>Unlisted</em> cubes are not
            listed anywhere but can be opened by anyone who has the link, so
            treat that link as the only thing keeping them private.{" "}
            <em>Private</em> cubes are visible only to you.
          </p>
          <p>
            We do not ask for your real name, address, phone number or payment
            details, because the site has no use for any of them.
          </p>
        </Section>

        <Section title="Cookies">
          <p>We set four kinds of cookie, all of them functional:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="font-medium">Sign-in cookies</strong>, set by
              our authentication provider, which keep you logged in.
            </li>
            <li>
              <strong className="font-medium">
                <code className="font-mono text-xs">cubebound.theme</code>
              </strong>{" "}
              — whether you chose light or dark.
            </li>
            <li>
              <strong className="font-medium">
                <code className="font-mono text-xs">cubebound.cube-view2</code>
              </strong>{" "}
              — whether you prefer the list or image view of a cube.
            </li>
            <li>
              <strong className="font-medium">
                <code className="font-mono text-xs">
                  cubebound.backup-notice
                </code>
              </strong>{" "}
              — that you dismissed the reminder to add a second way of signing
              in.
            </li>
          </ul>
          <p>
            None of these track you across other websites, and we do not use
            advertising cookies.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            We count page views using Vercel Analytics, which is cookieless and
            does not build a profile of you or follow you between sites. It
            records which pages are visited, not who visited them.
          </p>
          <p>
            We may also record technical error reports when something breaks, to
            help fix it. These contain the error and the page it happened on.
          </p>
        </Section>

        <Section title="Who else is involved">
          <p>
            The site runs on services that necessarily see some of this data:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="font-medium">Vercel</strong> — hosting and
              analytics.
            </li>
            <li>
              <strong className="font-medium">Supabase</strong> — the database
              and sign-in system, which stores your email address.
            </li>
            <li>
              <strong className="font-medium">Riot Games</strong> — card images
              are served directly from Riot&rsquo;s content network, so loading a
              page that shows cards makes a request to their servers.
            </li>
          </ul>
          <p>
            That is the complete list. We do not share your data with anyone
            else, and nobody buys it from us.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p>
            You can delete any cube you have made at any time, from that
            cube&rsquo;s settings page. Deleting a cube deletes its cards, its
            change history and its followers.
          </p>
          <p>
            <strong className="font-medium text-ink">
              Deleting your whole account is not yet self-serve.
            </strong>{" "}
            It is being built. In the meantime, email{" "}
            <a href={`mailto:${CONTACT}`} className={linkClass}>
              {CONTACT}
            </a>{" "}
            from the address you signed up with and we will delete your account,
            your cubes and your drafts. You can also ask for a copy of what we
            hold about you at the same address.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The site is not directed at children under 13, and we do not
            knowingly collect their information. If you believe a child has
            created an account, email {CONTACT} and we will remove it.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes in a way that affects what we collect or who
            sees it, the date at the top will change and the change will be
            noted here. The site is small enough that this should be rare.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions, requests or complaints:{" "}
            <a href={`mailto:${CONTACT}`} className={linkClass}>
              {CONTACT}
            </a>
            .
          </p>
        </Section>

        <p className="mt-10 border-t border-line pt-6 text-xs text-subtle">
          cubebound.gg is not endorsed by Riot Games and does not reflect the
          views or opinions of Riot Games or anyone officially involved in
          producing or managing Riot Games properties. See also our{" "}
          <Link href="/guides/riftbound-cube-drafting" className={linkClass}>
            guide to cube drafting
          </Link>
          .
        </p>
      </article>
    </div>
  );
}
