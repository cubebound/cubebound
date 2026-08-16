"use server";

import { revalidatePath } from "next/cache";

import { deleteCube, getCubeById } from "@/db/queries/cubes";
import {
  deleteUserAccount,
  logModeration,
  setCubeHidden,
  setUserSuspended,
  summarizeUser,
  type ModerationAction,
} from "@/db/queries/moderation";
import { getUserByUsername } from "@/db/queries/users";
import { getCurrentUser } from "@/lib/auth";

/**
 * Moderator-only mutations.
 *
 * **`requireAdmin` is the gate, and it is checked here on every call**, never
 * in the page. A page deciding not to render a button is a presentation
 * choice; the server deciding not to act is the security boundary, and these
 * actions are reachable by anyone who can construct a POST.
 *
 * Non-admins get "Not found" rather than "Forbidden", the same convention the
 * cube mutations use: a distinct error would confirm that an account, cube or
 * moderation surface exists to someone probing for one.
 *
 * `check:cube-ownership` scans this file structurally — a new export here that
 * does not call `requireAdmin` fails the build.
 */

export interface ModerationState {
  error?: string;
  ok?: boolean;
}

const REASON_MAX = 500;

async function requireAdmin() {
  const current = await getCurrentUser();
  if (!current?.profile?.isAdmin) return { error: "Not found." } as const;
  return { profile: current.profile } as const;
}

/** Trimmed, capped, and null when empty — the reason is optional everywhere. */
function readReason(formData: FormData): string | null {
  const raw = String(formData.get("reason") ?? "").trim();
  return raw ? raw.slice(0, REASON_MAX) : null;
}

async function record(
  admin: { id: string; username: string },
  action: ModerationAction,
  target: { type: "cube" | "user"; id: string; label: string },
  reason: string | null,
  snapshot?: unknown,
) {
  await logModeration({
    actorId: admin.id,
    actorUsername: admin.username,
    action,
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label,
    reason,
    snapshot,
  });
}

export async function setCubeHiddenAction(
  _prev: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  const gate = await requireAdmin();
  if ("error" in gate) return gate;

  const cubeId = String(formData.get("cubeId") ?? "");
  const hidden = String(formData.get("hidden") ?? "") === "true";
  const cube = await getCubeById(cubeId);
  if (!cube) return { error: "Not found." };

  const reason = readReason(formData);
  // Logged before the write: if the log throws, nothing has happened yet, and
  // an action with no audit trail is the failure worth avoiding.
  await record(
    gate.profile,
    hidden ? "cube_hidden" : "cube_unhidden",
    { type: "cube", id: cube.id, label: cube.name },
    reason,
    { visibility: cube.visibility, description: cube.description },
  );
  await setCubeHidden(cube.id, hidden, reason);

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Deletes a cube outright.
 *
 * Gated behind a typed confirmation in the UI *and* re-checked here, because
 * there is no undo: the snapshot in `moderation_log` is all that survives.
 */
export async function deleteCubeAsAdminAction(
  _prev: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  const gate = await requireAdmin();
  if ("error" in gate) return gate;

  const cubeId = String(formData.get("cubeId") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();
  const cube = await getCubeById(cubeId);
  if (!cube) return { error: "Not found." };

  if (confirm !== cube.name) {
    return { error: `Type the cube's name exactly to confirm: ${cube.name}` };
  }

  await record(
    gate.profile,
    "cube_deleted",
    { type: "cube", id: cube.id, label: cube.name },
    readReason(formData),
    {
      visibility: cube.visibility,
      description: cube.description,
      primer: cube.primer,
      slug: cube.slug,
      ownerId: cube.ownerId,
    },
  );
  await deleteCube(cube.id);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setUserSuspendedAction(
  _prev: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  const gate = await requireAdmin();
  if ("error" in gate) return gate;

  const username = String(formData.get("username") ?? "");
  const suspended = String(formData.get("suspended") ?? "") === "true";
  const target = await getUserByUsername(username);
  if (!target) return { error: "Not found." };

  // Suspending yourself would lock the only moderator out of the tools that
  // undo it. Nothing else stops it, so it is stopped here.
  if (target.id === gate.profile.id) {
    return { error: "You cannot suspend your own account." };
  }
  if (target.isAdmin && suspended) {
    return { error: "Suspend the admin flag first — admins cannot be suspended." };
  }

  await record(
    gate.profile,
    suspended ? "user_suspended" : "user_unsuspended",
    { type: "user", id: target.id, label: target.username },
    readReason(formData),
  );
  await setUserSuspended(target.id, suspended);

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Deletes an account and everything it owns.
 *
 * Irreversible and cascading: cubes, cards, drafts and follows all go. The
 * confirmation is the username typed exactly, and suspension is the reversible
 * thing to reach for first.
 */
export async function deleteUserAction(
  _prev: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  const gate = await requireAdmin();
  if ("error" in gate) return gate;

  const username = String(formData.get("username") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();
  const target = await getUserByUsername(username);
  if (!target) return { error: "Not found." };

  if (target.id === gate.profile.id) {
    return { error: "You cannot delete your own account from here." };
  }
  if (target.isAdmin) {
    return { error: "Remove the admin flag before deleting this account." };
  }
  if (confirm !== target.username) {
    return { error: `Type the username exactly to confirm: ${target.username}` };
  }

  const snapshot = await summarizeUser(target.id);
  await record(
    gate.profile,
    "user_deleted",
    { type: "user", id: target.id, label: target.username },
    readReason(formData),
    snapshot,
  );
  await deleteUserAccount(target.id);

  revalidatePath("/", "layout");
  return { ok: true };
}
