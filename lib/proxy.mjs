/**
 * Sends one request on the user's behalf and describes what came back.
 *
 * The same contract `/api/proxy` already speaks, so the app's send path does
 * not care which one answered. The difference is where it runs: this is on the
 * user's machine, so `localhost`, a container, a staging box on the VPN — all
 * reachable, none of which a hosted server could touch.
 */

const DEFAULT_TIMEOUT = 25_000;
const MIN_TIMEOUT = 1_000;
const MAX_TIMEOUT = 300_000;

/** Headers the runtime owns; setting them by hand breaks the request. */
const BLOCKED = new Set(["host", "content-length", "connection", "transfer-encoding"]);

/**
 * Cloud metadata endpoints, which are reachable from a developer machine and
 * hand out credentials to anything that asks. The hosted proxy blocks these
 * and so does this one — running locally is not a reason to be careless.
 */
const BLOCKED_HOSTS =
  /^(169\.254\.|metadata\.google\.|metadata\.azure\.|100\.100\.100\.200)/i;

function timeoutFor(requested) {
  if (typeof requested !== "number" || !Number.isFinite(requested)) return DEFAULT_TIMEOUT;
  return Math.min(Math.max(Math.round(requested), MIN_TIMEOUT), MAX_TIMEOUT);
}

/** Fills in a scheme when the URL was pasted without one. */
function withScheme(url) {
  const trimmed = (url ?? "").trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;

  const host = trimmed.split(/[/?#]/)[0].toLowerCase();
  const local =
    /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/.test(host) ||
    /\.local(:\d+)?$/.test(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

  return `${local ? "http" : "https"}://${trimmed}`;
}

/** Turns a transport failure into something worth reading. */
function transportError(error, target) {
  const code = error?.cause?.code ?? error?.code;
  const where = `${target.hostname}:${target.port || (target.protocol === "https:" ? 443 : 80)}`;

  switch (code) {
    case "ECONNREFUSED":
      return `Nothing is listening on ${where}. Is your server running?`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `${target.hostname} could not be resolved.`;
    case "ECONNRESET":
      return `${where} closed the connection before answering.`;
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return `${where} is unreachable from this machine.`;
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return `${where} presented a certificate that could not be verified.`;
    default:
      return error?.message && error.message !== "fetch failed"
        ? error.message
        : `Could not reach ${where}.`;
  }
}

/** Reads the body without assuming it is JSON. */
async function readBody(response) {
  const text = await response.text();
  if (!text) return null;

  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) return text;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function proxy(payload) {
  const started = Date.now();

  let target;
  try {
    target = new URL(withScheme(payload.url));
  } catch {
    return {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      headers: {},
      body: null,
      error: `"${payload.url}" is not a valid URL.`,
    };
  }

  if (BLOCKED_HOSTS.test(target.hostname)) {
    return {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: {},
      body: null,
      error: "That host is blocked — it hands out cloud credentials.",
    };
  }

  const headers = {};
  for (const [key, value] of Object.entries(payload.headers ?? {})) {
    if (!BLOCKED.has(key.toLowerCase())) headers[key] = value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutFor(payload.timeoutMs));

  try {
    const response = await fetch(target, {
      method: payload.method ?? "GET",
      headers,
      body: payload.body ?? undefined,
      redirect: "follow",
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: await readBody(response),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 502,
      statusText: aborted ? "Gateway Timeout" : "Bad Gateway",
      headers: {},
      body: null,
      durationMs: Date.now() - started,
      error: aborted
        ? `No answer within ${timeoutFor(payload.timeoutMs) / 1000}s.`
        : transportError(error, target),
    };
  } finally {
    clearTimeout(timer);
  }
}
