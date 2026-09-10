import type {
  GameWorkspaceReturnContext,
} from "./workspace-context.ts";
import { updateGameWorkspaceReturnContext } from "./workspace-context.ts";

export type AudioCaptureState =
  | "SELECTING"
  | "RESOLVING"
  | "READY"
  | "COMMITTING"
  | "COMMITTED"
  | "CANCELLED"
  | "FAILED";

export type AudioCaptureSnap = "BEAT" | "FREE";

export interface AudioCaptureSelection {
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly durationTick: number;
  readonly snap: AudioCaptureSnap;
}

export type AudioCaptureTarget =
  | { readonly kind: "ASSET_SHELF" }
  | { readonly kind: "SCENE_BGM"; readonly sceneId: string }
  | { readonly kind: "OBJECT_TRIGGER"; readonly placementId: string; readonly trigger: "JUMP" | "LAND" | "MOVE" | "ATTACK" | "INTERACT" }
  | { readonly kind: "ANIMATION_MARKER"; readonly clipId: string; readonly phase: "START" | "FRAME" | "LOOP" | "END"; readonly frameIndex?: number }
  | { readonly kind: "TILE_STEP"; readonly assetId: string; readonly tileTag?: string }
  | { readonly kind: "EVENT"; readonly eventId: string };

export interface AudioCaptureReturnContext extends GameWorkspaceReturnContext {
  /** Compatibility names consumed by the existing workspace adapter. */
  readonly inspectorPanel?: string;
  readonly railScrollTop?: number;
  readonly shelfScrollLeft?: number;
}

export const updateAudioCaptureReturnContext = (
  context: AudioCaptureReturnContext,
  patch: Partial<Omit<AudioCaptureReturnContext, "selection">>,
): AudioCaptureReturnContext => updateGameWorkspaceReturnContext(context, patch);

export interface AudioCaptureDraft extends AudioCaptureSelection {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly projectStateHash: string;
  readonly label: string;
  readonly kind: "BGM" | "SE" | "VOICE";
  readonly mode: "LIVE" | "PINNED";
}

export interface AudioCaptureSession {
  readonly sessionId: string;
  readonly selectionGeneration: number;
  readonly state: AudioCaptureState;
  readonly source: "AUDIO";
  readonly expectedProjectRevision: number;
  readonly expectedProjectStateHash: string;
  readonly target: AudioCaptureTarget;
  readonly draft?: AudioCaptureDraft;
  readonly commitId?: string;
  readonly returnContext: AudioCaptureReturnContext;
}

let sessionSequence = 0;

export function beginAudioCaptureSession(input: {
  readonly target: AudioCaptureTarget;
  readonly returnContext: AudioCaptureReturnContext;
  readonly projectRevision: number;
  readonly projectStateHash: string;
  readonly sessionId?: string;
}): AudioCaptureSession {
  sessionSequence += 1;
  return {
    sessionId: input.sessionId ?? `audio-capture:${Date.now()}:${sessionSequence}`,
    selectionGeneration: 0,
    state: "SELECTING",
    source: "AUDIO",
    expectedProjectRevision: input.projectRevision,
    expectedProjectStateHash: input.projectStateHash,
    target: input.target,
    returnContext: input.returnContext,
  };
}

export function updateAudioCaptureDraft(
  session: AudioCaptureSession,
  draft: AudioCaptureDraft,
): AudioCaptureSession {
  if (session.state !== "SELECTING" && session.state !== "RESOLVING" && session.state !== "READY") return session;
  if (draft.projectRevision !== session.expectedProjectRevision || draft.projectStateHash !== session.expectedProjectStateHash) {
    return { ...session, state: "FAILED", selectionGeneration: session.selectionGeneration + 1 };
  }
  return { ...session, state: "READY", draft, selectionGeneration: session.selectionGeneration + 1 };
}

export function beginAudioCaptureResolving(session: AudioCaptureSession): AudioCaptureSession {
  return session.state === "SELECTING" || session.state === "READY" ? { ...session, state: "RESOLVING" } : session;
}

export function beginAudioCaptureCommit(session: AudioCaptureSession, commitId: string): AudioCaptureSession | undefined {
  if (session.state !== "READY" || session.draft === undefined || session.commitId !== undefined) return undefined;
  return { ...session, state: "COMMITTING", commitId };
}

export function finishAudioCaptureCommit(session: AudioCaptureSession): AudioCaptureSession | undefined {
  return session.state === "COMMITTING" ? { ...session, state: "COMMITTED" } : undefined;
}

export function cancelAudioCaptureSession(session: AudioCaptureSession): AudioCaptureSession | undefined {
  return session.state === "SELECTING" || session.state === "RESOLVING" || session.state === "READY"
    ? { ...session, state: "CANCELLED" }
    : undefined;
}

export function isCurrentAudioCaptureSelection(
  session: AudioCaptureSession,
  input: { readonly sessionId: string; readonly selectionGeneration: number; readonly projectRevision: number; readonly projectStateHash: string; readonly selection: AudioCaptureSelection },
): boolean {
  return session.sessionId === input.sessionId &&
    session.selectionGeneration === input.selectionGeneration &&
    session.expectedProjectRevision === input.projectRevision &&
    session.expectedProjectStateHash === input.projectStateHash &&
    session.draft?.startTick === input.selection.startTick &&
    session.draft?.durationTick === input.selection.durationTick &&
    JSON.stringify(session.draft?.trackIds ?? []) === JSON.stringify(input.selection.trackIds);
}

export function audioCaptureSelectionValid(selection: AudioCaptureSelection): boolean {
  return selection.trackIds.length > 0 && selection.trackIds.length <= 32 &&
    selection.trackIds.every((id) => id.trim().length > 0) &&
    Number.isSafeInteger(selection.startTick) && selection.startTick >= 0 &&
    Number.isSafeInteger(selection.durationTick) && selection.durationTick > 0;
}
