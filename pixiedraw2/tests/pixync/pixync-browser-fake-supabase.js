(() => {
  const room = "11111111-1111-4111-8111-111111111111";
  const actor = globalThis.__PIXYNC_TEST_ACTOR__ ??
    "22222222-2222-4222-8222-222222222222";
  const operationsKey = `pixync-test:${room}:operations`;
  const gamePrefix = `pixync-test:${room}:game:`;
  const controls = {
    dropBroadcast: false,
    duplicateBroadcast: false,
    delayBroadcastMs: 0,
  };
  const canonicalValue = (value) => {
    if (value === null || typeof value === "string" ||
      typeof value === "boolean") return value;
    if (typeof value === "number") return value;
    if (Array.isArray(value)) return value.map(canonicalValue);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalValue(value[key]);
    }
    return result;
  };
  const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
  const sha256 = async (value) => {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value)),
    );
    return [...new Uint8Array(bytes)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  };
  const submissionFingerprint = (operation) => sha256({
    schemaVersion: operation.schemaVersion,
    operationId: operation.operationId,
    projectId: operation.projectId,
    aggregate: operation.aggregate,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
    baseProjectRevision: operation.baseProjectRevision,
    payloadHash: operation.payloadHash,
    payload: operation.payload,
    compensation: operation.compensation,
  });
  const committedFingerprint = async (operation) => sha256({
    submissionFingerprint: await submissionFingerprint(operation),
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
  });
  const readOperations = () =>
    JSON.parse(localStorage.getItem(operationsKey) ?? "[]");
  const writeOperations = (value) =>
    localStorage.setItem(operationsKey, JSON.stringify(value));
  const channels = new Set();
  const hint = () => {
    if (controls.dropBroadcast) return;
    const send = () => {
      for (const channel of channels) channel.postMessage({ event: "pixync_hint" });
      if (controls.duplicateBroadcast) {
        for (const channel of channels) channel.postMessage({ event: "pixync_hint" });
      }
    };
    controls.delayBroadcastMs > 0 ? setTimeout(send, controls.delayBroadcastMs) : send();
  };
  globalThis.__pixyncFakeServerControl = controls;
  globalThis.__pixyncFakeServerReset = () => {
    localStorage.removeItem(operationsKey);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(gamePrefix)) localStorage.removeItem(key);
    }
  };
  globalThis.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = {
    auth: {
      getUser: async () => ({ data: { user: { id: actor } }, error: null }),
    },
    rpc: async (name, args) => {
      if (name === "pixync_draw2_open_session_v1") {
        return { data: {
          principal_id: actor,
          project_id: args.p_project_id,
          room_id: args.p_project_id,
          actor_id: actor,
          membership_id: actor,
          membership_revision: "test-membership-1",
          client_id: args.p_client_id,
          session_generation: args.p_session_generation,
          role: "editor",
        }, error: null };
      }
      if (name === "pixync_draw2_get_operations_since_v1") {
        return {
          data: readOperations().filter((operation) =>
            operation.projectRevision > args.p_after_project_revision
          ),
          error: null,
        };
      }
      if (name === "pixync_draw2_commit_operation_v1") {
        const operations = readOperations();
        const duplicate = operations.find((operation) =>
          operation.operationId === args.p_operation.operationId
        );
        const operation = duplicate ?? (() => {
          const aggregateRevision = operations.filter((item) =>
            item.aggregate === args.p_operation.aggregate
          ).length + 1;
          return {
            ...args.p_operation,
            projectRevision: operations.length + 1,
            aggregateRevision,
            committedAt: new Date().toISOString(),
          };
        })();
        if (duplicate === undefined) {
          operations.push(operation);
          writeOperations(operations);
          hint();
        }
        const submittedHash = await submissionFingerprint(operation);
        return { data: {
          kind: duplicate === undefined ? "COMMITTED" : "DUPLICATE",
          operation_id: operation.operationId,
          project_id: operation.projectId,
          project_revision: operation.projectRevision,
          aggregate_revision: operation.aggregateRevision,
          submission_fingerprint: submittedHash,
          committed_fingerprint: await committedFingerprint(operation),
          operation,
        }, error: null };
      }
      if (name === "pixync_draw2_put_game_revision_v1") {
        localStorage.setItem(
          `${gamePrefix}${args.p_snapshot_hash}:${args.p_revision_id}`,
          JSON.stringify(args.p_game_project),
        );
        return { data: {}, error: null };
      }
      if (name === "pixync_draw2_get_game_revision_v1") {
        const value = localStorage.getItem(
          `${gamePrefix}${args.p_snapshot_hash}:${args.p_revision_id}`,
        );
        return { data: value === null ? null : JSON.parse(value), error: null };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    },
    channel: (name) => {
      let callback = () => {};
      let channel;
      return channel = {
        on: (_type, _filter, next) => {
          callback = next;
          return channel;
        },
        subscribe: (status) => {
          const broadcast = new BroadcastChannel(name);
          broadcast.onmessage = (event) => callback(event.data);
          channels.add(broadcast);
          channel.__broadcast = broadcast;
          status("SUBSCRIBED");
        },
        unsubscribe: () => {
          if (channel.__broadcast) {
            channels.delete(channel.__broadcast);
            channel.__broadcast.close();
          }
        },
      };
    },
  };
})();
