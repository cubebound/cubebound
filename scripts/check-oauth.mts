/**
 * Guards the OAuth rules that need nothing to run.
 *
 * The backup rule, the provider allowlist, and the two invariants the sign-in
 * actions must keep. All pure, so this runs in **CI on every push** — these are
 * auth invariants, and the cost of catching them a week later at gate time is
 * that someone has already built on the broken assumption.
 *
 * The `/login` markup assertions live in `check:oauth-buttons`, which needs a
 * server. Splitting them is why this one can run per-push at all.
 *
 * Two things no check can exercise: a real consent screen, and `linkIdentity`,
 * which needs manual linking switched on in the Supabase dashboard. **That is
 * stated plainly rather than papered over.**
 *
 *   npm run check:oauth
 */
import { readFileSync } from "node:fs";

import {
  hasBackupSignIn,
  isOAuthProvider,
  OAUTH_PROVIDERS,
  providersOf,
} from "../src/lib/auth-providers";

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const id = (provider: string) => ({ provider });

try {
  // ---- who is told to add a backup -------------------------------------
  // Counting identities would be the wrong test: magic-link sign-in works for
  // any address on the account, so a Discord-only account already has two ways
  // in while an email-only account has one.
  expect(
    !hasBackupSignIn({ identities: [id("email")] }),
    "an email-only account must be prompted for a backup",
  );
  expect(
    hasBackupSignIn({ identities: [id("email"), id("discord")] }),
    "email + Discord must count as having a backup",
  );
  expect(
    hasBackupSignIn({ identities: [id("discord")] }),
    "a Discord-only account has a backup: magic link still reaches its address",
  );
  expect(
    hasBackupSignIn({ identities: [id("google")] }),
    "a Google-only account likewise",
  );
  expect(!hasBackupSignIn({ identities: [] }), "no identities means no backup");
  expect(!hasBackupSignIn(null), "a missing user must not be told it is safe");

  // ---- provider list -----------------------------------------------------
  expect(
    providersOf({ identities: [id("discord"), id("email"), id("discord")] }).join(",") ===
      "email,discord",
    "providers must be deduplicated with email first and a stable order",
  );
  // X is deliberately absent: its OAuth 2.0 hands over no email, so an account
  // made with it cannot be linked, recovered or contacted.
  expect(!isOAuthProvider("twitter"), "twitter must not be an offered provider");
  expect(!isOAuthProvider("x"), "x must not be an offered provider");
  expect(!isOAuthProvider("../../etc/passwd"), "junk must not pass validation");
  expect(OAUTH_PROVIDERS.length === 2, "expected exactly Discord and Google");

  // ---- the actions validate rather than trust ---------------------------
  const actions = readFileSync("src/app/auth/actions.ts", "utf8");
  for (const name of ["signInWithProvider", "linkProvider"]) {
    const body = actions.split(`export async function ${name}`)[1]?.split("\nexport ")[0];
    expect(Boolean(body), `${name} is missing`);
    if (!body) continue;
    expect(
      body.includes("isOAuthProvider"),
      `${name} must validate the provider — it arrives from a form`,
    );
    expect(
      body.includes("authCallbackUrl"),
      `${name} must build its redirect with authCallbackUrl, or Supabase falls ` +
        `back to the dashboard Site URL and sign-in never completes`,
    );
  }

  console.log(
    `oauth: ${OAUTH_PROVIDERS.join(", ")} offered; backup rule and provider ` +
      `validation asserted`,
  );
  console.log(
    "  not covered, by nature: a real consent screen, and linkIdentity, which " +
      "needs manual linking enabled in the Supabase dashboard.",
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
}

if (failures.length > 0) {
  console.error(`oauth check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("oauth check passed");
}
process.exit(failures.length > 0 ? 1 : 0);
