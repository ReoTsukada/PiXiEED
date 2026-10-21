import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isLocalReviewSource } from '../../scripts/build-pages-site.mjs';

test('Pages excludes known retired artwork samples and local comparison media without deleting them', () => {
  for (const name of [
    'assets/artworks/sea-cat.jpg', 'assets/artworks/rainy-window.jpg', 'assets/artworks/night-lantern.jpg',
    'assets/pixel-studio/test-media/catalog.json', 'assets/pixel-studio/test-media/street.webm',
    'assets/pixel-studio/test-media/leaves.webm', 'assets/pixel-studio/test-media/README.md',
    'camera-media-test.html', 'css/camera-media-test.css', 'js/pixel-studio/media-test.mjs',
  ]) assert.equal(isLocalReviewSource(name), true, name);
});

test('review exclusion protects formal assets, arbitrary artwork and public routes containing preview or sample names', () => {
  for (const name of [
    'assets/brand/pixieed-logo-48.png', 'assets/brand/pixieed-logo-1920.png',
    'assets/artworks/official-1.jpg', 'assets/artworks/user-8.png', 'assets/samples/maou.png',
    'assets/pixel-studio/samples/astronaut.png', 'assets/screenshots/previews/draw-pc-maou-480.webp',
    'assets/screenshots/home-camera-empty.png', 'assets/og/site.png', 'js/tool-previews.mjs',
    'works/sea-cat.html', 'feed/index.html', 'draw/index.html', 'camera/index.html',
    'play/hidden-object/puzzles/pixfind-ho-a90bc7c5-e055-447c-b67f-d0b9fa61e3fa/ogp-abb89804d66dabb3.png',
  ]) assert.equal(isLocalReviewSource(name), false, name);
});

