import { getPxdJson } from './pxd-codec.mjs';

/** Read link metadata without loading the music editor and synthesizer. */
export function readPxdAudioLink(project) {
  if (!project?.entries?.some(entry => entry.path === 'audio/link.json')) return null;
  return structuredClone(getPxdJson(project, 'audio/link.json'));
}
