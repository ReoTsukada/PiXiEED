import { hashCanonical, validateAsset } from './asset-contract.mjs';
import { validateDrawDocument } from './draw-core.mjs';
import { validateAudioSong } from './audio-core.mjs';

export const WALK_GAME_SCHEMA_VERSION = 1;
export const WALK_TEMPLATE_ID = 'walk-collect-v1';
export const WALK_TEMPLATE_VERSION = 1;
export const WALK_BOARD = Object.freeze({ columns: 10, rows: 8, tilePixels: 32 });
export const WALK_TEMPLATE_BLUEPRINT = Object.freeze({
  start: Object.freeze({ x: 1, y: 1 }),
  goal: Object.freeze({ x: 8, y: 6 }),
  walls: Object.freeze([Object.freeze({ x: 3, y: 1 }), Object.freeze({ x: 3, y: 2 }), Object.freeze({ x: 3, y: 3 }), Object.freeze({ x: 6, y: 4 }), Object.freeze({ x: 7, y: 4 }), Object.freeze({ x: 4, y: 6 })]),
  collectibles: Object.freeze([Object.freeze({ id: 'star-1', x: 5, y: 1 }), Object.freeze({ id: 'star-2', x: 8, y: 2 }), Object.freeze({ id: 'star-3', x: 1, y: 6 })])
});
const LOCAL_OWNER = 'local-owner';
const DIRECTIONS = Object.freeze({ up: Object.freeze({ x: 0, y: -1 }), down: Object.freeze({ x: 0, y: 1 }), left: Object.freeze({ x: -1, y: 0 }), right: Object.freeze({ x: 1, y: 0 }) });
const KEY_DIRECTIONS = Object.freeze({ ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' });

function fixedReference(draftId, revision) {
  return { draftId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme };
}

async function resolveLocalRevision(adapter, draftId, revisionId, expectedKind) {
  if (!adapter || typeof adapter.get !== 'function' || typeof draftId !== 'string' || !draftId || typeof revisionId !== 'string' || !revisionId) throw new TypeError('素材の固定版を特定できません');
  const record = await adapter.get(draftId);
  if (!record || record.schemaVersion !== 1 || record.draftId !== draftId || typeof record.assetId !== 'string' || !Array.isArray(record.revisions)) throw new Error('端末に保存した素材が見つかりません');
  const revision = record.revisions.find((item) => item?.revisionId === revisionId);
  if (!revision || revision.schemaVersion !== 1 || revision.hashScheme !== 'sha256-canonical-v1' || !/^[a-f0-9]{64}$/.test(revision.documentHash || '') || !revision.document) throw new Error('指定した素材版がありません。別の版へ自動変更しません');
  const asset = validateAsset(revision.asset);
  if (asset.assetId !== record.assetId || asset.revisionId !== revision.revisionId || asset.contentHash !== revision.documentHash || asset.hashScheme !== revision.hashScheme || asset.kind !== expectedKind || asset.visibility !== 'draft' || asset.owner.type !== 'local' || asset.owner.id !== LOCAL_OWNER || asset.reusePermission !== 'owner_only') throw new Error('自分の端末に保存した素材だけを使えます');
  if (expectedKind === 'pixel_art') validateDrawDocument(revision.document);
  else if (expectedKind === 'song') {
    validateAudioSong(revision.document);
    const noteCount = revision.document.tracks.reduce((total, track) => total + track.clips.reduce((clipTotal, clip) => clipTotal + clip.notes.length, 0), 0);
    if (noteCount > 512) throw new RangeError('ゲーム内で使う曲は512音符までです');
  }
  else throw new TypeError('未対応の素材形式です');
  if (await hashCanonical(revision.document) !== revision.documentHash) throw new Error('素材版のhashと保存内容が一致しません');
  return revision;
}

export async function resolveLocalGameArt(adapter, draftId, revisionId) { return resolveLocalRevision(adapter, draftId, revisionId, 'pixel_art'); }
export async function resolveLocalGameSong(adapter, draftId, revisionId) { return resolveLocalRevision(adapter, draftId, revisionId, 'song'); }

export async function createWalkCollectGame({ adapter, gameId, characterDraftId, characterRevisionId, backgroundDraftId, backgroundRevisionId, musicDraftId, musicRevisionId }) {
  if (typeof gameId !== 'string' || !gameId.trim()) throw new TypeError('ゲームIDが必要です');
  const [character, background, music] = await Promise.all([
    resolveLocalGameArt(adapter, characterDraftId, characterRevisionId),
    resolveLocalGameArt(adapter, backgroundDraftId, backgroundRevisionId),
    resolveLocalGameSong(adapter, musicDraftId, musicRevisionId)
  ]);
  const refs = {
    character: fixedReference(characterDraftId, character),
    background: fixedReference(backgroundDraftId, background),
    music: fixedReference(musicDraftId, music)
  };
  return validateWalkGame({
    schemaVersion: WALK_GAME_SCHEMA_VERSION, gameId, templateId: WALK_TEMPLATE_ID, templateVersion: WALK_TEMPLATE_VERSION,
    board: { ...WALK_BOARD }, assets: refs,
    walls: WALK_TEMPLATE_BLUEPRINT.walls.map((cell) => ({ ...cell })),
    collectibles: WALK_TEMPLATE_BLUEPRINT.collectibles.map((item) => ({ ...item })),
    player: { ...WALK_TEMPLATE_BLUEPRINT.start }, goal: { ...WALK_TEMPLATE_BLUEPRINT.goal },
    collectedIds: [], moveCount: 0, phase: 'paused'
  });
}

function validPosition(point, board) { return point && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0 && point.x < board.columns && point.y < board.rows; }
function positionKey(point) { return `${point.x},${point.y}`; }

export function validateWalkGame(game) {
  if (!game || game.schemaVersion !== WALK_GAME_SCHEMA_VERSION || typeof game.gameId !== 'string' || !game.gameId || game.templateId !== WALK_TEMPLATE_ID || game.templateVersion !== WALK_TEMPLATE_VERSION) throw new TypeError('ゲームまたはテンプレートの版が不正です');
  const allowed = new Set(['schemaVersion', 'gameId', 'templateId', 'templateVersion', 'board', 'assets', 'walls', 'collectibles', 'player', 'goal', 'collectedIds', 'moveCount', 'phase']);
  if (Object.keys(game).some((key) => !allowed.has(key))) throw new TypeError('このゲーム形式では追加コードや未知の設定を受け付けません');
  if (!game.board || game.board.columns !== WALK_BOARD.columns || game.board.rows !== WALK_BOARD.rows || game.board.tilePixels !== WALK_BOARD.tilePixels) throw new TypeError('盤面サイズはこのテンプレートで固定です');
  if (!game.assets || !['character', 'background', 'music'].every((slot) => {
    const ref = game.assets[slot];
    return ref && typeof ref.draftId === 'string' && ref.draftId && typeof ref.assetId === 'string' && ref.assetId && typeof ref.revisionId === 'string' && ref.revisionId && ref.hashScheme === 'sha256-canonical-v1' && /^[a-f0-9]{64}$/.test(ref.contentHash || '');
  })) throw new TypeError('キャラクター・背景・音の固定版参照が壊れています');
  if (!Array.isArray(game.walls) || game.walls.length > 128 || game.walls.some((cell) => !validPosition(cell, game.board)) || new Set(game.walls.map(positionKey)).size !== game.walls.length) throw new TypeError('障害物の配置が壊れています');
  if (!Array.isArray(game.collectibles) || !game.collectibles.length || game.collectibles.length > 64 || game.collectibles.some((item) => !item || typeof item.id !== 'string' || !item.id || !validPosition(item, game.board)) || new Set(game.collectibles.map((item) => item.id)).size !== game.collectibles.length || new Set(game.collectibles.map(positionKey)).size !== game.collectibles.length) throw new TypeError('集める物の配置が壊れています');
  if (!validPosition(game.player, game.board) || !validPosition(game.goal, game.board) || new Set(game.walls.map(positionKey)).has(positionKey(game.player)) || new Set(game.walls.map(positionKey)).has(positionKey(game.goal))) throw new TypeError('プレイヤーまたはゴールの位置が壊れています');
  if (game.collectibles.some((item) => new Set(game.walls.map(positionKey)).has(positionKey(item)) || positionKey(item) === positionKey(game.goal))) throw new TypeError('集める物・壁・ゴールが重なっています');
  if (!Array.isArray(game.collectedIds) || new Set(game.collectedIds).size !== game.collectedIds.length || game.collectedIds.some((id) => !game.collectibles.some((item) => item.id === id)) || !Number.isInteger(game.moveCount) || game.moveCount < 0 || !['playing', 'paused', 'won'].includes(game.phase)) throw new TypeError('ゲーム進行状態が壊れています');
  const atGoal = positionKey(game.player) === positionKey(game.goal); const allCollected = game.collectedIds.length === game.collectibles.length;
  if (game.phase === 'won' && (!atGoal || !allCollected)) throw new Error('ゴールと収集がそろっていないのに完成扱いです');
  return game;
}

export function moveWalkGame(game, direction) {
  validateWalkGame(game);
  if (game.phase !== 'playing') return { game, moved: false, collected: null, won: game.phase === 'won', reason: 'paused' };
  const delta = typeof direction === 'string' ? DIRECTIONS[direction] : direction;
  if (!delta || !Number.isInteger(delta.x) || !Number.isInteger(delta.y) || Math.abs(delta.x) + Math.abs(delta.y) !== 1) throw new TypeError('上下左右へ1マスずつ進みます');
  const next = { x: game.player.x + delta.x, y: game.player.y + delta.y };
  if (!validPosition(next, game.board)) return { game, moved: false, collected: null, won: false, reason: 'edge' };
  if (game.walls.some((wall) => wall.x === next.x && wall.y === next.y)) return { game, moved: false, collected: null, won: false, reason: 'wall' };
  const item = game.collectibles.find((candidate) => candidate.x === next.x && candidate.y === next.y && !game.collectedIds.includes(candidate.id));
  const collectedIds = item ? [...game.collectedIds, item.id] : game.collectedIds;
  const won = next.x === game.goal.x && next.y === game.goal.y && collectedIds.length === game.collectibles.length;
  const movedGame = validateWalkGame({ ...game, player: next, collectedIds, moveCount: game.moveCount + 1, phase: won ? 'won' : 'playing' });
  return { game: movedGame, moved: true, collected: item?.id ?? null, won, reason: item ? 'collect' : won ? 'won' : 'move' };
}

export function directionForGameKey(key) { return KEY_DIRECTIONS[key] || null; }

export function setWalkGamePaused(game, paused = true) {
  validateWalkGame(game);
  if (game.phase === 'won') return game;
  return validateWalkGame({ ...game, phase: paused ? 'paused' : 'playing' });
}

export function restoreWalkGame(game) {
  validateWalkGame(game);
  return game.phase === 'won' ? game : validateWalkGame({ ...game, phase: 'paused' });
}

export async function resolveWalkGameAssets(adapter, game) {
  validateWalkGame(game);
  const [character, background, music] = await Promise.all([
    resolveLocalGameArt(adapter, game.assets.character.draftId, game.assets.character.revisionId),
    resolveLocalGameArt(adapter, game.assets.background.draftId, game.assets.background.revisionId),
    resolveLocalGameSong(adapter, game.assets.music.draftId, game.assets.music.revisionId)
  ]);
  const revisions = { character, background, music };
  for (const slot of ['character', 'background', 'music']) if (JSON.stringify(fixedReference(game.assets[slot].draftId, revisions[slot])) !== JSON.stringify(game.assets[slot])) throw new Error(`${slot === 'music' ? '音' : slot === 'character' ? 'キャラクター' : '背景'}の固定版が一致しません`);
  return { character, background, music };
}

export function drawRevisionReference(game, slot) {
  validateWalkGame(game);
  if (!['character', 'background', 'music'].includes(slot)) throw new RangeError('不明な素材スロットです');
  return { ...game.assets[slot] };
}
