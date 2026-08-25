/** SITE-400 isolated lazy entry; it has no DOM or current-route dependency. */

export const SITE400_ENTRY_ID = "SITE-400" as const;

export interface Site400EntryModule {
  readonly moduleId: typeof SITE400_ENTRY_ID;
  readonly status: "ISOLATED_READY";
  readonly connectedRoutes: readonly [];
  readonly heavyModules: readonly [];
}

export function createSite400EntryModule(): Site400EntryModule {
  return Object.freeze({
    moduleId: SITE400_ENTRY_ID,
    status: "ISOLATED_READY" as const,
    connectedRoutes: Object.freeze([]) as readonly [],
    heavyModules: Object.freeze([]) as readonly [],
  });
}
