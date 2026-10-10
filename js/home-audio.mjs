/** Gesture-gated audio lifecycle for the home canvas. */
export function createHomeAudio({
  createContext = () => new AudioContext(),
  onChange = () => {},
  initialOn = true,
} = {}) {
  let context = null;
  let output = null;
  let soundOn = Boolean(initialOn);
  let visible = true;
  let activated = false;
  let unavailable = false;
  let generation = 0;

  const state = () => {
    if (!soundOn) return 'stopped';
    if (unavailable) return 'unavailable';
    if (!context) return 'waiting';
    if (!activated) return 'standby';
    if (!visible || context?.state !== 'running') return 'standby';
    return 'playing';
  };
  const publish = () => onChange(state());
  const setOutput = (value) => {
    if (!output || !context) return;
    const now = context.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(value, now);
  };
  const makeContext = () => {
    if (context) return true;
    try {
      context = createContext();
      output = context.createGain();
      output.gain.value = 0;
      output.connect(context.destination);
      context.onstatechange = () => {
        if (context.state === 'running' && soundOn && visible && activated) setOutput(0.55);
        else setOutput(0);
        if (context.state === 'closed') { unavailable = true; activated = false; }
        publish();
      };
      return true;
    } catch {
      unavailable = true;
      publish();
      return false;
    }
  };
  async function resume() {
    const token = ++generation;
    if (!soundOn || !visible || !context) return false;
    try {
      await context.resume();
      if (token !== generation || !soundOn || !visible) {
        if (!soundOn || !visible || !activated) {
          setOutput(0);
          if (context.state === 'running') await context.suspend();
        }
        return false;
      }
      if (context.state !== 'running') { setOutput(0); publish(); return false; }
      activated = true;
      setOutput(0.55);
      publish();
      return true;
    } catch {
      unavailable = true;
      activated = false;
      setOutput(0);
      publish();
      return false;
    }
  }

  return {
    get context() { return context; },
    get output() { return output; },
    get enabled() { return soundOn; },
    get state() { return state(); },
    canPlay() { return soundOn && visible && activated && context?.state === 'running'; },
    activateFromGesture() {
      if (!soundOn || !visible || unavailable || !makeContext()) return Promise.resolve(false);
      activated = true;
      return resume();
    },
    resumeByControl() {
      soundOn = true;
      unavailable = false;
      if (!visible || !makeContext()) { publish(); return Promise.resolve(false); }
      activated = true;
      publish();
      return resume();
    },
    stop() {
      soundOn = false;
      activated = false;
      generation++;
      setOutput(0);
      if (context?.state === 'running') void context.suspend().catch(() => {});
      publish();
    },
    setVisible(value) {
      visible = Boolean(value);
      if (!visible) {
        generation++;
        activated = false;
        setOutput(0);
        if (context?.state === 'running') void context.suspend().catch(() => {});
      }
      // Becoming visible never resumes audio; a fresh drawing gesture is needed.
      publish();
    },
  };
}
