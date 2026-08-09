import type { User as AuthUser } from "@supabase/supabase-js";

import { getProfileById } from "@/db/queries/users";
import type { User as Profile } from "@/db/schema";

import { createClient } from "./supabase/server";

/** The signed-in Supabase user, or null. Verified against Supabase, not just
 *  read from the cookie. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The signed-in user together with their profile row. `profile` is null between
 * signing in and claiming a username.
 */
export async function getCurrentUser(): Promise<{
  user: AuthUser;
  profile: Profile | null;
} | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return { user, profile: await getProfileById(user.id) };
}
