import { ScheduleError, type Profile, type Schedule } from "./schedule.js";
import type { database } from "firebase-admin";

export async function commitScheduleAction(
  reference: database.Reference,
  profile: Profile,
  input: unknown,
  apply: (raw: unknown, profile: Profile, input: unknown, now: number) => Schedule,
) {
  const now = Date.now();
  let failure: unknown;
  const result = await reference.transaction(raw => {
    failure = undefined;
    // Firebase may first call this with an empty local cache. Returning null allows
    // the server to compare/retry against the actual value without seeding or overwriting it.
    if (raw === null) return null;
    try {
      return apply(raw, profile, input, now);
    } catch (error) {
      failure = error;
      return undefined;
    }
  });
  if (failure) throw failure;
  if (!result.committed) throw new ScheduleError(409, "schedule_conflict");
  if (!result.snapshot.exists()) throw new ScheduleError(503, "schedule_not_initialized");
}
