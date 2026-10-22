const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const MODES = Object.freeze({spot_difference:['/play/spot-difference/','localSpot'],hidden_object:['/play/hidden-object/','localHidden'],jigsaw:['/jigsaw/','localJigsaw']});

export function localPuzzlePlayPath(source) {
  const mode = MODES[source?.mode];
  if (!mode || !UUID.test(String(source?.draftId || ''))) return null;
  return `${mode[0]}?${mode[1]}=${encodeURIComponent(source.draftId)}`;
}

export function publicPuzzlePlayPath(result, mode) {
  if (result?.status !== 'published' || !MODES[mode] || !UUID.test(String(result.id || ''))) return null;
  return `${MODES[mode][0]}?postPuzzle=${encodeURIComponent(result.id)}`;
}

export function hasUncertainPuzzlePublication(draft) {
  if (!draft?.puzzle) return false;
  if (draft.puzzlePublicationAttempt?.status === 'uncertain') return true;
  // Older local candidates saved a request identity before network dispatch.
  return !draft.puzzlePublicationAttempt && UUID.test(String(draft.requestKey || '')) && /^[a-f0-9]{64}$/.test(String(draft.requestDigest || ''));
}

/** Public-only legacy upload APIs must never receive a self-play puzzle. */
export function assertPublicPuzzleIntent(post) {
  if (!post?.puzzle && post?.kind !== 'puzzle') return;
  if (!post.puzzle || !MODES[post.puzzle.mode] || post.visibility !== 'public') {
    throw new Error('自分だけで遊ぶパズルは端末内に保存してください。投稿する場合は公開を選んでください。');
  }
}

/** This path has no upload/Auth client. A local write must confirm before navigation. */
export async function savePuzzleForSelf({draft, save, source, signal} = {}) {
  if (!draft?.puzzle || !MODES[draft.puzzle.mode] || typeof save !== 'function') throw new Error('パズル作成ツールで作った下書きを選んでください。');
  if (source && (source.mode !== draft.puzzle.mode || !localPuzzlePlayPath(source))) throw new Error('パズルと端末内の試遊先が一致しません。元の作品を保持しています。');
  if (signal?.aborted) throw new Error('試しプレイを中止しました。作品は端末内に残っています。');
  const publicationUncertain = hasUncertainPuzzlePublication(draft);
  const record = await save({...draft, visibility:'private'});
  if (!record?.id || !/^draft:[a-f\d-]{36}$/i.test(record.id)) throw new Error(publicationUncertain
    ? '端末内への保存を確認できませんでした。この保存では公開送信していません。前の投稿結果は未確認です。'
    : '端末内への保存を確認できませんでした。この保存では公開送信していません。');
  // A cancelled local save may have committed. Never pretend it was undone.
  return {status:'local',record,publicationUncertain,playHref:signal?.aborted || publicationUncertain ? null : localPuzzlePlayPath(source)};
}
