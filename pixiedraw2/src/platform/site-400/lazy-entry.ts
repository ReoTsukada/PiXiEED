/**
 * SITE-400 lazy boundary.  A single entry promise prevents duplicate mounts;
 * inactive Game/Audio/Market modules are not imported here.
 */

import type { Site400EntryModule } from "./entry.ts";

export interface Site400LazyEntry {
  readonly load: () => Promise<Site400EntryModule>;
}

type Loader = () => Promise<Site400EntryModule>;

export function createSite400LazyEntry(
  loader: Loader = async () => {
    const module = await import("./entry.ts");
    return module.createSite400EntryModule();
  },
): Site400LazyEntry {
  let modulePromise: Promise<Site400EntryModule> | undefined;
  return Object.freeze({
    load(): Promise<Site400EntryModule> {
      modulePromise ??= loader();
      return modulePromise;
    },
  });
}
