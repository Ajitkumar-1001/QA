/**
 * Owner gate over HTTP Basic authentication (FR-001, FR-032).
 * Pure, with no next/* import: the proxy, every page and the Start action call
 * it on the request's Authorization value and write their own log line.
 */
import { isOwnerSecret } from "./owner-gate.ts";
import { parseOwnerSecret, type ConfigError } from "../config.ts";

export const BASIC_CHALLENGE = 'Basic realm="QAForge", charset="UTF-8"';

export type BasicAuthResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "wrong_secret" }
  | { ok: false; reason: "not_configured"; error: ConfigError };

const SCHEME_AND_TOKEN = /^basic +([^ ]+) *$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * The password in a Basic credential: everything after the first `:` of the
 * decoded payload. Null when the value is not strict base64 of valid UTF-8,
 * because Node's own decoders accept both silently.
 */
export function basicPassword(authorization: string): string | null {
  const token = SCHEME_AND_TOKEN.exec(authorization)?.[1];
  if (token === undefined || token.length % 4 !== 0 || !BASE64.test(token)) return null;
  let payload: string;
  try {
    payload = UTF8.decode(Buffer.from(token, "base64"));
  } catch {
    return null;
  }
  const colon = payload.indexOf(":");
  return colon === -1 ? null : payload.slice(colon + 1);
}

/**
 * Check the Authorization value against QAFORGE_OWNER_SECRET. An unset or
 * invalid configured secret refuses every request. The user name is ignored.
 */
export function checkBasicAuth(
  authorization: string | null | undefined,
  env: Record<string, string | undefined>,
): BasicAuthResult {
  const configured = parseOwnerSecret(env);
  if (!configured.ok) return { ok: false, reason: "not_configured", error: configured.error };
  if (!authorization) return { ok: false, reason: "missing" };
  const password = basicPassword(authorization);
  if (password === null) return { ok: false, reason: "malformed" };
  return isOwnerSecret(password, configured.secret)
    ? { ok: true }
    : { ok: false, reason: "wrong_secret" };
}

export type OriginResult =
  | { ok: true }
  | { ok: false; reason: "origin_missing" | "origin_null" | "origin_foreign" };

/**
 * Fail-closed origin check. Browsers attach cached Basic credentials to requests
 * another site starts, and the framework's own Server Action check lets a request
 * with no Origin through. Only GET and HEAD skip it. The app's host is taken as the
 * framework takes it: the first x-forwarded-host value, else host. A request whose
 * host cannot be known is refused.
 */
export function checkOrigin(method: string, headers: Pick<Headers, "get">): OriginResult {
  if (method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD") return { ok: true };
  const origin = headers.get("origin");
  if (!origin) return { ok: false, reason: "origin_missing" };
  if (origin === "null") return { ok: false, reason: "origin_null" };
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const appHost = (forwarded || headers.get("host") || "").trim().toLowerCase();
  if (appHost === "" || !URL.canParse(origin)) return { ok: false, reason: "origin_foreign" };
  return new URL(origin).host === appHost ? { ok: true } : { ok: false, reason: "origin_foreign" };
}

/**
 * The proxy's response to a refused request; undefined lets the request through.
 * A missing or bad credential gets the browser's prompt. A misconfigured secret
 * fails closed with a 500 that names nothing, since no credential can pass.
 */
export function refusalResponse(result: Extract<BasicAuthResult, { ok: false }>): Response;
export function refusalResponse(result: BasicAuthResult): Response | undefined;
export function refusalResponse(result: BasicAuthResult): Response | undefined {
  if (result.ok) return undefined;
  if (result.reason === "not_configured") {
    return new Response("The server is not configured.", {
      status: 500,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": BASIC_CHALLENGE,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
