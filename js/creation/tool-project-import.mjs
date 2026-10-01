import { cloneAsToolProject } from './tool-project-store.mjs?rev=20261001-free-tools-1';
import { componentImageRole, replaceProjectComponentImage } from './project-components.mjs?rev=20261001-free-tools-1';
import { putPxdSharedImage, readPxdImage } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { createAudioSong } from './audio-core.mjs';
import { prepareSharedAudioImageImport, writePxdAudioState } from './pxd-draw-audio.mjs?rev=20261001-free-tools-1';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs';

/** Copy into a fresh tool-owned project; never save or mutate the source. */
export async function importToolProject(source, tool) {
  let project = cloneAsToolProject(source, tool);
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
    const plan = prepareSharedAudioImageImport(createAudioSong({ songId: crypto.randomUUID() }), image);
    project = await writePxdAudioState(project, plan.song, { image: plan.image, link: plan.link });
    project = await replaceProjectComponentImage(project, 'audio', image);
  } else if (tool === 'draw') {
    const animation = await readPxdAnimation(source, role);
    if (animation) project = await writePxdAnimation(project, animation, { role: 'main', posterFrameId: animation.frames[0].id });
    project.manifest.editorState = { draw: { imageRole: 'main' } };
  }
  return project;
}
