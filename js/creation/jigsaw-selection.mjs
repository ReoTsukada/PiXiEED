/** Return exposed unit edges around a group's actual pixel masks. */
export function buildJigsawSelectionEdges(group, layout, pieceById) {
  if (!group || group.inTray || !Array.isArray(group.pieceIds) || !layout?.owner || !layout.width || !layout.height || !(pieceById instanceof Map)) return [];
  const memberIndexes = new Set(); const members = [];
  for (const pieceId of group.pieceIds) {
    const piece = pieceById.get(pieceId);
    if (!piece) continue;
    const index = piece.row * layout.columns + piece.column;
    memberIndexes.add(index); members.push(piece);
  }
  const edges = [];
  const isMember = (x, y) => x >= 0 && y >= 0 && x < layout.width && y < layout.height && memberIndexes.has(layout.owner[y * layout.width + x]);
  for (const piece of members) {
    const { x: left, y: top, width, height } = piece.bounds;
    for (let py = 0; py < height; py += 1) for (let px = 0; px < width; px += 1) {
      if (!piece.mask[py * width + px]) continue;
      const x = left + px; const y = top + py;
      if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) continue;
      if (!isMember(x, y - 1)) edges.push(x, y, x + 1, y);
      if (!isMember(x + 1, y)) edges.push(x + 1, y, x + 1, y + 1);
      if (!isMember(x, y + 1)) edges.push(x + 1, y + 1, x, y + 1);
      if (!isMember(x - 1, y)) edges.push(x, y + 1, x, y);
    }
  }
  return edges;
}
