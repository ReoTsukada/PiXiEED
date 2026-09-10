/*
 * Creator App route contract.
 *
 * The public shell and the creator shell have different layout geometry, but
 * they share one URL vocabulary.  This module is intentionally framework-free
 * and side-effect-free: it normalizes deep links, validates bounded IDs, and
 * returns a route decision for a host to render.  It never redirects, reads
 * storage, checks a session, or exposes private Project data.
 */

export const CREATOR_APP_ROUTE_SCHEMA_VERSION = 1;

export const CREATOR_APP_ROUTE_STATES = Object.freeze([
  "CURRENT",
  "NOT_FOUND",
  "INVALID",
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "UNAVAILABLE",
]);

export const CREATOR_APP_ROUTE_KINDS = Object.freeze([
  "APP_HOME",
  "NEW_PROJECT",
  "PROJECT_HOME",
  "PROJECT_DRAW",
  "PROJECT_AUDIO",
  "PROJECT_GAME",
  "PROJECT_PLAY",
  "PROJECT_WRITING",
  "PROJECT_VISUAL",
  "SHARE_ROOM",
  "SELL_PROJECT",
  "ACCOUNT",
]);

export const CREATOR_APP_ROUTE_LIMITS = Object.freeze({
  path: 512,
  id: 256,
});

const ROUTE_DEFINITIONS = Object.freeze([
  ["app-home", "/app/", "APP_HOME", false],
  ["app-new", "/app/new/", "NEW_PROJECT", false],
  ["app-project", "/app/project/:projectId/", "PROJECT_HOME", true],
  ["app-project-draw", "/app/project/:projectId/draw/", "PROJECT_DRAW", true],
  ["app-project-audio", "/app/project/:projectId/audio/", "PROJECT_AUDIO", true],
  ["app-project-game", "/app/project/:projectId/game/", "PROJECT_GAME", true],
  ["app-project-play", "/app/project/:projectId/play/", "PROJECT_PLAY", true],
  // Writing and Visual are static document roots today; the Project identity
  // travels in the bounded query contract, as it does for Creator App links.
  ["app-writing", "/app/writing/", "PROJECT_WRITING", true],
  ["app-visual", "/app/visual/", "PROJECT_VISUAL", true],
  ["app-share-room", "/app/share/:roomId/", "SHARE_ROOM", true],
  ["app-sell-project", "/app/market/sell/:projectId/", "SELL_PROJECT", true],
  ["app-account", "/app/account/", "ACCOUNT", true],
]);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const PROTOTYPE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function fail(code, message, field = null) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  throw error;
}

function boundedText(value, field, limit) {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail("CREATOR_APP_ROUTE_VALUE_INVALID", `${field} must be bounded text.`, field);
  }
  const result = value.normalize("NFC").trim();
  if (result.length === 0) fail("CREATOR_APP_ROUTE_VALUE_INVALID", `${field} must not be empty.`, field);
  return result;
}

function stableId(value, field) {
  const result = boundedText(value, field, CREATOR_APP_ROUTE_LIMITS.id);
  if (!ID_PATTERN.test(result)) fail("CREATOR_APP_ROUTE_ID_INVALID", `${field} is not a stable ID.`, field);
  return result;
}

function normalizePath(value) {
  let path = boundedText(value, "pathname", CREATOR_APP_ROUTE_LIMITS.path);
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.includes("\\") || /\/\/(?!$)/u.test(path) || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)) {
    fail("CREATOR_APP_ROUTE_PATH_INVALID", "pathname contains an unsafe segment.", "pathname");
  }
  const segments = path.split("/").map((segment) => {
    if (segment === "") return segment;
    try {
      return encodeURIComponent(decodeURIComponent(segment));
    } catch {
      fail("CREATOR_APP_ROUTE_PATH_INVALID", "pathname contains malformed encoding.", "pathname");
    }
  });
  const result = segments.join("/");
  return result === "//" ? "/" : result.endsWith("/") || result === "/" ? result : `${result}/`;
}

