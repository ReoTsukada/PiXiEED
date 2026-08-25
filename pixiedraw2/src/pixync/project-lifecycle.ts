/** Project-scoped PiXYNC journal lifecycle. No transport or product UI wiring. */

import type { PixyncSnapshotPersistencePort } from "./durability.ts";

export type PixyncProjectLifecyclePhase =
  | "IDLE"
  | "OPENING"
  | "ACTIVE"
  | "SWITCHING"
  | "UNAVAILABLE"
  | "DISPOSED";

export interface PixyncProjectJournal {
  readonly projectId: string;
}

export interface PixyncProjectLifecycleState {
  readonly phase: PixyncProjectLifecyclePhase;
  readonly projectId: string | null;
  readonly generation: number;
  readonly reason?: "INITIAL" | "OPEN" | "NEW" | "OPEN_FAILED" | "DISPOSE";
}

export interface PixyncProjectLifecycleOptions<
  TJournal extends PixyncProjectJournal,
> {
  readonly eventTarget: EventTarget;
  readonly eventName: string;
  readonly initialProjectId: string;
  readonly createPersistence: (
    projectId: string,
  ) => PixyncSnapshotPersistencePort;
  readonly openJournal: (
    projectId: string,
    persistence: PixyncSnapshotPersistencePort,
  ) => Promise<TJournal>;
  readonly flushProject?: (
    projectId: string,
    journal: TJournal,
  ) => void | Promise<void>;
  readonly stopProject?: (
    projectId: string,
    journal: TJournal,
  ) => void | Promise<void>;
  readonly onState?: (state: PixyncProjectLifecycleState) => void;
}

interface ProjectChangeRequest {
  readonly projectId: string;
  readonly kind: "OPEN" | "NEW";
  readonly generation: number;
}

function validProjectId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);
}

export class PixyncProjectLifecycleCoordinator<
  TJournal extends PixyncProjectJournal,
> {
  readonly #options: PixyncProjectLifecycleOptions<TJournal>;
  #state: PixyncProjectLifecycleState = {
    phase: "IDLE",
    projectId: null,
    generation: 0,
  };
  #journal: TJournal | undefined;
  #queue: Promise<void> = Promise.resolve();
  #generation = 0;
  #started = false;
  #disposed = false;

  readonly #handleProjectChanged = (event: Event): void => {
    if (this.#disposed) return;
    const detail = (event as Event & {
      readonly detail?: {
        readonly projectId?: unknown;
        readonly kind?: unknown;
      };
    }).detail;
    if (!validProjectId(detail?.projectId)) return;
    const kind = detail?.kind === "NEW" ? "NEW" : "OPEN";
    const generation = ++this.#generation;
    this.#enqueue({ projectId: detail.projectId, kind, generation });
  };

  constructor(options: PixyncProjectLifecycleOptions<TJournal>) {
    if (
      !validProjectId(options.initialProjectId) ||
      options.eventName.length === 0
    ) {
      throw new Error("PiXYNC project lifecycle options are invalid.");
    }
    this.#options = options;
  }

  state(): PixyncProjectLifecycleState {
    return { ...this.#state };
  }

  activeJournal(): TJournal | undefined {
    return this.#journal;
  }

  async start(): Promise<void> {
    if (this.#disposed) {
      throw new Error("PiXYNC project lifecycle is disposed.");
    }
    if (this.#started) return this.#queue;
    this.#started = true;
    this.#options.eventTarget.addEventListener(
      this.#options.eventName,
      this.#handleProjectChanged,
    );
    const generation = ++this.#generation;
    this.#enqueue({
      projectId: this.#options.initialProjectId,
      kind: "OPEN",
      generation,
    }, "INITIAL");
    return this.#queue;
  }

  async settled(): Promise<void> {
    await this.#queue;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return this.#queue;
    this.#disposed = true;
    ++this.#generation;
    this.#options.eventTarget.removeEventListener(
      this.#options.eventName,
      this.#handleProjectChanged,
    );
    this.#queue = this.#queue.then(async () => {
      const current = this.#journal;
      this.#journal = undefined;
      if (current !== undefined) {
        try {
          await this.#options.flushProject?.(current.projectId, current);
        } finally {
          await this.#options.stopProject?.(current.projectId, current);
        }
      }
      this.#publish({
        phase: "DISPOSED",
        projectId: null,
        generation: this.#generation,
        reason: "DISPOSE",
      });
    });
    return this.#queue;
  }

  #enqueue(
    request: ProjectChangeRequest,
    reason: "INITIAL" | "OPEN" | "NEW" = request.kind,
  ): void {
    this.#queue = this.#queue.then(() => this.#switch(request, reason));
  }

  async #switch(
    request: ProjectChangeRequest,
    reason: "INITIAL" | "OPEN" | "NEW",
  ): Promise<void> {
    if (this.#disposed || request.generation !== this.#generation) return;
    if (
      request.kind === "OPEN" && this.#journal?.projectId === request.projectId
    ) return;

    const previous = this.#journal;
    this.#journal = undefined;
    this.#publish({
      phase: previous === undefined ? "OPENING" : "SWITCHING",
      projectId: request.projectId,
      generation: request.generation,
      reason,
    });
    if (previous !== undefined) {
      let teardownFailed = false;
      try {
        await this.#options.flushProject?.(previous.projectId, previous);
      } catch {
        teardownFailed = true;
      }
      try {
        await this.#options.stopProject?.(previous.projectId, previous);
      } catch {
        teardownFailed = true;
      }
      if (teardownFailed) {
        if (!this.#disposed && request.generation === this.#generation) {
          this.#publish({
            phase: "UNAVAILABLE",
            projectId: request.projectId,
            generation: request.generation,
            reason: "OPEN_FAILED",
          });
        }
        return;
      }
    }
    if (this.#disposed || request.generation !== this.#generation) return;

    let opened: TJournal;
    try {
      const persistence = this.#options.createPersistence(request.projectId);
      opened = await this.#options.openJournal(request.projectId, persistence);
      if (opened.projectId !== request.projectId) {
        throw new Error("PiXYNC journal project identity mismatch.");
      }
    } catch {
      if (!this.#disposed && request.generation === this.#generation) {
        this.#publish({
          phase: "UNAVAILABLE",
          projectId: request.projectId,
          generation: request.generation,
          reason: "OPEN_FAILED",
        });
      }
      return;
    }
    if (this.#disposed || request.generation !== this.#generation) {
      await this.#options.stopProject?.(opened.projectId, opened);
      return;
    }
    this.#journal = opened;
    this.#publish({
      phase: "ACTIVE",
      projectId: request.projectId,
      generation: request.generation,
      reason,
    });
  }

  #publish(state: PixyncProjectLifecycleState): void {
    this.#state = { ...state };
    this.#options.onState?.({ ...state });
  }
}
