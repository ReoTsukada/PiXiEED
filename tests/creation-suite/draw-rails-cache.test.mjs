import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

test('Draw rail, editor UI, and direct runtime changes invalidate every parent and editor entry', async () => {
  const root = new URL('../../', import.meta.url);
  const revisions = JSON.parse(await readFile(new URL('tests/runtime-cache-revisions.json', root), 'utf8'));
  const creationGuidance = new Set(["js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-shell.mjs", "js/creation/creation-runtime.mjs", "js/tool-direct.mjs", "css/project-workspace.css", "js/creation/project-start-picker.mjs", "js/home-portal.mjs", "css/home-portal.css"]);
  const homeCommunity = new Set(['js/home-portal.mjs', 'css/home-portal.css']);
  for (const target of creationGuidance) assert.equal(revisions[target], target === 'css/home-portal.css' ? '20261113-home-world-1' : homeCommunity.has(target) ? '20261112-posted-random-1' : '20261112-creation-guidance-1');
  const outputOfferwall = new Set([
    'js/creation/conversion-startup.mjs', 'data/posting-policy.mjs', 'js/ads/conversion-display-ad.mjs',
    'js/adsense-offerwall-policy.js', 'js/app.js', 'js/creation/audio-entry.mjs',
    'js/creation/audio-page.mjs', 'js/creation/conversion-entry.mjs', 'js/creation/conversion-page.mjs',
    'js/creation/conversion-recovery-workspace.mjs', 'js/creation/conversion-smart-ui.mjs', 'js/creation/creation-camera.mjs',
    'js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/creation/draw-music.mjs', 'js/creation/draw-page.mjs', 'js/creation/hidden-object-page.mjs',
    'js/creation/jigsaw-page.mjs', 'js/creation/legacy-placement-page.mjs', 'js/creation/output-entry-context.mjs',
    'js/creation/output-handoff-core.mjs', 'js/creation/output-handoff.mjs', 'js/creation/output-page.mjs',
    'js/creation/output-receive.mjs', 'js/creation/output-router.mjs', 'js/creation/pixfind-play.mjs',
    'js/creation/profile-likes-page.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs',
    'js/creation/spot-difference-page.mjs', 'js/creation/text-tools.mjs', 'js/creation/tool-project-import.mjs',
    'js/creation/work-save-policy.mjs', 'js/globe/post-supabase.mjs', 'js/globe/post-ui.mjs',
    'js/globe/prototype.mjs', 'js/home-startup.mjs', 'js/pixel-export.mjs',
    'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs', 'js/pixel-lens/file-save.mjs',
    'js/pixel-studio/app.mjs', 'js/post-composer.js', 'js/posting-consent-ui.mjs',
    'js/site-header.mjs', 'js/social/api.mjs', 'js/social/app.mjs',
    'js/social/server-actions.mjs', 'js/social/tool-handoff.mjs', 'js/tool-direct.mjs',
    'js/tool-header-controls.mjs', 'js/tool-offerwall-entry.mjs', 'js/tool-shell.mjs',
  ]);
  const lazyGallery = new Set(["js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-gallery-data.mjs", "js/creation/project-start-picker.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-store.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/creation/tool-project-import.mjs", "js/creation/tool-project-store.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
  for (const target of lazyGallery) assert.equal(revisions[target], creationGuidance.has(target) ? '20261112-creation-guidance-1' : outputOfferwall.has(target) ? '20261111-output-offerwall-1' : '20261109-lazy-gallery-1');
  const importPreview = new Set(["css/project-workspace.css", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-gallery.mjs", "js/creation/project-start-picker.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
  for (const target of importPreview) assert.equal(revisions[target], creationGuidance.has(target) ? '20261112-creation-guidance-1' : outputOfferwall.has(target) ? '20261111-output-offerwall-1' : lazyGallery.has(target) ? '20261109-lazy-gallery-1' : '20261109-import-preview-gallery-1');
  const ellipse = new Set(["js/creation/draw-tool-operations.mjs", "js/creation/draw-page.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
  for (const target of ellipse) assert.equal(revisions[target], creationGuidance.has(target) ? '20261112-creation-guidance-1' : outputOfferwall.has(target) ? '20261111-output-offerwall-1' : lazyGallery.has(target) ? '20261109-lazy-gallery-1' : importPreview.has(target) ? '20261109-import-preview-gallery-1' : '20261109-ellipse-geometry-1');
  const manager = new Set(["js/creation/project-gallery.mjs", "js/creation/shared-project-settings.mjs", "css/creation-modes.css", "css/project-workspace.css", "css/tool-direct.css", "data/project-gallery-ad-config.mjs", "js/ads/project-gallery-ad.mjs", "js/ads/project-manager-ad.mjs", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/draw-viewport-overlays.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-start-picker.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
  const gallery = new Set(["css/project-workspace.css", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-gallery.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-store.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/creation/tool-project-import.mjs", "js/creation/tool-project-store.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
  const resume = new Set(['js/tool-direct.mjs', 'js/tool-shell.mjs']);
  const galleryAd = new Set(['js/tool-direct.mjs', 'js/tool-shell.mjs']);
  const brushCamera = new Set(["js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "css/draw-brush-settings.css", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/tool-direct.mjs", "js/tool-help-bootstrap.mjs", "js/tool-help-data.mjs", "js/tool-help.mjs", "js/tool-shell.mjs"]);
  const continuity = new Set(['js/creation/creation-camera.mjs', 'js/creation/creation-mode-motion.mjs', 'js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/tool-direct.mjs', 'js/tool-shell.mjs', 'css/creation-modes.css']);
  const currentModeIcon = new Set(['js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs', 'js/tool-direct.mjs', 'js/tool-shell.mjs']);
  const modeClarity = new Set([...currentModeIcon, 'js/creation/creation-camera.mjs', 'css/creation-modes.css']);
  const buttonIconAudit = new Set([
    'js/creation/audio-entry.mjs', 'js/creation/audio-page.mjs', 'js/creation/animation-controls.mjs', 'js/creation/draw-page.mjs',
    'js/creation/draw-desktop-ui.mjs', 'js/creation/draw-audio-timbre-panel.mjs', 'js/creation/draw-music.mjs',
    'js/creation/project-workspace.mjs', 'js/creation/tool-project-import.mjs',
    'css/creation-editor.css', 'css/creation-animation.css', 'css/draw-audio-timbre-panel.css', 'css/draw-desktop-ui.css', 'css/draw-tool-picker.css'
  ]);
  const paletteNoop = new Set(['js/creation/draw-page.mjs']);
  const contextualControls = new Set([
    'js/creation/draw-page.mjs', 'js/creation/draw-desktop-ui.mjs', 'js/creation/draw-brush-settings.mjs',
    'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs', 'js/tool-direct.mjs', 'js/tool-shell.mjs',
    'css/draw-desktop-ui.css', 'css/draw-selection-features.css', 'css/draw-brush-settings.css'
  ]);
  const drawSearchRails = new Set([
    'js/creation/animation-controls.mjs', 'js/creation/draw-desktop-ui.mjs', 'js/creation/draw-brush-settings.mjs', 'js/creation/draw-page.mjs',
    'js/creation/draw-entry.mjs', 'js/creation/audio-page.mjs', 'js/creation/audio-entry.mjs',
    'js/creation/creation-runtime.mjs', 'js/tool-direct.mjs', 'js/tool-shell.mjs',
    'css/draw-desktop-ui.css', 'css/draw-color-adjustment-panel.css'
  ]);
  const stagedStartup = new Set(['js/creation/draw-page.mjs', 'js/creation/draw-entry.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/creation-modes.mjs', 'js/creation/creation-camera.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs', 'js/tool-direct.mjs', 'js/tool-shell.mjs']);
  const currentPuzzlePublicTargets = new Set(['js/creation/hidden-object-page.mjs', 'js/creation/jigsaw-page.mjs', 'js/creation/spot-difference-page.mjs']);
  const previousRelease = new Set(['js/creation/draw-desktop-ui.mjs']);
  const cameraWorkEntry = new Set([
    'js/creation/creation-camera.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/engine.mjs', 'js/pixel-lens/entry.mjs',
    'js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/tool-direct.mjs', 'js/tool-shell.mjs'
  ]);
  const freeTools = new Set([
    'js/creation/audio-page.mjs', 'js/creation/audio-entry.mjs', 'js/creation/creation-camera.mjs',
    'js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/creation/draw-page.mjs', 'js/creation/hidden-object-page.mjs', 'js/creation/jigsaw-page.mjs',
    'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs', 'js/creation/spot-difference-page.mjs',
    'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs', 'js/tool-direct.mjs', 'js/tool-shell.mjs'
  ]);
  const allToolsOfferwall = new Set([
    'js/creation/audio-page.mjs', 'js/creation/audio-entry.mjs', 'js/creation/creation-camera.mjs',
    'js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/creation/draw-page.mjs', 'js/creation/hidden-object-page.mjs', 'js/creation/jigsaw-page.mjs',
    'js/creation/output-page.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs',
    'js/creation/spot-difference-page.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs',
    'js/tool-direct.mjs', 'js/tool-offerwall-entry.mjs', 'js/tool-shell.mjs'
  ]);
  const commonToolStart = new Set([
    'js/adsense-offerwall-policy.js', 'js/app.js', 'js/creation/audio-entry.mjs', 'js/creation/audio-page.mjs',
    'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs',
    'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/hidden-object-page.mjs',
    'js/creation/jigsaw-page.mjs', 'js/creation/output-page.mjs', 'js/creation/project-workspace.mjs',
    'js/creation/pxd-ui.mjs', 'js/creation/spot-difference-page.mjs', 'js/home-startup.mjs',
    'js/page-navigation.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs', 'js/public-navigation.mjs',
    'js/site-header.mjs', 'js/tool-direct.mjs', 'js/tool-embed.mjs',
    'js/tool-entry-compat.js', 'js/tool-offerwall-entry.mjs', 'js/tool-shell.mjs',
    'js/tool-start-routes.mjs', 'js/tool-workspace-state.mjs'
  ]);
  for (const target of allToolsOfferwall) assert.equal(revisions[target], target === 'js/home-startup.mjs' ? '20261113-home-world-1' : creationGuidance.has(target) ? '20261112-creation-guidance-1' : outputOfferwall.has(target) ? '20261111-output-offerwall-1' : lazyGallery.has(target) ? '20261109-lazy-gallery-1' : importPreview.has(target) ? '20261109-import-preview-gallery-1' : ellipse.has(target) ? '20261109-ellipse-geometry-1' : manager.has(target) ? '20261108-gallery-canvas-viewport-1' : galleryAd.has(target) ? '20261108-gallery-first-ad-1' : gallery.has(target) ? '20261107-gallery-1' : resume.has(target) ? '20261107-resume-same-project-1' : brushCamera.has(target) ? '20261107-brush-camera-1' : continuity.has(target) ? '20261107-mode-continuity-1' : buttonIconAudit.has(target) || modeClarity.has(target) ? '20261106-button-icon-audit-1' : target === 'js/creation/output-page.mjs' || target === 'js/tool-offerwall-entry.mjs' ? '20261110-output-result-1' : paletteNoop.has(target) ? '20261106-audio-palette-noop-1' : '20261024-common-tool-start-1', `${target} invalidates the normalized tool-start dependency chain`);
  const changed = new Set([
    'js/creation/editor-ui.mjs', 'js/creation/draw-page.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/creation/audio-page.mjs', 'js/creation/audio-entry.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs',
    'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs', 'js/creation/hidden-object-page.mjs',
    'js/creation/jigsaw-page.mjs', 'js/creation/spot-difference-page.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs'
  ]);
  const graph = {
    'js/creation/draw-desktop-ui.mjs': ['js/creation/draw-desktop-layout.mjs', 'css/draw-desktop-ui.css'],
    'js/creation/draw-page.mjs': ['js/creation/draw-tool-operations.mjs', 'js/creation/draw-desktop-ui.mjs', 'js/creation/draw-brush-settings.mjs', 'js/creation/draw-viewport-overlays.mjs', 'js/creation/animation-controls.mjs', 'js/creation/editor-ui.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs'],
    'js/creation/creation-runtime.mjs': ['js/creation/draw-page.mjs', 'js/creation/project-workspace.mjs', 'js/creation/creation-modes.mjs'],
    'js/creation/draw-entry.mjs': ['js/creation/draw-page.mjs', 'js/creation/creation-runtime.mjs'],
    'js/creation/audio-page.mjs': ['js/creation/animation-controls.mjs', 'js/creation/editor-ui.mjs', 'js/creation/project-workspace.mjs'],
    'js/creation/audio-entry.mjs': ['js/creation/audio-page.mjs'],
    'js/creation/pxd-ui.mjs': ['js/creation/project-workspace.mjs'],
    'js/creation/creation-camera.mjs': ['js/creation/project-workspace.mjs', 'js/pixel-lens/app.mjs'],
    'js/creation/creation-modes.mjs': ['js/creation/creation-camera.mjs', 'js/creation/shared-project-settings.mjs'],
    'js/creation/hidden-object-page.mjs': ['js/creation/pxd-ui.mjs', 'js/tool-offerwall-entry.mjs'],
    'js/creation/jigsaw-page.mjs': ['js/creation/pxd-ui.mjs', 'js/tool-offerwall-entry.mjs'],
    'js/creation/spot-difference-page.mjs': ['js/creation/pxd-ui.mjs', 'js/tool-offerwall-entry.mjs'],
    'js/creation/output-page.mjs': ['js/tool-offerwall-entry.mjs'],
    'js/pixel-lens/app.mjs': ['js/creation/pxd-ui.mjs', 'js/pixel-lens/engine.mjs'],
    'js/pixel-lens/entry.mjs': ['js/pixel-lens/app.mjs'],
    'js/tool-direct.mjs': ['js/creation/creation-runtime.mjs'],
    'js/tool-shell.mjs': ['js/tool-direct.mjs'],
    'draw/index.html': ['js/tool-shell.mjs'],
    'camera/index.html': ['js/tool-shell.mjs'],
    'audio/index.html': ['js/tool-shell.mjs'],
    'draw/editor.html': ['js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/project-workspace.mjs', 'css/creation-animation.css', 'css/draw-color-adjustment-panel.css', 'css/draw-brush-settings.css'],
    'audio/editor.html': ['js/creation/audio-entry.mjs', 'css/creation-animation.css'],
    'hidden-object/index.html': ['js/creation/hidden-object-page.mjs'],
    'jigsaw/index.html': ['js/creation/jigsaw-page.mjs'],
    'spot-difference/index.html': ['js/creation/spot-difference-page.mjs'],
    'pixel-camera.html': ['js/pixel-lens/entry.mjs']
  };
  for (const [owner, targets] of Object.entries(graph)) {
    const source = await readFile(new URL(owner, root), 'utf8');
    const references = [...source.matchAll(/["'`]([^"'`\s]+\.(?:mjs|css)(?:\?[^"'`\s]*)?)["'`]/g)].map(match => match[1]);
    for (const target of targets) {
      const urls = references.filter(value => {
        const path = value.split('?')[0];
        return (path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(owner), path))) === target;
      });
      assert.ok(urls.length, `${owner} references ${target}`);
      assert.ok(revisions[target], `${target} has a release revision`);
      if (creationGuidance.has(target)) assert.equal(revisions[target], '20261112-creation-guidance-1', `${target} invalidates the creation guidance dependency closure`);
      else if (['js/app.js', 'js/creation/legacy-placement-page.mjs'].includes(target)) assert.equal(revisions[target], '20261112-profile-workspace-1', `${target} invalidates the profile workspace release`);
      else if (outputOfferwall.has(target)) assert.equal(revisions[target], target === 'js/home-startup.mjs' ? '20261113-home-world-1' : '20261111-output-offerwall-1', `${target} invalidates the output Offerwall dependency closure`);
      else if (lazyGallery.has(target)) assert.equal(revisions[target], '20261109-lazy-gallery-1', `${target} invalidates the lazy gallery dependency chain`);
      else if (importPreview.has(target)) assert.equal(revisions[target], '20261109-import-preview-gallery-1', `${target} invalidates the import preview dependency chain`);
      else if (ellipse.has(target)) assert.equal(revisions[target], '20261109-ellipse-geometry-1', `${target} invalidates the ellipse geometry dependency chain`);
      else if (manager.has(target)) assert.equal(revisions[target], '20261108-gallery-canvas-viewport-1', `${target} invalidates the manager UI/ad dependency chain`);
      else if (galleryAd.has(target)) assert.equal(revisions[target], '20261108-gallery-first-ad-1', `${target} invalidates the gallery-ad entry chain`);
      else if (gallery.has(target)) assert.equal(revisions[target], '20261107-gallery-1', `${target} invalidates the lightweight gallery dependency closure`);
      else if (resume.has(target)) assert.equal(revisions[target], '20261107-resume-same-project-1', `${target} invalidates the same-project resume entry`);
      else if (brushCamera.has(target)) assert.equal(revisions[target], '20261107-brush-camera-1', `${target} invalidates the brush and camera fixes`);
      else if (continuity.has(target)) assert.equal(revisions[target], '20261107-mode-continuity-1', `${target} invalidates continuous mode motion`);
      else if (buttonIconAudit.has(target) || modeClarity.has(target)) assert.equal(revisions[target], '20261106-button-icon-audit-1', `${target} invalidates the icon audit dependency closure`);
      else if (paletteNoop.has(target)) assert.equal(revisions[target], '20261106-audio-palette-noop-1', `${target} invalidates the guarded audio palette UI`);
      else if (commonToolStart.has(target)) assert.equal(revisions[target], ['js/adsense-offerwall-policy.js', 'js/creation/output-page.mjs', 'js/tool-offerwall-entry.mjs', 'js/tool-start-routes.mjs'].includes(target) ? '20261110-output-result-1' : '20261024-common-tool-start-1', `${target} invalidates the common tool-start dependency closure`);
      else if (freeTools.has(target)) assert.equal(revisions[target], '20261024-free-tools-1', `${target} invalidates the free-tools behavior and every transitive importer`);
      else if (currentModeIcon.has(target)) assert.equal(revisions[target], '20261024-mode-icon-1', `${target} invalidates the current mode icon and entry chain`);
      else if (contextualControls.has(target)) assert.equal(revisions[target], '20261024-context-controls-1', `${target} invalidates contextual controls and their entry chain`);
      else if (stagedStartup.has(target)) assert.equal(revisions[target], '20261020-staged-startup-1', 'staged startup invalidates changed modules and their parent URLs');
      else if (drawSearchRails.has(target)) assert.equal(revisions[target], '20261019-draw-search-rail-1', `${target} invalidates the Draw control and search guidance release`);
      else if (cameraWorkEntry.has(target)) assert.equal(revisions[target], '20261019-camera-original-color-1', `${target} invalidates the explicit camera entry release`);
      else if (currentPuzzlePublicTargets.has(target)) assert.equal(revisions[target], '20261021-jigsaw-public-1', `${target} carries the public puzzle handoff release revision`);
      else if (changed.has(target)) assert.equal(revisions[target], '20261018-direct-runtime-2', `${target} carries the direct runtime release revision`);
      if (previousRelease.has(target) && !drawSearchRails.has(target)) assert.equal(revisions[target], '20261018-direct-runtime-1', `${target} keeps the previous release revision`);
      for (const value of urls) assert.equal(new URL(value, `https://local.invalid/${owner}`).searchParams.get('rev'), revisions[target], `${owner} invalidates ${target}`);
    }
  }
});
