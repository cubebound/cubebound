/**
 * Username rules. Usernames appear in URLs as /cube/{username}/{slug}, so they
 * must be URL-safe with no escaping, and unambiguous when typed or shared.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/**
 * Reserved because they would be confusing or would collide if we ever add
 * top-level profile routes at /{username}.
 */
const RESERVED = new Set([
  "about",
  "admin",
  "api",
  "auth",
  "card",
  "cards",
  "cube",
  "cubes",
  "draft",
  "help",
  "login",
  "logout",
  "me",
  "new",
  "root",
  "search",
  "settings",
  "signin",
  "signout",
  "signup",
  "static",
  "support",
  "user",
  "users",
  "welcome",
  "www",
]);

export type UsernameCheck =
  | { ok: true; username: string }
  | { ok: false; error: string };

/**
 * Validates and canonicalizes a username. Case is folded to lower so that
 * /cube/Ana and /cube/ana can't be two different people.
 */
export function checkUsername(input: string): UsernameCheck {
  const username = input.trim().toLowerCase();

  if (username.length < USERNAME_MIN) {
    return { ok: false, error: `Usernames must be at least ${USERNAME_MIN} characters.` };
  }
  if (username.length > USERNAME_MAX) {
    return { ok: false, error: `Usernames must be at most ${USERNAME_MAX} characters.` };
  }
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return { ok: false, error: "Use only letters, numbers, hyphens and underscores." };
  }
  if (!/^[a-z0-9]/.test(username) || !/[a-z0-9]$/.test(username)) {
    return { ok: false, error: "Usernames must start and end with a letter or number." };
  }
  if (RESERVED.has(username)) {
    return { ok: false, error: "That username is reserved." };
  }

  return { ok: true, username };
}
