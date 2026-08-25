export const WP080_INITIAL_SOURCE_BYTES = 62052;
export const LONG_TASK_THRESHOLD_MS = 50;
export const ROUTE_CHUNK_PATTERN = /routes\/(draw2|audio|game|market)-route\.js(?:\?|$)/;

export function summarizeShellPerformance({ sourceBytes = 0, gzipBytes = 0, brotliBytes = 0, resources = [], longTasks = [], parseMs = null, executeMs = null } = {}) {
  const resourceNames = resources.map((resource) => String(resource.name || resource));
  const routeChunks = resourceNames.filter((name) => ROUTE_CHUNK_PATTERN.test(name));
  return {
    sourceBytes: Number(sourceBytes) || 0,
    gzipBytes: Number(gzipBytes) || 0,
    brotliBytes: Number(brotliBytes) || 0,
    routeChunkRequests: routeChunks,
    routeChunkRequestCount: routeChunks.length,
    parseMs: parseMs == null ? null : Number(parseMs),
    executeMs: executeMs == null ? null : Number(executeMs),
    longTaskCount: longTasks.filter((entry) => Number(entry.duration) >= LONG_TASK_THRESHOLD_MS).length,
    longTaskDurations: longTasks.map((entry) => Number(entry.duration)).filter(Number.isFinite),
    sourceBaselineDelta: (Number(sourceBytes) || 0) - WP080_INITIAL_SOURCE_BYTES,
  };
}
