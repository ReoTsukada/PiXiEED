export const UPLOAD_GAME_SCHEMA_VERSION = 1;
export const UPLOAD_GAME_TEMPLATE_ID = 'walk-collect-v1';
export const UPLOAD_GAME_TEMPLATE_VERSION = 1;
export const UPLOAD_GAME_BOARD = Object.freeze({ columns: 10, rows: 8, tilePixels: 32 });
export const MAX_UPLOAD_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_AUDIO_BYTES = 3 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_PIXELS = 1024 * 1024;
const IMAGE_MIMES = new Set(['image/png', 'image/webp']);
const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/flac']);
const DELTAS = Object.freeze({ up: Object.freeze({ x: 0, y: -1 }), down: Object.freeze({ x: 0, y: 1 }), left: Object.freeze({ x: -1, y: 0 }), right: Object.freeze({ x: 1, y: 0 }) });
const KEY_DIRECTIONS = Object.freeze({ ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' });
export const UPLOAD_GAME_BLUEPRINT = Object.freeze({
  start: Object.freeze({ x: 1, y: 1 }), goal: Object.freeze({ x: 8, y: 6 }),
  walls: Object.freeze([Object.freeze({ x: 3, y: 1 }), Object.freeze({ x: 3, y: 2 }), Object.freeze({ x: 3, y: 3 }), Object.freeze({ x: 6, y: 4 }), Object.freeze({ x: 7, y: 4 }), Object.freeze({ x: 4, y: 6 })]),
  collectibles: Object.freeze([Object.freeze({ id: 'star-1', x: 5, y: 1 }), Object.freeze({ id: 'star-2', x: 8, y: 2 }), Object.freeze({ id: 'star-3', x: 1, y: 6 })])
});

function expectedBytesFromDataUrl(dataUrl) {
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || match[1].length % 4 !== 0) throw new TypeError('端末ファイルの保存データが不正です');
  const padding = match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0;
  return match[1].length / 4 * 3 - padding;
}

function validateMediaAsset(asset, kind, { checkData = true } = {}) {
  if (asset === null && kind === 'audio') return null;
  const allowedMimes = kind === 'image' ? IMAGE_MIMES : AUDIO_MIMES;
  const maxBytes = kind === 'image' ? MAX_UPLOAD_IMAGE_BYTES : MAX_UPLOAD_AUDIO_BYTES;
  if (!asset || typeof asset !== 'object' || typeof asset.fileName !== 'string' || !asset.fileName.trim() || asset.fileName.length > 120 || /[\\/\u0000-\u001f]/.test(asset.fileName)) throw new TypeError('選んだファイルの名前が不正です');
  if (!allowedMimes.has(asset.mimeType) || !Number.isInteger(asset.sizeBytes) || asset.sizeBytes < 1 || asset.sizeBytes > maxBytes) throw new RangeError(kind === 'image' ? 'PNG/WebP画像は1ファイル2MBまでです' : '対応音声ファイルは1ファイル3MBまでです');
  if (kind === 'image' && (!Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.height < 1 || asset.width > 4096 || asset.height > 4096 || asset.width * asset.height > MAX_UPLOAD_IMAGE_PIXELS)) throw new RangeError('画像は縦横4096px以下、合計1024×1024画素までです');
  if (checkData && (expectedBytesFromDataUrl(asset.dataUrl) !== asset.sizeBytes || !asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`))) throw new TypeError('選んだファイルの種類または内容が一致しません');
  return asset;
}

export function createUploadedWalkCollectGame({ gameId, character, background, music = null }) {
  if (typeof gameId !== 'string' || !gameId.trim()) throw new TypeError('ゲームIDが必要です');
  validateMediaAsset(character, 'image'); validateMediaAsset(background, 'image'); validateMediaAsset(music, 'audio');
  return validateUploadedWalkGame({
    schemaVersion: UPLOAD_GAME_SCHEMA_VERSION, gameId, templateId: UPLOAD_GAME_TEMPLATE_ID, templateVersion: UPLOAD_GAME_TEMPLATE_VERSION,
    board: { ...UPLOAD_GAME_BOARD }, assets: { character: structuredClone(character), background: structuredClone(background), music: music ? structuredClone(music) : null },
    walls: UPLOAD_GAME_BLUEPRINT.walls.map((cell) => ({ ...cell })), collectibles: UPLOAD_GAME_BLUEPRINT.collectibles.map((item) => ({ ...item })),
    player: { ...UPLOAD_GAME_BLUEPRINT.start }, goal: { ...UPLOAD_GAME_BLUEPRINT.goal }, collectedIds: [], moveCount: 0, phase: 'paused'
  });
}

function validPosition(point) { return point && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0 && point.x < UPLOAD_GAME_BOARD.columns && point.y < UPLOAD_GAME_BOARD.rows; }
function positionKey(point) { return `${point.x},${point.y}`; }

export function validateUploadedWalkGame(game, { verifyFiles = true } = {}) {
  if (!game || game.schemaVersion !== UPLOAD_GAME_SCHEMA_VERSION || typeof game.gameId !== 'string' || !game.gameId || game.templateId !== UPLOAD_GAME_TEMPLATE_ID || game.templateVersion !== UPLOAD_GAME_TEMPLATE_VERSION) throw new TypeError('ゲームまたはテンプレートの版が不正です');
  const allowed = new Set(['schemaVersion', 'gameId', 'templateId', 'templateVersion', 'board', 'assets', 'walls', 'collectibles', 'player', 'goal', 'collectedIds', 'moveCount', 'phase']);
  if (Object.keys(game).some((key) => !allowed.has(key))) throw new TypeError('任意コードや未知の設定は受け付けません');
  if (JSON.stringify(game.board) !== JSON.stringify(UPLOAD_GAME_BOARD)) throw new TypeError('盤面サイズは固定です');
  if (!game.assets || Object.keys(game.assets).some((key) => !['character', 'background', 'music'].includes(key)) || !Object.hasOwn(game.assets, 'character') || !Object.hasOwn(game.assets, 'background') || !Object.hasOwn(game.assets, 'music')) throw new TypeError('キャラクター・背景・音の選択が壊れています');
  if (verifyFiles) { validateMediaAsset(game.assets.character, 'image'); validateMediaAsset(game.assets.background, 'image'); validateMediaAsset(game.assets.music, 'audio'); }
  if (!Array.isArray(game.walls) || JSON.stringify(game.walls) !== JSON.stringify(UPLOAD_GAME_BLUEPRINT.walls)) throw new TypeError('固定盤面の障害物を変更できません');
  if (!Array.isArray(game.collectibles) || JSON.stringify(game.collectibles) !== JSON.stringify(UPLOAD_GAME_BLUEPRINT.collectibles)) throw new TypeError('固定盤面の収集物を変更できません');
  if (!validPosition(game.player) || !validPosition(game.goal) || positionKey(game.goal) !== positionKey(UPLOAD_GAME_BLUEPRINT.goal)) throw new TypeError('プレイヤーまたはゴールの位置が壊れています');
  if (!Array.isArray(game.collectedIds) || new Set(game.collectedIds).size !== game.collectedIds.length || game.collectedIds.some((id) => !game.collectibles.some((item) => item.id === id)) || !Number.isInteger(game.moveCount) || game.moveCount < 0 || !['playing', 'paused', 'won'].includes(game.phase)) throw new TypeError('ゲーム進行状態が壊れています');
  const atGoal = positionKey(game.player) === positionKey(game.goal); const allCollected = game.collectedIds.length === game.collectibles.length;
  if (game.phase === 'won' && (!atGoal || !allCollected)) throw new Error('星を全部集める前にゴールできません');
  if (game.walls.some((wall) => positionKey(wall) === positionKey(game.player))) throw new Error('プレイヤーが障害物の中にいます');
  if (game.collectibles.some((item) => game.walls.some((wall) => positionKey(wall) === positionKey(item)) || positionKey(item) === positionKey(game.goal))) throw new TypeError('固定盤面の内容が重なっています');
  return game;
}

export function moveUploadedWalkGame(game, direction) {
  validateUploadedWalkGame(game, { verifyFiles: false });
  if (game.phase !== 'playing') return { game, moved: false, collected: null, won: game.phase === 'won', reason: 'paused' };
  const delta = typeof direction === 'string' ? DELTAS[direction] : direction;
  if (!delta || !Number.isInteger(delta.x) || !Number.isInteger(delta.y) || Math.abs(delta.x) + Math.abs(delta.y) !== 1) throw new TypeError('上下左右へ1マスずつ進みます');
  const next = { x: game.player.x + delta.x, y: game.player.y + delta.y };
  if (!validPosition(next)) return { game, moved: false, collected: null, won: false, reason: 'edge' };
  if (game.walls.some((wall) => positionKey(wall) === positionKey(next))) return { game, moved: false, collected: null, won: false, reason: 'wall' };
  const item = game.collectibles.find((candidate) => positionKey(candidate) === positionKey(next) && !game.collectedIds.includes(candidate.id));
  const collectedIds = item ? [...game.collectedIds, item.id] : game.collectedIds;
  const won = positionKey(next) === positionKey(game.goal) && collectedIds.length === game.collectibles.length;
  const movedGame = validateUploadedWalkGame({ ...game, player: next, collectedIds, moveCount: game.moveCount + 1, phase: won ? 'won' : 'playing' }, { verifyFiles: false });
  return { game: movedGame, moved: true, collected: item?.id ?? null, won, reason: item ? 'collect' : won ? 'won' : 'move' };
}

export function directionForUploadGameKey(key) { return KEY_DIRECTIONS[key] || null; }
export function setUploadedWalkGamePaused(game, paused = true) { validateUploadedWalkGame(game, { verifyFiles: false }); return game.phase === 'won' ? game : { ...game, phase: paused ? 'paused' : 'playing' }; }
export function restoreUploadedWalkGame(game) { validateUploadedWalkGame(game); return game.phase === 'won' ? game : { ...game, phase: 'paused' }; }
