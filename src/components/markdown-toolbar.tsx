"use client";

import type { RefObject } from "react";

import {
  diffRange,
  insertLink,
  toggleBulletList,
  toggleHeading,
  toggleInline,
  toggleOrderedList,
  toggleQuote,
  type EditResult,
} from "@/lib/markdown-edit";

export type Edit = (value: string, start: number, end: number) => EditResult;

/**
 * Runs an edit against a live textarea, preserving native undo.
 *
 * Shared by the buttons and the keyboard shortcuts so Ctrl+B and the B button
 * cannot drift apart — they are the same code path with different triggers.
 */
export function applyEdit(
  el: HTMLTextAreaElement,
  edit: Edit,
  onFallback: (value: string) => void,
) {
  const result = edit(el.value, el.selectionStart, el.selectionEnd);
  const { start, end, text } = diffRange(el.value, result.value);

  el.focus();
  el.setSelectionRange(start, end);
  const inserted = document.execCommand("insertText", false, text);

  if (!inserted) {
    // execCommand refused (or the browser dropped it). Fall back to React
    // state; undo history is lost for that step, which beats the button doing
    // nothing at all.
    onFallback(result.value);
  }
  el.setSelectionRange(result.selectionStart, result.selectionEnd);
}

const buttonClass =
  "flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm " +
  "text-muted hover:bg-hover";

/**
 * One toolbar button. Defined at module scope, not inside the toolbar, because
 * a component created during render is a new type on every render — React
 * remounts it, and the compiler's lint rejects it outright.
 */
function ToolButton({
  label,
  hint,
  onApply,
  children,
}: {
  label: string;
  hint?: string;
  onApply: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // The textarea must keep focus and its selection: a mousedown that moves
      // focus to the button collapses the selection before the click fires, so
      // Bold would wrap nothing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onApply}
      aria-label={label}
      title={hint ? `${label} (${hint})` : label}
      className={buttonClass}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-line" />;
}

/**
 * Formatting buttons over a plain markdown textarea.
 *
 * **A toolbar, not a WYSIWYG editor.** The primer is stored as markdown and
 * rendered through `rehype-sanitize` with no `rehype-raw`, so a rich-text
 * surface would have to round-trip HTML back into markdown to be storable —
 * and anything it could express that markdown cannot would be stripped on the
 * way out, silently. Buttons that write markdown keep one representation, and
 * the source stays something a person can read, paste and diff.
 *
 * Edits are applied with `document.execCommand("insertText")`, deprecated but
 * the only way to change a textarea while keeping the browser's native undo
 * stack. Ctrl+Z after clicking Bold has to work; setting `value` directly
 * clears the undo history outright, which is a worse bug than the deprecation.
 * Only the changed run is replaced (see `diffRange`) so one click is one undo
 * step rather than a whole-document swap.
 */
export default function MarkdownToolbar({
  textareaRef,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Fallback for browsers where `execCommand` is unavailable. */
  onChange: (value: string) => void;
}) {
  function apply(edit: Edit) {
    const el = textareaRef.current;
    if (el) applyEdit(el, edit, onChange);
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-line bg-sunken p-1"
    >
      {([1, 2, 3] as const).map((level) => (
        <ToolButton
          key={level}
          label={`Heading ${level}`}
          onApply={() => apply((v, s, e) => toggleHeading(v, s, e, level))}
        >
          <span className="font-semibold">H{level}</span>
        </ToolButton>
      ))}

      <Divider />

      <ToolButton label="Bold" hint="Ctrl+B" onApply={() => apply((v, s, e) => toggleInline(v, s, e, "**"))}>
        <span className="font-bold">B</span>
      </ToolButton>
      <ToolButton label="Italic" hint="Ctrl+I" onApply={() => apply((v, s, e) => toggleInline(v, s, e, "*"))}>
        <span className="italic">I</span>
      </ToolButton>
      <ToolButton label="Inline code" onApply={() => apply((v, s, e) => toggleInline(v, s, e, "`"))}>
        <span className="font-mono text-xs">{"</>"}</span>
      </ToolButton>

      <Divider />

      <ToolButton label="Bulleted list" onApply={() => apply(toggleBulletList)}>
        {/* Drawn rather than an icon font: three dots and three rules is
            cheaper as markup than as a request, and it follows currentColor. */}
        <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
          <circle cx="2.5" cy="4" r="1.3" />
          <circle cx="2.5" cy="8" r="1.3" />
          <circle cx="2.5" cy="12" r="1.3" />
          <rect x="6" y="3.3" width="8" height="1.4" rx="0.7" />
          <rect x="6" y="7.3" width="8" height="1.4" rx="0.7" />
          <rect x="6" y="11.3" width="8" height="1.4" rx="0.7" />
        </svg>
      </ToolButton>
      <ToolButton label="Numbered list" onApply={() => apply(toggleOrderedList)}>
        <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
          <text x="0" y="6" fontSize="6">
            1
          </text>
          <text x="0" y="14" fontSize="6">
            2
          </text>
          <rect x="6" y="3.3" width="8" height="1.4" rx="0.7" />
          <rect x="6" y="11.3" width="8" height="1.4" rx="0.7" />
        </svg>
      </ToolButton>
      <ToolButton label="Quote" onApply={() => apply(toggleQuote)}>
        <span className="font-serif text-base leading-none">&rdquo;</span>
      </ToolButton>

      <Divider />

      <ToolButton label="Link" hint="Ctrl+K" onApply={() => apply(insertLink)}>
        <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.5">
          <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8" />
          <path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" />
        </svg>
      </ToolButton>
    </div>
  );
}

/**
 * Ctrl/Cmd shortcuts for the same edits, for people who never look at a
 * toolbar. Exported so the editor can attach it to its own textarea.
 */
export function markdownShortcut(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
): Edit | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case "b":
      return (v, s, e) => toggleInline(v, s, e, "**");
    case "i":
      return (v, s, e) => toggleInline(v, s, e, "*");
    case "k":
      return insertLink;
    default:
      return null;
  }
}
