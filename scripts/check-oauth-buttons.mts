/**
 * Guards how `/login` hands off to a provider.
 *
 * Split from `check:oauth` because this half needs a running server and that
 * half needs nothing — the pure rules are worth having on every push, and
 * pinning them behind a dev server would have cost that.
 *
 * The assertion that earns its place is the anchor one. `signInWithOAuth`
 * builds its URL in-process, so there is no outgoing request to intercept the
 * way `check:magic-link` intercepts `/auth/v1/otp` — but what *can* go wrong
 * visibly is the button becoming a plain link straight to the provider. That
 * skips the PKCE verifier cookie the action sets before returning the URL, and
 * the exchange then fails on the way back with "code verifier not found in
 * storage". A link looks correct in review and in a screenshot.
 *
 * Prerequisite: npm run dev.
 *
 *   npm run check:oauth-buttons
 */
import { OAUTH_PROVIDERS } from "../src/lib/auth-providers";

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const APP = process.env.APP_URL ?? "http://localhost:3000";

// The fetch is the only thing here that can throw — the assertions below are
// string and regex tests — so this is the whole error surface and there is no
// outer catch.
let html = "";
try {
  const res = await fetch(`${APP}/login`, { cache: "no-store" });
  html = await res.text();
  expect(res.ok, `/login returned ${res.status}`);
} catch (error) {
  failures.push(
    `could not load /login — is the dev server up? ${(error as Error).message}`,
  );
}

if (html) {
  for (const provider of OAUTH_PROVIDERS) {
    expect(
      html.includes(`value="${provider}"`),
      `/login should offer ${provider} as a form field`,
    );
  }

  expect(
    !/href="https:\/\/(accounts\.google\.com|discord\.com)/.test(html),
    "the provider buttons must post to the action, not link straight out — a " +
      "direct link skips the PKCE verifier cookie and the exchange then fails",
  );

  // The support burden this feature otherwise generates. Signing in matches on
  // email, so a different address creates a *second* account and the person's
  // cubes appear to have vanished; the app cannot detect that, because
  // `public.users` has no email column. Both halves are asserted because either
  // alone misleads: the first without the second reads as "you cannot use
  // another address at all", which is untrue — linking from Settings attaches
  // to the current account whatever address it carries.
  expect(
    html.includes("same email address"),
    "/login must say that signing in with a matching address connects to the " +
      "existing account",
  );
  expect(
    /different email address/.test(html) && /from Settings/.test(html),
    "/login must point a different email address at Settings rather than " +
      "implying it cannot be used — linking there does not require a match",
  );
}

if (failures.length > 0) {
  console.error(`oauth buttons check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log(
    `oauth buttons: ${OAUTH_PROVIDERS.join(", ")} offered as forms; no direct ` +
      `provider links; collision warning present`,
  );
  console.log("oauth buttons check passed");
}

// `process.exitCode` rather than `process.exit()`: this script's only resource
// is a `fetch`, and undici holds the socket open briefly after the response.
// Exiting inside that teardown aborts the process with a libuv assertion on
// Windows — the assertions all pass and the script still exits 127, which the
// gate reads as a failure. The checks that do call `process.exit()` close a
// Drizzle pool first and have nothing left in flight.
process.exitCode = failures.length > 0 ? 1 : 0;
