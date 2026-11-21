/**
 * Owner gate in front of every route except static assets (FR-001).
 * The decision lives in lib/access/gate.ts so it loads under `node --test`; this
 * file only wraps a pass-through in the framework's response type, which adds the
 * framing guard to the page. Pages and the Start action still run the checks
 * themselves.
 */
import { NextResponse, type NextRequest } from "next/server";
import { decideRequest } from "./lib/access/gate.ts";

export function proxy(request: NextRequest): Response {
  const decision = decideRequest(request, process.env, (line) => console.log(line));
  if (decision.kind === "refuse") return decision.response;
  return NextResponse.next({ headers: decision.headers });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
