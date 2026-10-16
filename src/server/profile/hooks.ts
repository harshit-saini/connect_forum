import "server-only";

/**
 * Called inside the saving transaction after a profile is submitted or its matching-relevant answers
 * change. Milestone 5 queues the re-embedding job here.
 */
export type ProfileChange = { userId: string; role: "seeker" | "guide"; profileVersion: number };

export const profileChangeHooks: Array<(tx: unknown, change: ProfileChange) => Promise<void>> = [];

export async function onProfileChanged(tx: unknown, change: ProfileChange) {
  for (const hook of profileChangeHooks) await hook(tx, change);
}
