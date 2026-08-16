/**
 * The text transforms behind the primer editor's toolbar.
 *
 * Pure on purpose: every button is "given this text and this selection, produce
 * new text and a new selection", which is exactly the shape that can be checked
 * without a browser. The component does nothing but call these and write the
 * result back, so `check:markdown-edit` covers the whole behaviour.
 *
 * Every operation **toggles**. A toolbar where Bold only ever adds asterisks
 * makes un-bolding a manual text edit, which is the thing a toolbar exists to
 * avoid — and pressing a button twice should leave you where you started.
 */

export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** The full lines covered by a selection, as a [from, to) range. */
function lineSpan(value: string, start: number, end: number): [number, number] {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  // A selection ending at the very start of a line covers none of it, so it
  // shouldn't be formatted — dragging down through one line and getting two
  // bulleted is the classic version of this bug.
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", last);
  const to = nextBreak === -1 ? value.length : nextBreak;
  return [from, to];
}

/**
 * Wraps or unwraps the selection in `marker` (`**`, `*`, `` ` ``).
 *
 * Unwrapping looks *outside* the selection too, so double-clicking a word
 * inside `**bold**` — which selects `bold`, not the asterisks — still toggles
 * off. Without that, Bold on an already-bold word produces `****bold****`.
 */
export function toggleInline(
  value: string,
  start: number,
  end: number,
  marker: string,
): EditResult {
  const selected = value.slice(start, end);
  const n = marker.length;

  // Markers inside the selection.
  if (
    selected.length >= n * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(n, -n);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Markers just outside it.
  if (value.slice(start - n, start) === marker && value.slice(end, end + n) === marker) {
    return {
      value: value.slice(0, start - n) + selected + value.slice(end + n),
      selectionStart: start - n,
      selectionEnd: start - n + selected.length,
    };
  }

  const wrapped = marker + selected + marker;
  return {
    value: value.slice(0, start) + wrapped + value.slice(end),
    // With nothing selected, land the caret between the markers so typing
    // continues inside them rather than after.
    selectionStart: start + n,
    selectionEnd: start + n + selected.length,
  };
}

/** Strips any heading, blockquote or list marker from the front of a line. */
function stripLinePrefix(line: string): string {
  return line.replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/, "");
}

function rewriteLines(
  value: string,
  start: number,
  end: number,
  rewrite: (line: string, index: number) => string,
): EditResult {
  const [from, to] = lineSpan(value, start, end);
  const before = value.slice(from, to);
  const after = before.split("\n").map(rewrite).join("\n");
  return {
    value: value.slice(0, from) + after + value.slice(to),
    // Select the rewritten block rather than trying to preserve an offset that
    // the prefix changes anyway — it keeps a second button press working on the
    // same lines.
    selectionStart: from,
    selectionEnd: from + after.length,
  };
}

/**
 * Sets or clears a heading level — the toolbar's "font size".
 *
 * Markdown has no font sizes, and offering arbitrary ones would mean either
 * raw HTML (which the primer deliberately strips) or a syntax the renderer
 * does not understand. Headings are the real thing this maps to.
 */
export function toggleHeading(
  value: string,
  start: number,
  end: number,
  level: 1 | 2 | 3,
): EditResult {
  const marker = "#".repeat(level) + " ";
  const [from, to] = lineSpan(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const allAtLevel = lines.every((line) => line.startsWith(marker));
  return rewriteLines(value, start, end, (line) =>
    allAtLevel ? stripLinePrefix(line) : marker + stripLinePrefix(line),
  );
}

/** Bulleted list. Toggles off when every selected line is already a bullet. */
export function toggleBulletList(value: string, start: number, end: number): EditResult {
  const [from, to] = lineSpan(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const allBullets = lines.every((line) => /^\s*[-*+]\s+/.test(line));
  return rewriteLines(value, start, end, (line) =>
    allBullets ? stripLinePrefix(line) : "- " + stripLinePrefix(line),
  );
}

/**
 * Numbered list. Renumbers from 1 rather than writing `1.` on every line —
 * markdown renders either correctly, but a source file full of `1.` is
 * unreadable to the person editing it, and the primer's source *is* the
 * document they keep coming back to.
 */
export function toggleOrderedList(value: string, start: number, end: number): EditResult {
  const [from, to] = lineSpan(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const allNumbered = lines.every((line) => /^\s*\d+\.\s+/.test(line));
  return rewriteLines(value, start, end, (line, index) =>
    allNumbered ? stripLinePrefix(line) : `${index + 1}. ` + stripLinePrefix(line),
  );
}

export function toggleQuote(value: string, start: number, end: number): EditResult {
  const [from, to] = lineSpan(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const allQuoted = lines.every((line) => /^\s*>\s?/.test(line));
  return rewriteLines(value, start, end, (line) =>
    allQuoted ? stripLinePrefix(line) : "> " + stripLinePrefix(line),
  );
}

/**
 * `[selected](url)`, with the URL pre-selected so it can be pasted over.
 *
 * The placeholder is `https://` rather than empty because `rehype-sanitize`
 * drops anything that isn't http, https or mailto, and a link that silently
 * vanished from the preview would read as the editor being broken.
 */
export const LINK_PLACEHOLDER = "https://";

export function insertLink(value: string, start: number, end: number): EditResult {
  const selected = value.slice(start, end) || "link text";
  const inserted = `[${selected}](${LINK_PLACEHOLDER})`;
  const urlAt = start + selected.length + 3;
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    selectionStart: urlAt,
    selectionEnd: urlAt + LINK_PLACEHOLDER.length,
  };
}

/**
 * The smallest span that differs between two strings.
 *
 * The toolbar writes its result through `document.execCommand("insertText")`
 * so the browser's own undo stack stays intact — Ctrl+Z after a toolbar click
 * has to work, or the toolbar is worse than typing. Replacing the whole
 * document each time would make one undo step per click swallow everything, so
 * only the changed run is replaced.
 */
export function diffRange(
  before: string,
  after: string,
): { start: number; end: number; text: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start++;
  }
  let fromEnd = 0;
  while (
    fromEnd < before.length - start &&
    fromEnd < after.length - start &&
    before[before.length - 1 - fromEnd] === after[after.length - 1 - fromEnd]
  ) {
    fromEnd++;
  }
  return {
    start,
    end: before.length - fromEnd,
    text: after.slice(start, after.length - fromEnd),
  };
}
