/**
 * The sign-in methods an account can carry, and the rule about backups.
 *
 * **X/Twitter is deliberately absent.** Its OAuth 2.0 does not hand over an
 * email address without elevated API access, so an account created that way
 * has none: it cannot be linked to an existing account, it cannot be recovered
 * if the X account is lost, and there is no way to contact the person. That is
 * a different kind of account, not a different button.
 */

export const OAUTH_PROVIDERS = ["discord", "google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<string, string> = {
  email: "Email link",
  discord: "Discord",
  google: "Google",
};

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** Provider names on an account, deduplicated, in a stable order. */
export function providersOf(
  user: { identities?: { provider: string }[] | null } | null | undefined,
): string[] {
  const seen = new Set((user?.identities ?? []).map((identity) => identity.provider));
  // `email` first because it is the one everybody has; the rest alphabetically
  // so the list does not reorder itself between renders.
  return [...seen].sort((a, b) =>
    a === "email" ? -1 : b === "email" ? 1 : a.localeCompare(b),
  );
}

/**
 * Whether the account has a way in that does not depend on its mailbox.
 *
 * **Counting providers would be the wrong test.** Magic-link sign-in works for
 * any address on the account, including one that arrived from Discord — so an
 * account with a single `discord` identity still has two routes in, while an
 * account with a single `email` identity has one. The question is not "how
 * many identities" but "is email the only thing standing between this person
 * and their account", which is exactly what an OAuth identity fixes.
 */
export function hasBackupSignIn(
  user: { identities?: { provider: string }[] | null } | null | undefined,
): boolean {
  return providersOf(user).some(isOAuthProvider);
}
