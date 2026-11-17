/** An explicitly started, short-lived MCP link to this open Draw document. */
export function createDrawLiveSession({
  draw, endpoint, isActive = () => true, onChange = () => {},
  fetchImpl = (...args) => fetch(...args), now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay), cancel = handle => clearTimeout(handle),
} = {}) {
  const base = new URL(endpoint); base.pathname = base.pathname.replace(/\/mcp\/?$/, ''); base.search = ''; base.hash = '';
  let generation = 0, session = null, timer = null, expiryTimer = null, controller = null;
  let view = { phase: 'idle', pairingCode: '', expiresAt: null, message: '' };
  let pendingAck = null;
  const completed = new Map();
  const publish = update => { view = { ...view, ...update }; onChange({ ...view }); };
  const sameBinding = (a, b) => !!a && !!b && a.projectId === b.projectId && a.openEpoch === b.openEpoch;
  const expires = value => typeof value === 'number' ? value : Date.parse(value);
  const endpointUrl = path => `${base.href.replace(/\/$/, '')}${path}`;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const current = (ticket, bound = session) => ticket === generation && bound === session && !!session && now() < expires(session.expiresAt);
  const authorized = ticket => current(ticket) && isActive() && sameBinding(draw.getAgentState().projectBinding, session.projectBinding);
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
    if (timer != null) cancel(timer); if (expiryTimer != null) cancel(expiryTimer); timer = null; expiryTimer = null; controller?.abort(); controller = null;
    publish({ phase: 'idle', pairingCode: '', expiresAt: null, message });
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
    const before = draw.getAgentState();
    try {
      if (!commandAuthorized() || !sameBinding(command.projectBinding, session.projectBinding)) throw error('SESSION_CHANGED', '作品または接続が変更されています。');
      let result;
      if (command.kind === 'state.get') result = draw.getAgentState(command.stateRequest || {});
      else if (command.kind === 'operation') result = await draw.executeAgentOperation({
        expectedRevision: command.expectedRevision, projectBinding: command.projectBinding,
        operation: command.operation,
      }, { isAuthorized: commandAuthorized });
      else throw error('UNSUPPORTED_COMMAND', '未対応の操作です。');
      operationCompleted = true;
      const after = draw.getAgentState();
      body = { commandId: command.commandId, requestId: command.requestId, status: 'applied', projectBinding: command.projectBinding, revision: after.revision, result };
    } catch (cause) {
      let revision = before.revision;
      try { revision = draw.getAgentState()?.revision ?? revision; } catch { /* Applied result remains unknown when its snapshot cannot be read. */ }
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
    if (!sameBinding(draw.getAgentState().projectBinding, session.projectBinding)) { void stop('作品が切り替わったため接続を終了しました。'); return; }
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
  async function start() {
    void stop(''); const ticket = generation;
    publish({ phase: 'starting', message: '接続を準備しています。' });
    try {
      await draw.workspace?.ready;
      if (ticket !== generation) return;
      let state = draw.getAgentState();
      if (!isActive() || state.busy) throw error('DRAW_BUSY', '描画やプレビューを終えてから接続してください。');
      if (!state.projectBinding || state.projectPersisted === false) { await draw.workspace.save(); state = draw.getAgentState(); }
      if (!state.projectBinding) throw error('NO_PROJECT', '先に作品を保存してください。');
      if (ticket !== generation || !isActive()) return;
      const binding = state.projectBinding;
      controller = new AbortController();
      const opened = await request('/draw-sessions', { method: 'POST', body: { projectBinding: binding }, signal: controller.signal });
      if (ticket !== generation || !sameBinding(draw.getAgentState().projectBinding, binding)) { await revoke(opened); return; }
      session = { ...opened, projectBinding: binding };
      if (!Number.isFinite(expires(opened.expiresAt)) || now() >= expires(opened.expiresAt)) throw error('INVALID_EXPIRY', '有効な接続を作成できませんでした。');
      expiryTimer = schedule(() => { if (ticket === generation) void stop('接続の有効期限が切れました。'); }, Math.max(0, expires(opened.expiresAt) - now()));
      publish({ phase: 'waiting', pairingCode: opened.pairingCode, expiresAt: opened.expiresAt, message: 'ChatGPTで接続コードを使用してください。' });
      void poll(ticket);
      return { ...view };
    } catch (cause) { if (ticket === generation) fail(cause?.message || '接続できませんでした。'); throw cause; }
  }
  return { start, stop, getState: () => ({ ...view }), get connected() { return view.phase === 'connected'; } };
}
