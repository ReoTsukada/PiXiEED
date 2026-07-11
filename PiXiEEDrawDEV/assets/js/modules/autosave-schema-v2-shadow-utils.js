(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createAutosaveSchemaV2ShadowUtils({
    isEnabled = () => false,
    buildProjectState,
    writeProject,
    readProject,
    comparePayloads = () => null,
    shouldCompare = () => false,
    onStatus = () => {},
  } = {}) {
    const queues = new Map();

    function getQueue(projectId) {
      if (!queues.has(projectId)) queues.set(projectId, { running: false, pending: null, lastResult: null, lastError: null });
      return queues.get(projectId);
    }

    async function run(projectId) {
      const queue = getQueue(projectId);
      if (queue.running) return;
      queue.running = true;
      try {
        while (queue.pending) {
          const job = queue.pending;
          queue.pending = null;
          try {
            const projectState = buildProjectState(job);
            const write = await writeProject(projectState);
            const restored = await readProject(projectState.projectId);
            const diagnostics = shouldCompare()
              ? (job.v1Project
              ? comparePayloads(job.v1Project, restored.packaged, { projectId })
              : { comparable: false, reason: job.v1Error || 'v1-unavailable' })
              : { comparable: false, reason: 'read-shadow-disabled' };
            queue.lastResult = { projectId, revision: write.manifest?.revision || 0, diagnostics, at: Date.now() };
            queue.lastError = null;
            onStatus({ type: 'success', ...queue.lastResult });
          } catch (error) {
            queue.lastError = { message: error?.message || String(error), code: error?.code || '' };
            onStatus({ type: 'error', projectId, error: queue.lastError });
          }
        }
      } finally {
        queue.running = false;
      }
    }

    function enqueue(job = {}) {
      if (!isEnabled()) return { queued: false, reason: 'disabled' };
      const projectId = typeof job.projectId === 'string' ? job.projectId.trim() : '';
      if (!projectId) return { queued: false, reason: 'missing-project-id' };
      const queue = getQueue(projectId);
      queue.pending = { ...job, projectId };
      Promise.resolve().then(() => run(projectId));
      return { queued: true, projectId, merged: queue.running };
    }

    async function flush(projectId) {
      const queue = getQueue(projectId);
      await run(projectId);
      return { running: queue.running, pending: Boolean(queue.pending), lastResult: queue.lastResult, lastError: queue.lastError };
    }

    function getStatus(projectId = '') {
      const queue = projectId ? getQueue(projectId) : null;
      return {
        enabled: isEnabled() === true,
        projectId,
        running: Boolean(queue?.running),
        pending: Boolean(queue?.pending),
        lastResult: queue?.lastResult || null,
        lastError: queue?.lastError || null,
      };
    }

    return Object.freeze({ enqueue, flush, getStatus });
  }

  root.autosaveSchemaV2ShadowUtils = Object.freeze({ createAutosaveSchemaV2ShadowUtils });
})();
