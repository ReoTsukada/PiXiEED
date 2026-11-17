/** An explicitly started, short-lived MCP link to this open Draw document. */
export function createDrawLiveSession({
  draw, endpoint, isActive = () => true, onChange = () => {},
  fetchImpl = (...args) => fetch(...args), now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay), cancel = handle => clearTimeout(handle),
} = {}) {
  const base = new URL(endpoint); base.pathname = base.pathname.replace(/\/mcp(?:\/store)?\/?$/, ''); base.search = ''; base.hash = '';
  let generation = 0, session = null, timer = null, expiryTimer = null, controller = null;
  let usageRequest = null, usageReceivedAt = null, usageController = null, usageTimer = null;
  let view = { phase: 'idle', mode: 'legacy', pairingCode: '', expiresAt: null, sessionDurationMs: null,
    message: '', usage: null, usageStatus: 'idle', usageMessage: '利用状況をまだ取得していません。' };
  let pendingAck = null;
  const completed = new Map();
  const publish = update => { view = { ...view, ...update }; onChange({ ...view, usage: view.usage ? { ...view.usage } : null }); };
  const sameBinding = (a, b) => !!a && !!b && a.projectId === b.projectId && a.openEpoch === b.openEpoch;
  const expires = value => typeof value === 'number' ? value : Date.parse(value);
  const endpointUrl = path => `${base.href.replace(/\/$/, '')}${path}`;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const validUsage = value => value && Number.isFinite(value.dailyLimit) && value.dailyLimit >= 0 &&
    Number.isFinite(value.dailyUsed) && value.dailyUsed >= 0 && Number.isFinite(value.dailyRemaining) && value.dailyRemaining >= 0 &&
    Number.isFinite(value.resetsAt) && Number.isFinite(value.serverNow) && Number.isFinite(value.sessionDurationMs) && value.sessionDurationMs > 0;
  async function refreshUsage({ force = false } = {}) {
    if (usageRequest?.generation === generation) return usageRequest.promise;
    // force bypasses a fresh cached snapshot; concurrent reads still share one request.
    if (!force && usageReceivedAt !== null && now() - usageReceivedAt < 30_000 && view.usage) return view.usage;
    const ticket = generation;
    publish({ usageStatus: 'loading', usageMessage: '利用状況を確認しています。' });
    const pending = { generation: ticket, promise: null };
    const abortController = new AbortController();
    usageRequest = pending;
    usageController = abortController;
    usageTimer = schedule(() => {
      if (usageRequest !== pending) return;
      usageController = null; usageRequest = null; usageTimer = null;
      abortController.abort();
      publish({ usage: null, usageStatus: 'error', usageMessage: '利用状況を取得できませんでした。' });
    }, 10_000);
    pending.promise = (async () => {
      try {
        const result = await request('/draw-usage', { signal: abortController.signal });
        if (ticket !== generation || usageRequest !== pending) return null;
        if (!validUsage(result)) throw new Error('Invalid Draw usage response');
        const receivedAt = now();
        const snapshot = { dailyLimit: result.dailyLimit, dailyUsed: result.dailyUsed,
          dailyRemaining: result.dailyRemaining, resetsAt: result.resetsAt, serverNow: result.serverNow,
          sessionDurationMs: result.sessionDurationMs, receivedAt, clockOffsetMs: result.serverNow - receivedAt };
        usageReceivedAt = receivedAt;
        publish({ usage: snapshot, usageStatus: 'ready', usageMessage: '', sessionDurationMs: snapshot.sessionDurationMs });
        return snapshot;
      } catch {
        if (ticket === generation && usageRequest === pending) publish({ usage: null, usageStatus: 'error', usageMessage: '利用状況を取得できませんでした。' });
        return null;
      } finally {
        if (usageTimer != null && usageRequest === pending) cancel(usageTimer);
        if (usageRequest === pending) { usageRequest = null; usageController = null; usageTimer = null; }
      }
    })();
    return pending.promise;
  }
  const current = (ticket, bound = session) => ticket === generation && bound === session && !!session && now() < expires(session.expiresAt);
  const authorized = ticket => current(ticket) && isActive() && sameBinding(draw.getAgentState({ includePixels: false }).projectBinding, session.projectBinding);
  async function request(path, { method = 'GET', body, token, signal, keepalive = false } = {}) {
    const response = await fetchImpl(endpointUrl(path), {
      method, signal, keepalive, credentials: 'omit', cache: 'no-store',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      let details = null;
      try { details = await response.json(); } catch { /* Keep the generic service error. */ }
      if (response.status === 429 && details?.code === 'DRAW_ADMISSION_LIMIT') {
        const seconds = Number.isInteger(details.retryAfterSeconds) && details.retryAfterSeconds > 0 ? details.retryAfterSeconds : null;
        const wait = seconds ? `約${seconds}秒後に` : '時間をおいて';
        const failure = error('DRAW_ADMISSION_LIMIT', `接続回数の上限です。${wait}お試しください。`);
        failure.httpStatus = 429;
        if (seconds) failure.retryAfterSeconds = seconds;
        throw failure;
      }
      const failure = error(`HTTP_${response.status}`, response.status === 404 ? '接続サービスが直接編集に対応していません。' : '接続を確認できません。もう一度接続してください。');
      failure.httpStatus = response.status; throw failure;
    }
    return response.json();
  }
  function revoke(bound) {
    if (!bound) return Promise.resolve();
    return request(`/draw-sessions/${encodeURIComponent(bound.sessionId)}`, { method: 'DELETE', token: bound.browserToken, keepalive: true }).catch(() => {});
  }
  function stop(message = '接続を終了しました。') {
    const old = session; generation += 1; session = null; pendingAck = null; completed.clear();
    usageController?.abort(); usageController = null;
    if (usageTimer != null) cancel(usageTimer); usageTimer = null;
    usageRequest = null;
    if (timer != null) cancel(timer); if (expiryTimer != null) cancel(expiryTimer); timer = null; expiryTimer = null; controller?.abort(); controller = null;
    publish({ phase: 'idle', mode: 'legacy', pairingCode: '', expiresAt: null, message,
      usageStatus: view.usage ? 'ready' : 'idle', usageMessage: view.usage ? '' : '利用状況をまだ取得していません。' });
    return revoke(old);
  }
  function fail(message) { void stop(message); publish({ phase: 'error', message }); }
  async function acknowledge(ticket) {
    if (!pendingAck || !current(ticket)) return;
    const { command, body } = pendingAck;
    await request(`/draw-sessions/${encodeURIComponent(session.sessionId)}/commands/${encodeURIComponent(command.commandId)}/result`, {
      method: 'POST', token: session.browserToken, body, signal: controller.signal,
    });
    if (current(ticket)) pendingAck = null;
  }
  async function execute(command, ticket) {
    if (!current(ticket)) return;
    const digest = JSON.stringify(command);
    const commandAuthorized = () => Number.isFinite(command.deadlineAt) && now() < command.deadlineAt && authorized(ticket);
    const cached = completed.get(command.requestId);
    if (cached) {
      if (cached.digest !== digest) throw error('REQUEST_ID_CONFLICT', '重複した操作を拒否しました。');
      pendingAck = { command, body: cached.body }; return;
    }
    if (completed.size >= 512) throw error('SESSION_LIMIT', '接続の操作数の上限です。接続し直してください。');
    let body, operationCompleted = false;
    const before = draw.getAgentState({ includePixels: false });
    try {
      if (!commandAuthorized() || !sameBinding(command.projectBinding, session.projectBinding)) throw error('SESSION_CHANGED', '作品または接続が変更されています。');
      let result;
      if (command.kind === 'state.get') result = draw.getAgentState(command.stateRequest || {});
      else if (command.kind === 'operation') result = await draw.executeAgentOperation({
        expectedRevision: command.expectedRevision, projectBinding: command.projectBinding,
        operation: command.operation,
        ...(command.responseMode !== undefined ? { responseMode: command.responseMode } : {}),
      }, { isAuthorized: commandAuthorized });
      else throw error('UNSUPPORTED_COMMAND', '未対応の操作です。');
      operationCompleted = true;
      const after = draw.getAgentState({ includePixels: false });
      body = { commandId: command.commandId, requestId: command.requestId, status: 'applied', projectBinding: command.projectBinding, revision: after.revision, result };
    } catch (cause) {
      let revision = before.revision;
      try { revision = draw.getAgentState({ includePixels: false })?.revision ?? revision; } catch { /* Applied result remains unknown when its snapshot cannot be read. */ }
      body = { commandId: command.commandId, requestId: command.requestId,
        status: operationCompleted || cause?.status === 'unknown' || cause?.applied ? 'unknown' : 'not_applied',
        projectBinding: command.projectBinding, revision,
        error: { code: String(cause?.code || 'DRAW_OPERATION_FAILED').slice(0,80), message: String(cause?.message || '操作を完了できませんでした。').slice(0,500) } };
    }
    if (!current(ticket)) return;
    completed.set(command.requestId, { digest, body }); pendingAck = { command, body };
  }
  async function poll(ticket) {
    if (!current(ticket)) { if (ticket === generation && session) void stop('接続の有効期限が切れました。'); return; }
    if (!isActive()) { void stop('描画モードを離れたため接続を終了しました。'); return; }
    if (!sameBinding(draw.getAgentState({ includePixels: false }).projectBinding, session.projectBinding)) { void stop('作品が切り替わったため接続を終了しました。'); return; }
    try {
      if (pendingAck) await acknowledge(ticket);
      if (!current(ticket)) return;
      const response = await request(`/draw-sessions/${encodeURIComponent(session.sessionId)}/commands`, { token: session.browserToken, signal: controller.signal });
      if (!current(ticket)) return;
      if (response.connected) publish({ phase: 'connected', pairingCode: '', message: 'この作品を操作できます。' });
      else if (view.phase === 'connected') { void stop('ChatGPTとの接続を終了しました。'); return; }
      for (const command of response.commands || []) {
        if (!current(ticket)) break;
        await execute(command, ticket); await acknowledge(ticket);
      }
    } catch (cause) {
      if (!current(ticket)) return;
      if (cause?.httpStatus && cause.httpStatus < 500 || cause?.code === 'SESSION_LIMIT' || cause?.code === 'REQUEST_ID_CONFLICT') { fail(cause.message); return; }
      publish({ message: pendingAck ? '操作の結果を再送しています。操作自体は繰り返しません。' : '接続を確認しています。' });
    }
    if (current(ticket)) timer = schedule(() => { void poll(ticket); }, 500);
  }
  async function start({ mode = 'legacy' } = {}) {
    if (!['legacy', 'oauth'].includes(mode)) throw new TypeError('Draw connection mode must be legacy or oauth');
    void stop(''); const ticket = generation;
    publish({ phase: 'starting', mode, message: '接続を準備しています。' });
    try {
      await draw.workspace?.ready;
      if (ticket !== generation) return;
      let state = draw.getAgentState({ includePixels: false });
      if (!isActive() || state.busy) throw error('DRAW_BUSY', '描画やプレビューを終えてから接続してください。');
      if (!state.projectBinding || state.projectPersisted === false) { await draw.workspace.save(); state = draw.getAgentState({ includePixels: false }); }
      if (!state.projectBinding) throw error('NO_PROJECT', '先に作品を保存してください。');
      if (ticket !== generation || !isActive()) return;
      const binding = state.projectBinding;
      controller = new AbortController();
      const createPath = mode === 'oauth' ? '/draw-store-sessions' : '/draw-sessions';
      // getAgentState has no project title, so omit projectName rather than guessing one.
      const opened = await request(createPath, { method: 'POST', body: { projectBinding: binding }, signal: controller.signal });
      if (ticket !== generation || !sameBinding(draw.getAgentState({ includePixels: false }).projectBinding, binding)) { await revoke(opened); return; }
      session = { ...opened, projectBinding: binding };
      if (!Number.isFinite(expires(opened.expiresAt)) || now() >= expires(opened.expiresAt)) throw error('INVALID_EXPIRY', '有効な接続を作成できませんでした。');
      expiryTimer = schedule(() => { if (ticket === generation) void stop('接続の有効期限が切れました。'); }, Math.max(0, expires(opened.expiresAt) - now()));
      publish({ phase: 'waiting', mode, pairingCode: opened.pairingCode, expiresAt: opened.expiresAt,
        message: mode === 'oauth' ? 'ChatGPTが開く接続許可画面に入力してください。チャット本文には貼りません。' : 'ChatGPTで接続コードを使用してください。' });
      void refreshUsage({ force: true });
      void poll(ticket);
      return { ...view };
    } catch (cause) {
      if (ticket === generation) {
        fail(cause?.message || '接続できませんでした。');
        if (cause?.code === 'DRAW_ADMISSION_LIMIT') void refreshUsage({ force: true });
      }
      throw cause;
    }
  }
  return { start, stop, refreshUsage, getState: () => ({ ...view, usage: view.usage ? { ...view.usage } : null }), get connected() { return view.phase === 'connected'; } };
}
