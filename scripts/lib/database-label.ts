/**
 * Which database a connection string points at, safe to print.
 *
 * Dev and production share one Supabase pooler host, so the host alone does
 * not say which project a write is about to hit. The pooler user carries the
 * project ref (`postgres.<ref>`), which is what tells them apart; that and the
 * host are printed, never the password.
 */
export function databaseLabel(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl.replace(/^postgres(ql)?:/, "http:"));
    const ref = url.username.split(".")[1];
    return ref ? `project ${ref} (${url.hostname})` : url.hostname;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}
