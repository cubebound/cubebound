"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteUserAccount,
  logModeration,
  summarizeUser,
} from "@/db/queries/moderation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * The account acting on itself.
 *
 * **The whole security design is that no identifier crosses the wire.** The row
 * to delete comes from `getCurrentUser()` and nowhere else; the form supplies a
 * single string, which is *compared* and never used to select. That makes
 * deleting somebody else's account structurally unreachable rather than merely
 * validated against — the same reasoning `readDraftConfig` uses when it rebuilds
 * field by field instead of spreading. If you ever add a `userId` hidden field
 * here "to avoid a lookup", you have removed the only thing holding this up.
 * `check:account-deletion` asserts `confirm` is the sole key read from the form.
 *
 * This deliberately inherits neither guard the admin path has. `deleteUserAction`
 * in `src/app/moderation/actions.ts` refuses self-deletion and refuses deleting
 * another admin; both exist to stop a moderator acting on the wrong row, and
 * neither makes sense when the actor *is* the row. An admin can therefore delete
 * themselves here, which was decided explicitly: see docs/moderation.md for what
 * that costs if they are the last one.
 *
 * A suspended account may also delete itself. `suspensionError` gates the write
 * paths that let an account go on building things; refusing here would turn
 * suspension into data retention, and the log row preserves the record anyway.
 */

export interface DeleteAccountState {
  error?: string;
}

export async function deleteOwnAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const current = await getCurrentUser();
  if (!current) return { error: "You need to be signed in." };
  // Unreachable from the UI — /settings sends a profile-less account to
  // /welcome — but the action is reachable by anyone who can construct a POST,
  // and there is no username to type or to write into the log without one.
  if (!current.profile) {
    return { error: "Claim a username before deleting your account." };
  }

  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== current.profile.username) {
    return {
      error: `Type your username exactly to confirm: ${current.profile.username}`,
    };
  }

  // Written before the delete, and `logModeration` does not swallow failures, so
  // an account cannot disappear without a record. `actorId` is null because the
  // actor is the row being deleted: even if we wrote the id, the FK's ON DELETE
  // SET NULL would null it a moment later. `actorUsername` and `snapshot` are
  // what survive, which is what makes "where did that cube go" answerable.
  const snapshot = await summarizeUser(current.profile.id);
  await logModeration({
    actorId: null,
    actorUsername: current.profile.username,
    action: "account_self_deleted",
    targetType: "user",
    targetId: current.profile.id,
    targetLabel: current.profile.username,
    reason: null,
    snapshot,
  });

  // Sign out first, while the token still refers to a live row. Afterwards the
  // cookie describes a user GoTrue cannot find, and clearing it becomes
  // dependent on how the client handles that.
  const supabase = await createClient();
  await supabase.auth.signOut();

  await deleteUserAccount(current.profile.id);

  // The nav renders the signed-in user from the root layout, which a redirecting
  // action does not re-render on its own. Without this the deleted account is
  // still named in the header until a hard reload.
  revalidatePath("/", "layout");
  redirect("/");
}
