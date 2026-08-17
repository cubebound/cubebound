"use server";

import { revalidatePath } from "next/cache";

import { getCubeById } from "@/db/queries/cubes";
import { followCube, unfollowCube } from "@/db/queries/discovery";
import { getCurrentUser } from "@/lib/auth";
import { canUseCube, suspensionError } from "@/lib/cube-access";

export interface FollowState {
  error?: string;
}

/**
 * Following is gated on **viewing**, like drafting.
 *
 * Anyone who can open a cube can follow it; you cannot follow a private cube
 * that isn't yours, and a non-viewer gets "not found" rather than "forbidden"
 * so private cube ids stay unprobeable. Sign-in is required because a follow
 * belongs to an account.
 */
async function requireFollowableCube(cubeId: string) {
  const current = await getCurrentUser();
  if (!current?.profile) return { error: "Sign in to follow cubes." } as const;
  const suspended = suspensionError(current.profile);
  if (suspended) return { error: suspended.error } as const;
  if (typeof cubeId !== "string" || cubeId.length === 0) {
    return { error: "Cube not found." } as const;
  }
  const cube = await getCubeById(cubeId);
  // Following a moderated cube would keep it surfacing in someone's feed.
  if (!canUseCube(cube, current.profile.id)) return { error: "Cube not found." } as const;
  return { cube, profile: current.profile } as const;
}

export async function setFollowAction(
  cubeId: string,
  following: boolean,
  returnPath: string,
): Promise<FollowState> {
  const allowed = await requireFollowableCube(cubeId);
  if ("error" in allowed) return { error: allowed.error };

  if (following) await followCube(allowed.cube.id, allowed.profile.id);
  else await unfollowCube(allowed.cube.id, allowed.profile.id);

  revalidatePath(returnPath.startsWith("/") ? returnPath : "/");
  revalidatePath("/cubes");
  revalidatePath("/explore");
  return {};
}
