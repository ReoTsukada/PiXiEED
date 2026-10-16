import { encodePxd, setPxdBytes } from './pxd-codec.mjs';
import { cloneAsToolProject } from './tool-project-store.mjs?rev=20261016-color-capability-1';
import { componentImageRole, replaceProjectComponentImage } from './project-components.mjs?rev=20261016-tool-shell-1';
import { putPxdSharedImage, readPxdImage } from './pxd-project.mjs?rev=20261016-color-capability-1';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs?rev=20261016-color-capability-1';

/** Copy into a fresh tool-owned project; never save or mutate the source. */
export async function importToolProject(source, tool) {
  const original = source;
  if (tool === 'draw' && source.entries.some(entry => entry.path === 'audio/state.json')) { const { prepareSharedMusicProject } = await import('./draw-music.mjs?rev=20261016-tool-shell-1'); source = await prepareSharedMusicProject(source); }
  let project = cloneAsToolProject(source, tool);
  if (tool === 'draw') project = setPxdBytes(project, 'legacy/import-source.pxd', await encodePxd(original), 'application/octet-stream');
  const sourceTool = source.manifest?.toolProject?.tool || source.manifest?.lastMode;
  if (sourceTool === tool) return project;
  const role = componentImageRole(source, sourceTool || 'draw');
  const image = await readPxdImage(source, role);
  if (!image) return project;
  project = await putPxdSharedImage(project, image);
  if (['jigsaw', 'spot_difference', 'hidden_object'].includes(tool)) {
    // Import the chosen picture, not an unrelated puzzle carried by an old bundle.
    project = { ...project, entries: project.entries.filter((entry) => entry.path !== `puzzles/${tool}.json`) };
  }
  if (tool === 'audio') {
    const [{ createAudioSong }, { prepareSharedAudioImageImport, writePxdAudioState }] = await Promise.all([import('./audio-core.mjs?rev=20261016-color-capability-1'), import('./pxd-draw-audio.mjs?rev=20261016-color-capability-1')]);
    const plan = prepareSharedAudioImageImport(createAudioSong({ songId: crypto.randomUUID() }), image);
    project = await writePxdAudioState(project, plan.song, { image: plan.image, link: plan.link });
    project = await replaceProjectComponentImage(project, 'audio', image);
    const sourceFrameId = source.manifest?.editorState?.draw?.frameId;
    const audioAnimation = sourceFrameId ? await readPxdAnimation(project, 'audio') : null;
    if (audioAnimation?.frames.some(frame => frame.id === sourceFrameId)) {
      project.manifest.editorState = { ...project.manifest.editorState, audio: { ...project.manifest.editorState?.audio, frameId: sourceFrameId } };
    }
  } else if (tool === 'draw') {
    const animation = await readPxdAnimation(source, role);
    if (animation) project = await writePxdAnimation(project, animation, { role: 'main', posterFrameId: animation.frames[0].id });
    project.manifest.editorState = { ...source.manifest.editorState, draw: { ...source.manifest.editorState?.draw, imageRole: 'main' } };
  }
  return project;
}