function routeDefinitionForPath(pathname) {
  for (const [routeId, template, kind, requiresAuth] of ROUTE_DEFINITIONS) {
    const names = [];
    const pattern = new RegExp(`^${template.replace(/:([A-Za-z][A-Za-z0-9]*)/gu, (_, name) => {
      names.push(name);
      return "([^/]+)";
    }).replaceAll("/", "\\/")}$`, "u");
    const match = pathname.match(pattern);
    if (!match) continue;
    const params = {};
    for (const [index, name] of names.entries()) {
      const raw = match[index + 1];
      if (raw === undefined) fail("CREATOR_APP_ROUTE_ID_INVALID", `${name} is missing.`, name);
      params[name] = stableId(decodeURIComponent(raw), name);
    }
    return Object.freeze({ routeId, template, kind, requiresAuth, params: Object.freeze(params) });
  }
  return undefined;
}

function queryObject(url) {
  const query = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (PROTOTYPE_KEYS.has(key) || Object.prototype.hasOwnProperty.call(query, key)) {
      fail("CREATOR_APP_ROUTE_QUERY_INVALID", "query contains a forbidden or duplicate key.", key);
    }
    query[boundedText(key, "query.key", 64)] = boundedText(value, `query.${key}`, 512);
  }
  return Object.freeze(query);
}

export const CREATOR_APP_ROUTE_CATALOG = Object.freeze(ROUTE_DEFINITIONS.map(([routeId, template, kind, requiresAuth]) => Object.freeze({
  routeId,
  template,
  kind,
  requiresAuth,
  state: "CURRENT",
})));

/** Resolve a same-origin Creator App URL without applying navigation. */
export function resolveCreatorAppRoute(input, origin = "https://pixieed.jp") {
  let url;
  try {
    url = new URL(String(input), origin);
  } catch {
    return Object.freeze({ state: "INVALID", pathname: null, params: Object.freeze({}), query: Object.freeze({}) });
  }
  if (!/^https?:$/u.test(url.protocol) || url.origin !== origin) {
    return Object.freeze({ state: "INVALID", pathname: null, params: Object.freeze({}), query: Object.freeze({}) });
  }
  try {
    const pathname = normalizePath(url.pathname);
    const route = routeDefinitionForPath(pathname);
    const query = queryObject(url);
    if (route === undefined) return Object.freeze({ state: "NOT_FOUND", pathname, params: Object.freeze({}), query });
    return Object.freeze({
      state: "CURRENT",
      pathname,
      routeId: route.routeId,
      kind: route.kind,
      requiresAuth: route.requiresAuth,
      params: route.params,
      query,
    });
  } catch (error) {
    return Object.freeze({
      state: "INVALID",
      pathname: url.pathname,
      params: Object.freeze({}),
      query: Object.freeze({}),
      code: error?.code ?? "CREATOR_APP_ROUTE_INVALID",
    });
  }
}

function definitionForKind(kind) {
  if (!CREATOR_APP_ROUTE_KINDS.includes(kind)) fail("CREATOR_APP_ROUTE_KIND_INVALID", "Unknown Creator App route kind.", "kind");
  const result = ROUTE_DEFINITIONS.find((candidate) => candidate[2] === kind);
  if (result === undefined) fail("CREATOR_APP_ROUTE_KIND_INVALID", "Creator App route kind is not registered.", "kind");
  return result;
}

/** Build a normalized Creator App path from a route kind and bounded IDs. */
export function creatorAppPath(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("CREATOR_APP_ROUTE_INPUT_INVALID", "Creator App route input must be an object.");
  }
  const definition = definitionForKind(input.kind);
  let path = definition[1];
  for (const name of path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/gu)) {
    const key = name[1];
    if (PROTOTYPE_KEYS.has(key) || typeof input[key] !== "string") fail("CREATOR_APP_ROUTE_ID_INVALID", `${key} is required.`, key);
    path = path.replace(`:${key}`, encodeURIComponent(stableId(input[key], key)));
  }
  return normalizePath(path);
}

export const creatorAppRouteContract = Object.freeze({
  schemaVersion: CREATOR_APP_ROUTE_SCHEMA_VERSION,
  catalog: CREATOR_APP_ROUTE_CATALOG,
  resolve: resolveCreatorAppRoute,
  path: creatorAppPath,
});
