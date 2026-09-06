"use client";

import { useActionState, useState } from "react";

import {
  deleteCubeAsAdminAction,
  deleteUserAction,
  setCubeHiddenAction,
  setUserSuspendedAction,
  type ModerationState,
} from "@/app/moderation/actions";
import { inputSm } from "@/lib/ui";

const initial: ModerationState = {};

const panelClass =
  "rounded-md border border-amber-400/60 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-950/20";
const inputClass = inputSm;
const primaryClass =
  "h-9 shrink-0 rounded-md bg-ink px-3 text-sm font-medium text-surface hover:bg-ink-hover disabled:opacity-50";
const dangerClass =
  "h-9 shrink-0 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";

function Status({ state }: { state: ModerationState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.error}
      </p>
    );
  }
  if (state.ok) return <p className="text-sm text-muted">Done.</p>;
  return null;
}

/**
 * Moderator controls, rendered only for an admin — and only ever as a
 * convenience. **Every action re-checks `requireAdmin` on the server**, so
 * hiding this panel is presentation, not enforcement.
 *
 * Styled as a distinct amber block rather than folded into the page's own
 * buttons, because acting on someone else's content by accident is the failure
 * to design against: these should never be mistaken for the owner's controls
 * sitting a few pixels away.
 */
export function CubeModerationPanel({
  cubeId,
  cubeName,
  hidden,
  hiddenReason,
}: {
  cubeId: string;
  cubeName: string;
  hidden: boolean;
  hiddenReason: string | null;
}) {
  const [hideState, hideAction, hidePending] = useActionState(setCubeHiddenAction, initial);
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteCubeAsAdminAction,
    initial,
  );
  const [confirm, setConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  return (
    <section className={panelClass}>
      <h2 className="text-sm font-semibold">Moderation</h2>

      {hidden && (
        <p className="mt-2 text-sm text-muted">
          Hidden from everyone but you and its owner.
          {hiddenReason ? ` Reason: ${hiddenReason}` : ""}
        </p>
      )}

      <form action={hideAction} className="mt-3 space-y-2">
        <input type="hidden" name="cubeId" value={cubeId} />
        <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
        {!hidden && (
          <input
            name="reason"
            placeholder="Reason (optional, kept in the log)"
            className={inputClass}
          />
        )}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={hidePending} className={primaryClass}>
            {hidePending ? "Working…" : hidden ? "Unhide cube" : "Hide cube"}
          </button>
          <Status state={hideState} />
        </div>
      </form>

      <div className="mt-4 border-t border-amber-400/40 pt-3 dark:border-amber-500/30">
        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="text-sm text-red-700 underline-offset-2 hover:underline dark:text-red-400"
          >
            Delete this cube permanently
          </button>
        ) : (
          <form action={deleteFormAction} className="space-y-2">
            <input type="hidden" name="cubeId" value={cubeId} />
            <p className="text-sm text-muted">
              This cannot be undone. There is no backup to restore from, and hiding
              is reversible; this is not. Type{" "}
              <strong className="font-semibold">{cubeName}</strong> to confirm.
            </p>
            <input
              name="confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={cubeName}
              aria-label="Type the cube name to confirm deletion"
              className={inputClass}
            />
            <input name="reason" placeholder="Reason (optional)" className={inputClass} />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={deletePending || confirm !== cubeName}
                className={dangerClass}
              >
                {deletePending ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="text-sm text-muted underline-offset-2 hover:underline"
              >
                Cancel
              </button>
              <Status state={deleteState} />
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/** The same, for an account: suspend is reversible, delete cascades. */
export function UserModerationPanel({
  username,
  suspended,
  cubeCount,
}: {
  username: string;
  suspended: boolean;
  cubeCount: number;
}) {
  const [suspendState, suspendAction, suspendPending] = useActionState(
    setUserSuspendedAction,
    initial,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteUserAction,
    initial,
  );
  const [confirm, setConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  return (
    <section className={panelClass}>
      <h2 className="text-sm font-semibold">Moderation</h2>

      {suspended && (
        <p className="mt-2 text-sm text-muted">
          Suspended. None of this account&rsquo;s cubes render for anyone.
        </p>
      )}

      <form action={suspendAction} className="mt-3 space-y-2">
        <input type="hidden" name="username" value={username} />
        <input type="hidden" name="suspended" value={suspended ? "false" : "true"} />
        {!suspended && (
          <input
            name="reason"
            placeholder="Reason (optional, kept in the log)"
            className={inputClass}
          />
        )}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={suspendPending} className={primaryClass}>
            {suspendPending ? "Working…" : suspended ? "Unsuspend account" : "Suspend account"}
          </button>
          <Status state={suspendState} />
        </div>
      </form>

      <div className="mt-4 border-t border-amber-400/40 pt-3 dark:border-amber-500/30">
        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="text-sm text-red-700 underline-offset-2 hover:underline dark:text-red-400"
          >
            Delete this account permanently
          </button>
        ) : (
          <form action={deleteFormAction} className="space-y-2">
            <input type="hidden" name="username" value={username} />
            <p className="text-sm text-muted">
              Deletes the account and{" "}
              <strong className="font-semibold">
                all {cubeCount} of its cube{cubeCount === 1 ? "" : "s"}
              </strong>
              , with their drafts and follows. This cannot be undone, and suspending
              is reversible and does the same job. Type{" "}
              <strong className="font-semibold">{username}</strong> to confirm.
            </p>
            <input
              name="confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={username}
              aria-label="Type the username to confirm deletion"
              className={inputClass}
            />
            <input name="reason" placeholder="Reason (optional)" className={inputClass} />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={deletePending || confirm !== username}
                className={dangerClass}
              >
                {deletePending ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="text-sm text-muted underline-offset-2 hover:underline"
              >
                Cancel
              </button>
              <Status state={deleteState} />
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
