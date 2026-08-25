/** Small Web MIDI adapter. The Audio workspace remains usable without Web MIDI. */

export type WebMidiNoteMessage =
  | {
    readonly type: "noteon";
    readonly channel: number;
    readonly pitchMidi: number;
    readonly velocity: number;
  }
  | {
    readonly type: "noteoff";
    readonly channel: number;
    readonly pitchMidi: number;
    readonly velocity: number;
  };

export interface WebMidiInputConnection {
  readonly inputCount: number;
  readonly inputNames: readonly string[];
  close: () => void;
}

interface MidiInputPortLike {
  id?: string;
  name?: string | null;
  state?: string;
  type?: string;
  onmidimessage: ((event: { readonly data?: Uint8Array }) => void) | null;
}

interface MidiAccessLike {
  inputs: Map<string, MidiInputPortLike> | Iterable<MidiInputPortLike>;
}

interface NavigatorWithMidi {
  requestMIDIAccess?: (
    options?: { readonly sysex?: boolean },
  ) => Promise<MidiAccessLike>;
}

function portsFromAccess(access: MidiAccessLike): MidiInputPortLike[] {
  if (access.inputs instanceof Map) return [...access.inputs.values()];
  return [...access.inputs];
}

function decodeMessage(data: Uint8Array): WebMidiNoteMessage | undefined {
  if (data.length < 3) return undefined;
  const status = data[0]!;
  const data1 = data[1]!;
  const data2 = data[2]!;
  const type = status & 0xf0;
  if (type !== 0x80 && type !== 0x90) return undefined;
  const velocity = Math.min(127, Math.max(0, data2 & 0x7f));
  return {
    type: type === 0x80 || velocity === 0 ? "noteoff" : "noteon",
    channel: status & 0x0f,
    pitchMidi: Math.min(127, Math.max(0, data1 & 0x7f)),
    velocity,
  };
}

/** Request MIDI permission and listen to all available input ports. */
export async function connectWebMidiInput(
  onMessage: (message: WebMidiNoteMessage) => void,
): Promise<WebMidiInputConnection> {
  const navigatorWithMidi = globalThis.navigator as
    | (Navigator & NavigatorWithMidi)
    | undefined;
  const request = navigatorWithMidi?.requestMIDIAccess;
  if (typeof request !== "function") {
    throw new Error("Web MIDI is unavailable in this browser.");
  }
  const access = await request.call(navigatorWithMidi, { sysex: false });
  const ports = portsFromAccess(access).filter((port) =>
    port.type === undefined || port.type === "input"
  );
  const handlers = new Map<
    MidiInputPortLike,
    (event: { readonly data?: Uint8Array }) => void
  >();
  for (const port of ports) {
    const handler = (event: { readonly data?: Uint8Array }): void => {
      const message = event.data === undefined
        ? undefined
        : decodeMessage(event.data);
      if (message !== undefined) onMessage(message);
    };
    handlers.set(port, handler);
    port.onmidimessage = handler;
  }
  return {
    inputCount: ports.length,
    inputNames: ports.map((port) =>
      port.name?.trim() || port.id || "MIDI Input"
    ),
    close: () => {
      for (const [port, handler] of handlers) {
        if (port.onmidimessage === handler) port.onmidimessage = null;
      }
      handlers.clear();
    },
  };
}
