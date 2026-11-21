/**
 * The proxy's decision for one request (FR-001): the credential check, then the
 * origin check, with the framing guard on every response. Pure and free of next/*
 * imports so it loads under `node --test`; proxy.ts only wraps a pass-through in
 * the framework's response type.
 */
import { checkBasicAuth, checkOrigin, refusalResponse } from "./basic-auth.ts";
import { createLogger } from "../log.ts";

/** Another site cannot frame the one-button form. */
export const FRAME_GUARD_HEADERS = { "Content-Security-Policy": "frame-ancestors 'none'" } as const;

export type GateDecision =
  | { kind: "refuse"; response: Response }
  | { kind: "pass"; headers: typeof FRAME_GUARD_HEADERS };

type GateRequest = { method: string; headers: Pick<Headers, "get"> };

function withFrameGuard(response: Response): Response {
  for (const [name, value] of Object.entries(FRAME_GUARD_HEADERS)) response.headers.set(name, value);
  return response;
}

function originRefusalResponse(): Response {
  return withFrameGuard(
    new Response("Request origin not allowed.", {
      status: 403,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    }),
  );
}

/** Credentials first, so a browser's first visit meets the challenge; then the origin. */
export function decideRequest(
  request: GateRequest,
  env: Record<string, string | undefined>,
  write: (line: string) => void,
): GateDecision {
  const authorization = request.headers.get("authorization");
  // Built only on a refusal, so a request that passes allocates no logger.
  const log = () => createLogger({ secrets: [env.QAFORGE_OWNER_SECRET, authorization], write });

  const credentials = checkBasicAuth(authorization, env);
  if (!credentials.ok) {
    if (credentials.reason === "not_configured") {
      log().error("owner_gate_config_error", {
        variable: credentials.error.variable,
        problem: credentials.error.problem,
      });
    } else {
      // Missing and wrong credentials are logged apart: a first visit always meets the challenge.
      log().info("owner_gate_refused", { reason: credentials.reason });
    }
    return { kind: "refuse", response: withFrameGuard(refusalResponse(credentials)) };
  }

  const origin = checkOrigin(request.method, request.headers);
  if (!origin.ok) {
    log().info("owner_gate_refused", { reason: origin.reason });
    return { kind: "refuse", response: originRefusalResponse() };
  }
  return { kind: "pass", headers: FRAME_GUARD_HEADERS };
}
