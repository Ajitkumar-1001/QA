/**
 * Structured log lines that never carry a configured secret.
 * Pure: the caller supplies the secret values and the sink.
 */

export const REDACTED = "[redacted]";

/** How deep a `cause` chain is followed; a cycle stops here too. */
const MAX_CAUSE_DEPTH = 5;

export type SerializedError = {
  name: string;
  code?: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
};

export type LogValue = string | number | boolean | null;
export type LogFields = Record<string, LogValue>;

export type Logger = {
  info(event: string, fields?: LogFields): void;
  /** `error` is optional: a configuration problem has fields but no thrown value. */
  error(event: string, fields: LogFields, error?: unknown): void;
};

/** Longest first, so a secret that contains another is replaced whole. */
function secretList(secrets: readonly (string | null | undefined)[]): string[] {
  return secrets
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .sort((a, b) => b.length - a.length);
}

function redactWith(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join(REDACTED);
  return out;
}

/** Replace every non-empty secret value in `text`. */
export function redact(text: string, secrets: readonly (string | null | undefined)[]): string {
  return redactWith(text, secretList(secrets));
}

function describe(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
}

function serializeWith(error: unknown, secrets: readonly string[], depth: number): SerializedError {
  if (!(error instanceof Error)) {
    return { name: "NonError", message: redactWith(describe(error), secrets) };
  }
  const out: SerializedError = {
    name: redactWith(describe(error.name), secrets),
    message: redactWith(describe(error.message), secrets),
  };
  const code: unknown = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") {
    out.code = redactWith(String(code), secrets);
  }
  if (typeof error.stack === "string") out.stack = redactWith(error.stack, secrets);
  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    out.cause = serializeWith(error.cause, secrets, depth + 1);
  }
  return out;
}

/**
 * An allowlist of the error's name, code, message, stack and cause chain,
 * each with every secret value replaced. Never the error object itself.
 */
export function serializeError(
  error: unknown,
  secrets: readonly (string | null | undefined)[],
): SerializedError {
  return serializeWith(error, secretList(secrets), 0);
}

function redactFields(fields: LogFields, secrets: readonly string[]): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = typeof value === "string" ? redactWith(value, secrets) : value;
  }
  return out;
}

export function createLogger(options: {
  /** Every configured secret: owner secret, Authorization value, DATABASE_URL, queue credentials. */
  secrets: readonly (string | null | undefined)[];
  write: (line: string) => void;
}): Logger {
  const secrets = secretList(options.secrets);
  return {
    info(event, fields = {}) {
      // Fixed keys last, so a field cannot overwrite them.
      options.write(JSON.stringify({ ...redactFields(fields, secrets), level: "info", event }));
    },
    error(event, fields, error) {
      options.write(
        JSON.stringify({
          ...redactFields(fields, secrets),
          level: "error",
          event,
          ...(error === undefined ? {} : { error: serializeWith(error, secrets, 0) }),
        }),
      );
    },
  };
}
