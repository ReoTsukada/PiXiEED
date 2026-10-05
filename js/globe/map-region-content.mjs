/** Build content once per data change. Display pixels share their administrative region's count. */
export function buildMapRegionContent(index, { posts = [], events = [] } = {}, resolveLocation) {
  const mask = new Uint8Array(index.resolution ** 2);
  const regions = new Map(), points = new Map();
  const stats = { postPoints: 0, eventPoints: 0, droppedPostPoints: 0, droppedEventPoints: 0, occupiedCells: 0 };
  const group = (map, key) => {
    let value = map.get(key);
    if (!value) { value = { posts: false, future: 0, past: 0 }; map.set(key, value); }
    return value;
  };
  const regionTiles = index.mapRegionTiles || new Map([...index.prefectureTiles || []].map(([id, tiles]) => [`prefecture:${id}`, tiles]));
  function regionId(record) {
    const code = record?.countryId && record.countryId !== 'JPN' ? null : index.prefectureIds?.slice(1).includes(record?.prefectureId) ? record.prefectureId : null;
    if (code && regionTiles.has(`prefecture:${code}`)) return `prefecture:${code}`;
    return regionTiles.has(record?.mapRegionId) ? record.mapRegionId : null;
  }
  function target(point, explicit = null) {
    const known = regionId(explicit);
    if (known) return regionTiles.get(known)?.length ? group(regions, known) : null;
    if (explicit?.mapRegionId) return null;
    if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return null;
    const record = resolveLocation?.(point.longitude, point.latitude);
    if (!record) return null;
    const code = regionId(record);
    if (code) return regionTiles.get(code)?.length ? group(regions, code) : null;
    // A known small region without pixels must not paint a neighboring region.
    if (record.mapRegionId) return null;
    if (!Number.isInteger(record.row) || !Number.isInteger(record.column)) return null;
    return group(points, record.row * index.resolution + record.column);
  }
  for (const post of Array.isArray(posts) ? posts : []) {
    stats.postPoints++;
    const value = target(post?.position || post?.pin || post);
    if (value) value.posts = true; else stats.droppedPostPoints++;
  }
  for (const event of Array.isArray(events) ? events : []) {
    stats.eventPoints++;
    const period = event?.mapPeriod || event?.period || (['past', 'ended'].includes(event?.status) ? 'past' : 'upcoming');
    if (!['upcoming', 'active', 'past'].includes(period)) { stats.droppedEventPoints++; continue; }
    const value = target(event?.position || event?.location || event, event);
    if (!value) { stats.droppedEventPoints++; continue; }
    const key = period === 'past' ? 'past' : 'future';
    value[key] = Math.min(5, value[key] + 1);
  }
  const bin = count => !count ? 0 : count === 1 ? 1 : count <= 4 ? 2 : 3;
  const encode = value => Number(value.posts) | (bin(value.future) << 1) | (bin(value.past) << 4) | (bin(value.future + value.past) << 6);
  for (const [key, value] of points) mask[key] = encode(value);
  for (const [code, value] of regions) {
    const bits = encode(value);
    for (const key of regionTiles.get(code)) mask[key] = bits;
  }
  for (const bits of mask) if (bits) stats.occupiedCells++;
  return { mask, stats: Object.freeze(stats) };
}
