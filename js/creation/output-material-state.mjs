const REPLACEABLE = new Set(['rgba-frames', 'audio-buffer', 'video-source']);

/** Return a read-only snapshot; frame pixel buffers are referenced, never copied. */
export function describeOutputMaterialState({ record, mediaSources = [], outputItems = [], activeId = '', activeItemId = '', busy = false } = {}) {
  const assets = mediaSources.map((source) => {
    const frames = source.mediaSource?.frames || [];
    const referenced = outputItems.some((item) => item.sourceId === source.id);
    const supportedReplace = REPLACEABLE.has(source.kind);
    const first = frames[0];
    const removeReason = referenced
      ? '出力項目がこの素材を使用しています。先に出力項目を削除するか、別の素材へ割り当ててください。'
      : busy ? '処理が終わってから素材を削除してください。' : '';
    const replaceReason = !supportedReplace
      ? 'この素材形式はここから置き換えできません。'
      : busy ? '処理が終わってから素材を置き換えてください。' : '';
    return {
      id: source.id,
      name: source.label || first?.name || source.filename || '素材',
      kind: source.kind,
      ...(first ? { firstFrame: { name: first.name || '', width: first.width, height: first.height, data: first.data } } : {}),
      grouped: source.id === 'local-images' && frames.length > 0,
      canRemove: !referenced && !busy,
      removeReason,
      canReplace: supportedReplace && !busy,
      replaceReason,
    };
  });
  const selected = assets.find((asset) => asset.id === activeId) || null;
  const canAdd = Boolean(record && !busy);
  const addReason = !record ? '素材を追加するには詳細ワークスペースを開いてください。'
    : busy ? '処理が終わってから素材を追加してください。' : '';
  return {
    loaded: Boolean(record && assets.length),
    busy: Boolean(busy),
    grouped: true,
    kind: assets.length === 0 ? null : assets.length === 1 ? assets[0].kind : 'mixed',
    activeId: activeId || '',
    activeItemId: activeItemId || '',
    selectedAsset: selected,
    canAdd,
    addReason,
    canReplace: Boolean(selected?.canReplace),
    replaceReason: selected?.replaceReason || '置き換える素材を選んでください。',
    assets,
    frameCount: mediaSources.reduce((count, source) => count + (source.mediaSource?.frames?.length || 0), 0),
    outputCount: outputItems.length,
  };
}
