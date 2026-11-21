/**
 * What every page and the Start action share: the owner check, the config, the logger
 * and the repository. A private folder (leading underscore), so it is not a route.
 * Nothing here runs at build time: the pool is created on the first request that needs it.
 */
import { headers } from "next/headers";
import { decideRequest } from "../../lib/access/gate.ts";
import { parseDatabaseUrl, parseServerConfig, type ServerConfig } from "../../lib/config.ts";
import { createPool } from "../../lib/db/client.ts";
import { createRunsRepo, type RunsRepo } from "../../lib/db/runs.ts";
import { createLogger, type Logger } from "../../lib/log.ts";
import { PageLoadError } from "../../lib/run/page-state.ts";

/** Redacts the owner secret, the connection string and its password from every field and error. */
export function getLog(): Logger {
  const { QAFORGE_OWNER_SECRET: ownerSecret, DATABASE_URL: databaseUrl } = process.env;
  const dbPassword =
    databaseUrl !== undefined && URL.canParse(databaseUrl)
      ? decodeURIComponent(new URL(databaseUrl).password)
      : undefined;
  return createLogger({
    secrets: [ownerSecret, databaseUrl, dbPassword],
    write: (line) => console.log(line),
  });
}

/** Server config; a bad value is logged by variable name and fails the request with a fixed message. */
export function getConfig(): ServerConfig {
  const parsed = parseServerConfig(process.env);
  if (!parsed.ok) {
    getLog().error("config_error", { variables: parsed.errors.map((e) => e.variable).join(",") });
    throw new PageLoadError("config");
  }
  return parsed.config;
}

let repo: RunsRepo | undefined;

export function getRepo(): RunsRepo {
  if (repo !== undefined) return repo;
  const log = getLog();
  const url = parseDatabaseUrl(process.env);
  if (!url.ok) {
    log.error("config_error", { variables: url.error.variable });
    throw new PageLoadError("config");
  }
  repo = createRunsRepo({ db: createPool(url.url, log), log });
  return repo;
}

/**
 * The owner check for this request: the credential, then (for POST) the origin. It logs
 * its own refusal. Call it first, before reading input, config or data (NX-001).
 */
export async function isOwner(method: "GET" | "POST"): Promise<boolean> {
  const decision = decideRequest({ method, headers: await headers() }, process.env, (line) => console.log(line));
  return decision.kind === "pass";
}
