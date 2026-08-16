/**
 * Guards the primer toolbar's text transforms.
 *
 * These are the kind of thing that looks right in a screenshot and is wrong on
 * the second click: Bold that turns `**word**` into `****word****`, a heading
 * button that stacks `## # heading`, a list toggle that only ever adds. Each is
 * pure — text and a selection in, text and a selection out — so every case is
 * checkable here rather than by hand in a browser.
 *
 * `diffRange` is covered too, because it is what keeps one toolbar click to
 * one undo step; a wrong range silently replaces the wrong text.
 *
 * Needs nothing. Runs in CI.
 *
 *   npm run check:markdown-edit
 */
import {
  diffRange,
  insertLink,
  toggleBulletList,
  toggleHeading,
  toggleInline,
  toggleOrderedList,
  toggleQuote,
  type EditResult,
} from "../src/lib/markdown-edit";

const failures: string[] = [];
let checks = 0;

/** `|` marks the caret; `[...]` marks a selection. Keeps cases readable. */
function parse(spec: string): { value: string; start: number; end: number } {
  if (spec.includes("[")) {
    const start = spec.indexOf("[");
    const end = spec.indexOf("]") - 1;
    return { value: spec.replace("[", "").replace("]", ""), start, end };
  }
  const start = spec.indexOf("|");
  return { value: spec.replace("|", ""), start, end: start };
}

function render(result: EditResult): string {
  const { value, selectionStart: s, selectionEnd: e } = result;
  if (s === e) return value.slice(0, s) + "|" + value.slice(s);
  return value.slice(0, s) + "[" + value.slice(s, e) + "]" + value.slice(e);
}

function expect(label: string, actual: string, wanted: string) {
  checks++;
  if (actual !== wanted) {
    failures.push(`${label}\n     got: ${JSON.stringify(actual)}\n  wanted: ${JSON.stringify(wanted)}`);
  }
}

/** Runs an edit on a `[selected]` spec and compares the rendered result. */
function check(
  label: string,
  input: string,
  edit: (v: string, s: number, e: number) => EditResult,
  wanted: string,
) {
  const { value, start, end } = parse(input);
  expect(label, render(edit(value, start, end)), wanted);
}

const bold = (v: string, s: number, e: number) => toggleInline(v, s, e, "**");
const italic = (v: string, s: number, e: number) => toggleInline(v, s, e, "*");

// ---- inline: wraps, and unwraps again ---------------------------------
check("bold wraps a selection", "a [word] b", bold, "a **[word]** b");
check("bold unwraps its own markers", "a [**word**] b", bold, "a [word] b");
// Double-clicking a word inside **bold** selects the word, not the asterisks —
// the case that produced ****word**** before the outside-markers branch.
check("bold unwraps from inside the markers", "a **[word]** b", bold, "a [word] b");
check("bold with no selection leaves the caret inside", "a | b", bold, "a **|** b");
check("italic is independent of bold", "a [word] b", italic, "a *[word]* b");
check("italic unwraps", "a [*word*] b", italic, "a [word] b");

// Bold inside italic must not be mistaken for italic's own markers.
check("bold inside italic", "*[word]*", bold, "***[word]***");

// ---- headings ---------------------------------------------------------
check("heading 2 applies", "|Title", (v, s, e) => toggleHeading(v, s, e, 2), "[## Title]");
check(
  "heading toggles off at the same level",
  "|## Title",
  (v, s, e) => toggleHeading(v, s, e, 2),
  "[Title]",
);
// The bug this exists for: without stripping, H1 over an H2 gives "# ## Title".
check(
  "changing level replaces rather than stacks",
  "|## Title",
  (v, s, e) => toggleHeading(v, s, e, 1),
  "[# Title]",
);
check(
  "heading replaces a bullet rather than nesting",
  "|- Item",
  (v, s, e) => toggleHeading(v, s, e, 3),
  "[### Item]",
);

// ---- lists ------------------------------------------------------------
check("bullets apply across every selected line", "[a\nb\nc]", toggleBulletList, "[- a\n- b\n- c]");
check("bullets toggle off", "[- a\n- b]", toggleBulletList, "[a\nb]");
// Mixed selection: not all lines are bullets, so it bullets all of them
// rather than clearing the ones that already are.
check("a partly bulleted selection becomes fully bulleted", "[- a\nb]", toggleBulletList, "[- a\n- b]");
check("numbers count up", "[a\nb\nc]", toggleOrderedList, "[1. a\n2. b\n3. c]");
check("numbers toggle off", "[1. a\n2. b]", toggleOrderedList, "[a\nb]");
check("bullets replace numbers", "[1. a\n2. b]", toggleBulletList, "[- a\n- b]");
check("quote applies and strips", "[> a\n> b]", toggleQuote, "[a\nb]");

// A caret inside a line, with nothing selected, still formats that whole line.
check("a caret formats its own line", "a\nb|b\nc", toggleBulletList, "a\n[- bb]\nc");
// ...and a selection ending at the very start of the next line covers none of
// it, so that line must be left alone.
check(
  "a selection ending at a newline formats one line, not two",
  "[a\n]b",
  toggleBulletList,
  "[- a]\nb",
);

// ---- links ------------------------------------------------------------
check("link keeps the selected text and selects the url", "see [here] now", insertLink, "see [here]([https://]) now");
check("link with no selection uses placeholder text", "see | now", insertLink, "see [link text]([https://]) now");

// ---- diffRange: one click, one undo step ------------------------------
{
  const before = "hello world";
  const after = "hello **world**";
  const d = diffRange(before, after);
  checks++;
  if (before.slice(0, d.start) + d.text + before.slice(d.end) !== after) {
    failures.push(`diffRange does not reconstruct: ${JSON.stringify(d)}`);
  }
  // It must be a *minimal* span, or the undo step swallows the whole document.
  expect("diffRange is minimal", `${d.start}-${d.end}`, "6-11");
}
{
  // Deletion (unbolding) — the end index must exceed the start.
  const d = diffRange("a **word** b", "a word b");
  checks++;
  if ("a **word** b".slice(0, d.start) + d.text + "a **word** b".slice(d.end) !== "a word b") {
    failures.push(`diffRange deletion does not reconstruct: ${JSON.stringify(d)}`);
  }
}
{
  // No change at all must produce an empty, zero-width edit rather than
  // replacing the document with itself.
  const d = diffRange("same", "same");
  expect("diffRange of identical text is empty", `${d.start}-${d.end}:${d.text}`, "4-4:");
}

// ---- every operation is its own inverse -------------------------------
for (const [name, edit] of [
  ["bold", bold],
  ["italic", italic],
  ["bullets", toggleBulletList],
  ["numbers", toggleOrderedList],
  ["quote", toggleQuote],
  ["heading 2", (v: string, s: number, e: number) => toggleHeading(v, s, e, 2)],
] as const) {
  const source = "first line\nsecond line";
  const once = edit(source, 0, source.length);
  const twice = edit(once.value, once.selectionStart, once.selectionEnd);
  expect(`${name} pressed twice returns the original`, twice.value, source);
}

if (failures.length > 0) {
  console.error(`markdown edit check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log(`markdown edit check passed (${checks} cases)`);
}
process.exit(failures.length > 0 ? 1 : 0);
