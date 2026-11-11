/**
 * Server configuration from environment variables.
 * Pure validation: the caller passes env; nothing here reads process.env.
 */
import { z } from "zod";
import { MAX_CONCURRENCY_CAP } from "./run/caps.ts";

export const DEFAULT_TARGET_URL = "https://demo.playwright.dev/todomvc";
export const DEFAULT_OBJECTIVE =
  'add two todos, complete one, and confirm the counter reads "1 item left"';
export const DEFAULT_MONTHLY_RUN_CAP = 100;
export const DEFAULT_CONCURRENCY_CAP = 2;

const STRICT_INT = /^[0-9]+$/;

const safeParsedInt = z.number().refine((n) => Number.isSafeInteger(n), {
  message: "must be a safe integer",
});

const strictNonNegInt = z
  .string()
  .regex(STRICT_INT)
  .transform((value) => Number.parseInt(value, 10))
  .pipe(safeParsedInt)
  .pipe(z.number().int().min(0));

const strictConcurrencyCap = z
  .string()
  .regex(STRICT_INT)
  .transform((value) => Number.parseInt(value, 10))
  .pipe(safeParsedInt)
  .pipe(z.number().int().min(0).max(MAX_CONCURRENCY_CAP));

const httpsUrlNoCredentials = z
  .url({ protocol: /^https$/ })
  .refine((value) => {
    if (!URL.canParse(value)) return true;
    const parsed = new URL(value);
    return parsed.username === "" && parsed.password === "";
  }, { message: "must not contain credentials" });

const envSchema = z.object({
  QAFORGE_OWNER_SECRET: z.string().min(32),
  QAFORGE_TARGET_URL: httpsUrlNoCredentials,
  QAFORGE_OBJECTIVE: z.string().min(1).max(1000),
  QAFORGE_MONTHLY_RUN_CAP: strictNonNegInt,
  QAFORGE_CONCURRENCY_CAP: strictConcurrencyCap,
});

export type ServerConfig = {
  ownerSecret: string;
  targetUrl: string;
  objective: string;
  monthlyRunCap: number;
  concurrencyCap: number;
};

export type ConfigError = {
  variable: string;
  problem: string;
};

export type ParseServerConfigResult =
  | { ok: true; config: ServerConfig }
  | { ok: false; errors: ConfigError[] };

/** Map a Zod issue to a problem string that never includes the received value. */
function problemFrom(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return "required";
    case "too_small":
      if (issue.origin === "string") {
        return `must be at least ${issue.minimum} characters`;
      }
      return `must be >= ${issue.minimum}`;
    case "too_big":
      if (issue.origin === "string") {
        return `must be at most ${issue.maximum} characters`;
      }
      return `must be <= ${issue.maximum}`;
    case "invalid_format":
      if (issue.format === "url") return "must be an https URL";
      if (issue.format === "regex") return "must be an integer";
      return "invalid format";
    case "custom":
      return issue.message;
    default:
      return "invalid";
  }
}

function toErrors(error: z.ZodError): ConfigError[] {
  return error.issues.map((issue) => ({
    variable: String(issue.path[0] ?? "unknown"),
    problem: problemFrom(issue),
  }));
}

/** Validate server env. Defaults apply when a variable is absent. */
export function parseServerConfig(
  env: Record<string, string | undefined>,
): ParseServerConfigResult {
  const parsed = envSchema.safeParse({
    QAFORGE_OWNER_SECRET: env.QAFORGE_OWNER_SECRET,
    QAFORGE_TARGET_URL: env.QAFORGE_TARGET_URL ?? DEFAULT_TARGET_URL,
    QAFORGE_OBJECTIVE: env.QAFORGE_OBJECTIVE ?? DEFAULT_OBJECTIVE,
    QAFORGE_MONTHLY_RUN_CAP: env.QAFORGE_MONTHLY_RUN_CAP ?? String(DEFAULT_MONTHLY_RUN_CAP),
    QAFORGE_CONCURRENCY_CAP: env.QAFORGE_CONCURRENCY_CAP ?? String(DEFAULT_CONCURRENCY_CAP),
  });
  if (!parsed.success) {
    return { ok: false, errors: toErrors(parsed.error) };
  }
  return {
    ok: true,
    config: {
      ownerSecret: parsed.data.QAFORGE_OWNER_SECRET,
      targetUrl: parsed.data.QAFORGE_TARGET_URL,
      objective: parsed.data.QAFORGE_OBJECTIVE,
      monthlyRunCap: parsed.data.QAFORGE_MONTHLY_RUN_CAP,
      concurrencyCap: parsed.data.QAFORGE_CONCURRENCY_CAP,
    },
  };
}

/** Run target comes only from server config; client input cannot reach it (FR-002). */
export function resolveRunTarget(
  config: ServerConfig,
): { targetUrl: string; objective: string } {
  return { targetUrl: config.targetUrl, objective: config.objective };
}
