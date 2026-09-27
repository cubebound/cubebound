/**
 * Text fit for a `<meta name="description">`.
 *
 * Search engines cut a description around 155 characters, and a snippet cut
 * mid-word reads as broken — so collapse the whitespace and clip at the last
 * word that fits. The input is often free text somebody wrote for a page, which
 * can be paragraphs long and carry newlines.
 *
 * It lived beside the cube page while that was its only caller, with a note to
 * move it when a second appeared. The card pages are the second.
 */
const META_DESCRIPTION_MAX = 155;

export function metaDescription(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= META_DESCRIPTION_MAX) return flat;
  const cut = flat.slice(0, META_DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}
