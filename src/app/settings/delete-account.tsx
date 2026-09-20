"use client";

import { useActionState, useState } from "react";

import { deleteOwnAccountAction, type DeleteAccountState } from "@/app/settings/actions";
import { btn, errorText, input, label } from "@/lib/ui";

const initial: DeleteAccountState = {};

/**
 * Type-the-username confirmation for deleting your own account.
 *
 * Three things here are deliberate and will look like oversights.
 *
 * **The action is passed bare, not wrapped in a client closure.** React's SSR
 * only emits a form's no-JS submit fields when the action carries
 * `$$FORM_ACTION`, and a wrapper drops it — so guarding the promise here would
 * trade a dropped-request failure for a pre-hydration one, and would break
 * `check:account-deletion`, which posts to this form without a browser. The
 * action also ends in `redirect()`, so it rejects with a NEXT_REDIRECT digest
 * that any guard would have to re-throw. If this ever starts firing in Sentry,
 * a local error boundary is the fix, not a wrapper. See CLAUDE.md, "Calling a
 * server action".
 *
 * **The form is rendered up front rather than behind an open/closed state**, the
 * way `delete-cube.tsx` does it. The submit button is disabled until the
 * username is typed exactly, which is the guard that matters, and keeping the
 * markup in the server response is what lets the check assert on it.
 *
 * **The confirmation compares the typed name.** `check:account-deletion` fails
 * the build if that comparison goes away: checking only that some `confirm`
 * field arrived once let a mutation through with the guard deleted.
 */
export default function DeleteAccount({
  username,
  cubeCount,
  draftCount,
  isLastAdmin,
}: {
  username: string;
  cubeCount: number;
  draftCount: number;
  isLastAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(deleteOwnAccountAction, initial);
  const [typed, setTyped] = useState("");

  // Only the counts that are actually non-zero, so a brand-new account is not
  // warned about deleting its 0 cubes and 0 drafts.
  const belongings = [
    cubeCount > 0 && `${cubeCount} ${cubeCount === 1 ? "cube" : "cubes"}`,
    draftCount > 0 && `${draftCount} ${draftCount === 1 ? "draft" : "drafts"}`,
  ].filter((part): part is string => typeof part === "string");

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-red-300 p-4 dark:border-red-800"
    >
      <p className="text-sm text-muted">
        This permanently deletes your account
        {belongings.length > 0 && <> and its {belongings.join(" and ")}</>}, along
        with the cubes you follow. <strong>It cannot be undone.</strong>
        {cubeCount > 0 && (
          <> Cube URLs you have shared will stop working for everyone.</>
        )}{" "}
        Copies other people made of your cubes are theirs and will stay.
      </p>

      {isLastAdmin && (
        <p role="alert" className={errorText}>
          You are the only admin. Deleting this account makes the moderation
          tools unreachable, and the only way back is running SQL against the
          production database. Promote someone else first if you want to keep
          that door open.
        </p>
      )}

      <label htmlFor="confirm" className={label}>
        Type <span className="font-mono font-semibold">{username}</span> to
        confirm:
      </label>
      <input
        id="confirm"
        name="confirm"
        autoComplete="off"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        className={input}
      />

      {state.error && (
        <p role="alert" className={errorText}>
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending || typed !== username} className={btn.danger}>
        {pending ? "Deleting…" : "Delete my account permanently"}
      </button>
    </form>
  );
}
