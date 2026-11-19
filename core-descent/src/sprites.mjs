/**
 * Original, code-native pixel sprites for CORE DESCENT.
 * The source atlas stores thin horizontal slices. Character poses are rendered
 * bottom-to-top into cached images; the game draws those images, not geometry.
 * No downloaded art, network access, simulation state or random generator.
 */
export const SPRITE_Y_SCALE = 0.78;

function surface(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Sprite rendering requires a Canvas2D environment.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

/** Integer scanlines retain a deliberately small, crisp pixel palette. */
function disc(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  for (let row = -Math.ceil(ry); row <= Math.ceil(ry); row++) {
    const ratio = (row + .5) / ry;
    if (Math.abs(ratio) > 1) continue;
    const span = Math.round(rx * Math.sqrt(1 - ratio * ratio));
    ctx.fillRect(Math.round(x - span), Math.round(y + row), span * 2, 1);
  }
}
function block(ctx, x, y, w, h, color, bevel = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x + bevel, y, Math.max(0, w - bevel * 2), h);
  ctx.fillRect(x, y + bevel, w, Math.max(0, h - bevel * 2));
}
function pixel(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

const PAL = Object.freeze({
  outline: '#101d24', black: '#0c171e', dark: '#233d47', shadow: '#172a34',
  teal: '#438d8d', mint: '#6bc5b3', light: '#c4e1d0', cream: '#f1f0d2',
  navy: '#2e4d58', slate: '#42616a', steel: '#718a86',
  rust: '#924b4b', coral: '#e27b65', ember: '#f4b66e',
  violet: '#736580', paleViolet: '#ad96ae', gold: '#b49b65',
});

export class SpriteAtlas {
  constructor() {
    this.sheet = surface(1024, 1024);
    this.ctx = this.sheet.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.cursor = { x: 0, y: 0, row: 0 };
    this.layers = new Map(); this.stacks = new Map(); this.poses = new Map();
    this.tiles = new Map(); this.walls = new Map(); this.glows = new Map();
  }
  slice(key, size, paint) {
    if (this.layers.has(key)) return this.layers.get(key);
    const p = this.cursor;
    if (p.x + size + 2 > this.sheet.width) { p.x = 0; p.y += p.row + 2; p.row = 0; }
    if (p.y + size + 2 > this.sheet.height) throw new Error('Sprite slice atlas exhausted.');
    const rect = { x: p.x, y: p.y, w: size, h: size };
    this.ctx.save(); this.ctx.translate(p.x + size / 2, p.y + size / 2);
    paint(this.ctx); this.ctx.restore();
    p.x += size + 2; p.row = Math.max(p.row, size);
    this.layers.set(key, rect); return rect;
  }
  stack(kind, frame = 0) {
    const key = `${kind}:${frame}`;
    if (this.stacks.has(key)) return this.stacks.get(key);
    const layers = [];
    const add = (z, name, size, paint) => layers.push({ z, rect: this.slice(`${key}:${name}`, size, paint) });
    const stride = [0, 2, 0, -2][frame % 4];
    if (kind === 'player') {
      for (let z = 1; z <= 8; z += 2) add(z, `legs${z}`, 32, c => {
        block(c, -5 + stride, -6, 9, 5, z < 4 ? PAL.outline : PAL.dark);
        block(c, -5 - stride, 1, 9, 5, z < 4 ? PAL.outline : PAL.navy);
        if (z < 4) { pixel(c, 2 + stride, -5, 3, 3, PAL.steel); pixel(c, 2 - stride, 2, 3, 3, PAL.steel); }
      });
      for (let z = 9; z <= 19; z += 2) add(z, `body${z}`, 48, c => {
        block(c, -7, -8, 13, 16, z === 19 ? PAL.steel : z > 13 ? PAL.teal : PAL.dark, 2);
        block(c, -9, -5, 4, 10, z > 15 ? PAL.navy : PAL.outline);
        block(c, -2, -11, 9, 5, z > 15 ? PAL.light : PAL.navy);
        block(c, -2, 6, 9, 5, z > 15 ? PAL.mint : PAL.navy);
        if (z === 17) { pixel(c, 4, -6, 2, 12, PAL.mint); pixel(c, -5, -5, 3, 10, PAL.dark); }
        if (z >= 13 && z <= 17) {
          block(c, 5, -3, 16, 6, PAL.outline);
          pixel(c, 8, -2, 15, 4, z === 17 ? PAL.steel : PAL.dark);
          pixel(c, 18, -2, 3, 4, PAL.mint);
          if (z === 17) pixel(c, 10, -1, 7, 1, PAL.cream);
        }
      });
      for (let z = 20; z <= 27; z++) add(z, `head${z}`, 24, c => {
        const radius = z >= 26 ? 5 : 7;
        block(c, -radius, -radius, radius * 2, radius * 2,
          z >= 26 ? PAL.light : z < 22 ? PAL.outline : PAL.steel, 2);
        if (z >= 22 && z <= 24) { pixel(c, 4, -5, 3, 10, PAL.dark); pixel(c, 6, -4, 1, 8, PAL.mint); }
        if (z === 27) { pixel(c, -3, -4, 2, 8, PAL.cream); pixel(c, 1, -3, 3, 6, '#a3c0b1'); }
      });
    } else if (kind === 'crawler') {
      add(1, 'feet', 32, c => {
        for (const side of [-1, 1]) for (let i = -1; i <= 1; i++) {
          block(c, i * 6 - 2 + (i % 2 ? stride : -stride), side * 9 - 2, 5, 4, PAL.outline);
          pixel(c, i * 6 - 1, side * 7 - 1, 4, 2, PAL.rust);
        }
      });
      for (let z = 2; z <= 11; z++) add(z, `shell${z}`, 28, c => {
        const r = z > 9 ? 6 : z < 5 ? 10 : 9;
        disc(c, 0, 0, r, Math.max(4, r - 2), z < 4 ? PAL.outline : z < 8 ? '#75474d' : PAL.coral);
        if (z >= 7) { pixel(c, -r + 2, -1, r + 5, 2, '#a95e59'); pixel(c, 4, -4, 3, 2, PAL.ember); pixel(c, 4, 2, 3, 2, PAL.ember); }
        if (z === 11) pixel(c, -4, -3, 3, 6, '#f1a27b');
      });
    } else if (kind === 'stalker') {
      for (let z = 1; z <= 7; z += 2) add(z, `feet${z}`, 28, c => {
        block(c, -5 + stride * 2, -6, 6, 4, PAL.outline);
        block(c, -5 - stride * 2, 2, 6, 4, '#5a4944');
      });
      for (let z = 8; z <= 20; z += 2) add(z, `spine${z}`, 28, c => {
        block(c, -6, -5, 10, 10, z > 15 ? '#c48b61' : '#695048', 2);
        if (z < 13) { pixel(c, 3, -9, 7, 3, PAL.rust); pixel(c, 3, 6, 7, 3, PAL.rust); }
        if (z > 15) { pixel(c, 3, -4, 4, 8, PAL.outline); pixel(c, 6, -3, 1, 6, PAL.ember); }
        if (z === 20) { pixel(c, -3, -3, 4, 6, '#e3bc88'); pixel(c, -8, -1, 2, 2, PAL.coral); }
      });
    } else if (kind === 'warden') {
      for (let z = 1; z <= 9; z += 2) add(z, `feet${z}`, 40, c => {
        block(c, -9 + stride, -11, 13, 8, z < 5 ? PAL.outline : '#4d4a61', 2);
        block(c, -9 - stride, 3, 13, 8, z < 5 ? PAL.outline : '#5a536c', 2);
      });
      for (let z = 10; z <= 27; z += 2) add(z, `armor${z}`, 44, c => {
        block(c, -11, -11, 21, 22, z > 22 ? PAL.paleViolet : '#615970', 3);
        block(c, -8, -16, 16, 7, z > 20 ? PAL.violet : '#3b3c50', 2);
        block(c, -8, 9, 16, 7, z > 20 ? '#9a8098' : '#3b3c50', 2);
        pixel(c, -8, -2, 16, 4, '#49495c');
        if (z > 20) { pixel(c, 9, -6, 2, 12, '#cc9a9e'); pixel(c, -7, -10, 5, 2, '#c3a9b6'); }
      });
      for (let z = 28; z <= 35; z++) add(z, `helmet${z}`, 28, c => {
        block(c, -7, -8, 14, 16, z > 32 ? '#c3a9b6' : '#514858', 2);
        if (z > 29 && z < 33) { pixel(c, 5, -5, 3, 10, PAL.outline); pixel(c, 7, -3, 2, 6, '#f3b28f'); }
        if (z === 35) pixel(c, -3, -6, 2, 12, '#e1cad0');
      });
    } else if (kind === 'boss') {
      for (let z = 1; z <= 15; z += 3) add(z, `foundation${z}`, 88, c => {
        disc(c, 0, 0, z < 7 ? 37 : 29, z < 7 ? 32 : 24, z < 7 ? PAL.outline : '#3c5559');
        block(c, -22, -29, 32, 16, z < 7 ? '#253b45' : '#537475', 3);
        block(c, -22, 13, 32, 16, z < 7 ? '#253b45' : '#537475', 3);
      });
      for (let z = 16; z <= 51; z += 3) add(z, `body${z}`, 96, c => {
        block(c, -25, -25, 46, 50, z > 42 ? '#819080' : z < 28 ? '#334b52' : '#566e6d', 6);
        block(c, -17, -39, 34, 17, z > 42 ? '#a39772' : '#495e60', 3);
        block(c, -17, 22, 34, 17, z > 42 ? '#8c8064' : '#384e55', 3);
        pixel(c, -19, -19, 10, 38, '#354b51');
        if (z > 24 && z < 44) { block(c, 18, -10, 7, 20, PAL.outline, 2); pixel(c, 21, -7, 4, 14, z % 2 ? '#efab67' : '#cd7657'); }
        if (z > 42) { pixel(c, -13, -35, 17, 2, '#dac793'); pixel(c, -13, 26, 17, 2, '#c1ac82'); pixel(c, 10, -21, 7, 42, '#a5ac8d'); }
      });
      for (let z = 52; z <= 69; z += 2) add(z, `crown${z}`, 60, c => {
        block(c, -14, -15, 26, 30, z > 63 ? '#a49e80' : '#586563', 3);
        if (z > 55 && z < 63) { pixel(c, 10, -10, 5, 20, PAL.outline); pixel(c, 13, -7, 2, 14, '#f3c982'); }
        pixel(c, -11, -22, 5, 12, '#6f776a'); pixel(c, -11, 10, 5, 12, '#6f776a');
        if (z === 68) { pixel(c, -8, -11, 3, 22, '#dbd2ac'); pixel(c, 0, -7, 7, 14, '#b5b296'); }
      });
    } else throw new Error(`Unknown sprite: ${kind}`);
    const result = { layers, width: kind === 'boss' ? 160 : 84, height: kind === 'boss' ? 166 : 100,
      anchorX: kind === 'boss' ? 80 : 42, anchorY: kind === 'boss' ? 126 : 76 };
    this.stacks.set(key, result); return result;
  }
  get(kind, direction = 0, frame = 0) {
    direction = ((Math.round(direction) % 8) + 8) % 8; frame = ((frame % 4) + 4) % 4;
    const key = `${kind}:${direction}:${frame}`;
    if (this.poses.has(key)) return this.poses.get(key);
    const source = this.stack(kind, frame), image = surface(source.width, source.height), ctx = image.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (const { z, rect } of source.layers) {
      ctx.save(); ctx.translate(source.anchorX, source.anchorY - z);
      ctx.scale(1, SPRITE_Y_SCALE); ctx.rotate(direction * Math.PI / 4);
      ctx.drawImage(this.sheet, rect.x, rect.y, rect.w, rect.h, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.restore();
    }
    const result = { image, anchorX: source.anchorX, anchorY: source.anchorY,
      width: source.width, height: source.height };
    this.poses.set(key, result); return result;
  }
  tile(size, variant) {
    const key = `${size}:${variant}`;
    if (this.tiles.has(key)) return this.tiles.get(key);
    const image = surface(size, size), ctx = image.getContext('2d');
    const colors = ['#1b2e37', '#1d3038', '#20323a', '#1a2c35'];
    pixel(ctx, 0, 0, size, size, '#10212b');
    pixel(ctx, 1, 1, size - 2, size - 2, colors[variant % 4]);
    pixel(ctx, 2, 1, size - 4, 1, '#31444a');
    pixel(ctx, 1, 2, 1, size - 5, '#273d45');
    pixel(ctx, 3, size - 3, size - 6, 1, '#162831');
    const seam = variant % 3 === 0 ? 17 : variant % 3 === 1 ? 22 : 0;
    if (seam) { pixel(ctx, seam, 3, 1, size - 7, '#182a32'); pixel(ctx, seam + 1, 4, 1, size - 9, '#263b43'); }
    const n = (variant * 7) % 23;
    pixel(ctx, 5 + n % 13, 5 + n % 17, 3, 1, '#31444a');
    pixel(ctx, 7 + n % 16, 14 + n % 10, 2, 1, '#263b43');
    if (variant % 5 === 0) { pixel(ctx, 1, size - 9, 5, 2, '#304440'); pixel(ctx, 3, size - 6, 3, 2, '#384b42'); }
    if (variant % 7 === 0) { pixel(ctx, 9, 6, 1, 5, '#12262e'); pixel(ctx, 10, 11, 3, 1, '#12262e'); pixel(ctx, 13, 12, 1, 4, '#12262e'); }
    this.tiles.set(key, image); return image;
  }
  wall(size, variant = 0, pillar = false) {
    const key = `${size}:${variant}:${pillar}`;
    if (this.walls.has(key)) return this.walls.get(key);
    const tall = pillar ? 51 : 30 + (variant % 3) * 3;
    const anchorX = 8, anchorY = tall + 5;
    const image = surface(size + 16, Math.ceil(size * SPRITE_Y_SCALE + tall + 13)), c = image.getContext('2d');
    const front = anchorY + size * SPRITE_Y_SCALE;
    if (pillar) {
      for (let z = 0; z <= tall; z++) {
        const base = z < 7 || z > tall - 7;
        const r = base ? size / 2 : size / 2 - 5;
        disc(c, anchorX + size / 2, anchorY + size * SPRITE_Y_SCALE / 2 - z, r, r * SPRITE_Y_SCALE,
          z === tall ? '#71807a' : z === tall - 6 ? '#8c927e' : z % 9 === 0 ? '#273f49' : base ? '#3c555b' : '#4b6668');
      }
      pixel(c, anchorX + size / 2 - 4, anchorY + 4 - tall, 3, 21, '#6d8b82');
      pixel(c, anchorX + size / 2 + 4, anchorY + 3 - tall, 2, 17, '#a9bf9c');
    } else {
      pixel(c, anchorX, anchorY - tall + size * SPRITE_Y_SCALE, size, tall, '#2b414c');
      pixel(c, anchorX + 2, anchorY - tall + size * SPRITE_Y_SCALE + 2, size - 4, tall - 3, '#354f59');
      for (let y = Math.floor(front - tall + 9); y < front - 2; y += 9) {
        pixel(c, anchorX, y, size, 1, '#1b313c');
        pixel(c, anchorX + (y % 2 ? 11 : 23), y - 7, 1, 7, '#223a45');
      }
      pixel(c, anchorX + size - 4, front - tall, 4, tall, '#223842');
      pixel(c, anchorX, anchorY - tall, size, size * SPRITE_Y_SCALE, '#526b6f');
      pixel(c, anchorX + 2, anchorY - tall + 2, size - 4, size * SPRITE_Y_SCALE - 4, '#425d64');
      pixel(c, anchorX + 2, anchorY - tall + 1, size - 4, 2, '#718580');
      pixel(c, anchorX + 2, anchorY - tall + size * SPRITE_Y_SCALE - 3, size - 4, 2, '#597879');
      pixel(c, anchorX + 5, anchorY - tall + 7, 8, 1, '#547074');
      pixel(c, anchorX + 21, anchorY - tall + 16, 5, 1, '#354f59');
      if (variant % 3 === 0) { pixel(c, anchorX + 2, anchorY - tall + 3, 5, 3, '#71856e'); pixel(c, anchorX + 3, anchorY - tall + 7, 3, 6, '#3d675e'); }
      pixel(c, anchorX, front - 3, size, 3, '#152c37');
    }
    const result = { image, anchorX, anchorY, height: tall, width: size };
    this.walls.set(key, result); return result;
  }
  glow(color, radius = 48) {
    const key = `${color}:${radius}`;
    if (this.glows.has(key)) return this.glows.get(key);
    const image = surface(radius * 2, radius * 2), ctx = image.getContext('2d');
    const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, radius * 2, radius * 2);
    this.glows.set(key, image); return image;
  }
}
let shared;
export function getSpriteAtlas() { return shared ||= new SpriteAtlas(); }
export function createRenderSurface(width, height) { return surface(width, height); }
