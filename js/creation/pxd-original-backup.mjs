/** Prefer the imported file over a snapshot taken before shared editing. */
export function findPxdOriginalBackup(project, { copyBytes = false } = {}) {
  for (const path of ['legacy/original.pxd', 'legacy/import-source.pxd', 'legacy/creation-original.pxd']) {
    const entry = project?.entries?.find(entry => entry.path === path);
    if (entry?.bytes instanceof Uint8Array && entry.bytes.length) {
      const imported = path !== 'legacy/creation-original.pxd';
      return { path, bytes: copyBytes ? entry.bytes.slice() : entry.bytes, label: imported ? '読み込んだPXD原本を保存' : '統合前のPXDを保存',
        filename: imported ? 'pixieed-original.pxd' : 'pixieed-before-integration.pxd' };
    }
  }
  return null;
}
