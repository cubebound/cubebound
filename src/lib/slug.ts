/**
 * Cube slugs. They sit in `/cube/{username}/{slug}`, so they must be URL-safe
 * without escaping and must not collide with the editor's sub-routes.
 */

export const SLUG_MAX = 60;

/** Sub-routes that live under a cube path, plus obvious action words. */
const RESERVED = new Set(["new", "edit", "settings", "delete", "clone"]);

/** "My Fury Cube!" -> "my-fury-cube" */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");

  // A name of only punctuation or non-Latin script leaves nothing usable.
  if (!slug || RESERVED.has(slug)) return `${slug || "cube"}-1`;
  return slug;
}

/**
 * Appends a counter until the slug is free. `taken` is the set of slugs the
 * owner already uses; uniqueness is still enforced by the DB index.
 */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, SLUG_MAX - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, SLUG_MAX - 14)}-${Date.now().toString(36)}`;
}
