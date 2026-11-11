/**
 * Host-side browsing-agent tool allowlist and argument validation (FR-016, FR-017).
 * Validated calls become a fixed argv; nothing here starts a process.
 */
import { z } from "zod";

export const TOOL_NAMES = [
  "read_page",
  "click_element",
  "fill_field",
  "press_key",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const ALLOWED_KEYS = [
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;
export type AllowedKey = (typeof ALLOWED_KEYS)[number];

export const MAX_FILL_TEXT_LENGTH = 200;

/** Accessibility-snapshot refs from the browser daemon (e.g. "e12", optionally "@e12"). */
const elementRefSchema = z.string().regex(/^@?e[0-9]{1,6}$/);

export const toolArgumentSchemas = {
  read_page: z.strictObject({}),
  click_element: z.strictObject({
    ref: elementRefSchema,
  }),
  fill_field: z.strictObject({
    ref: elementRefSchema,
    text: z.string().max(MAX_FILL_TEXT_LENGTH),
  }),
  press_key: z.strictObject({
    key: z.enum(ALLOWED_KEYS),
  }),
} as const;

/** Short fixed descriptions for the model; no grading or navigation language (FR-017). */
const TOOL_DESCRIPTIONS = {
  read_page: "Return the accessibility snapshot of the current page.",
  click_element: "Click the element identified by ref.",
  fill_field: "Type text into the field identified by ref.",
  press_key: "Press one allowed key.",
} as const satisfies Record<ToolName, string>;

export type AgentToolDefinition = {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
};

/** Allowlisted tool definitions sent to the browsing agent (FR-017). */
export const AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[] = Object.freeze(
  TOOL_NAMES.map((name) =>
    Object.freeze({
      name,
      description: TOOL_DESCRIPTIONS[name],
      parameters: z.toJSONSchema(toolArgumentSchemas[name]) as Record<string, unknown>,
    }),
  ),
);

export type ValidatedToolCall =
  | { name: "read_page"; args: z.infer<typeof toolArgumentSchemas.read_page> }
  | { name: "click_element"; args: z.infer<typeof toolArgumentSchemas.click_element> }
  | { name: "fill_field"; args: z.infer<typeof toolArgumentSchemas.fill_field> }
  | { name: "press_key"; args: z.infer<typeof toolArgumentSchemas.press_key> };

export type ToolValidationError = {
  code: "unknown_tool" | "invalid_arguments";
  message: string;
};

export type ValidateToolCallResult =
  | { ok: true; call: ValidatedToolCall }
  | { ok: false; error: ToolValidationError };

function isToolName(name: unknown): name is ToolName {
  return typeof name === "string" && (TOOL_NAMES as readonly string[]).includes(name);
}

/** Validate a model-requested tool call against the fixed allowlist and schemas. */
export function validateToolCall(name: unknown, args: unknown): ValidateToolCallResult {
  if (!isToolName(name)) {
    return {
      ok: false,
      error: {
        code: "unknown_tool",
        message: "Tool is not on the allowlist.",
      },
    };
  }

  switch (name) {
    case "read_page": {
      const parsed = toolArgumentSchemas.read_page.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: "invalid_arguments", message: "Tool arguments failed validation." },
        };
      }
      return { ok: true, call: { name, args: parsed.data } };
    }
    case "click_element": {
      const parsed = toolArgumentSchemas.click_element.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: "invalid_arguments", message: "Tool arguments failed validation." },
        };
      }
      return { ok: true, call: { name, args: parsed.data } };
    }
    case "fill_field": {
      const parsed = toolArgumentSchemas.fill_field.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: "invalid_arguments", message: "Tool arguments failed validation." },
        };
      }
      return { ok: true, call: { name, args: parsed.data } };
    }
    case "press_key": {
      const parsed = toolArgumentSchemas.press_key.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: "invalid_arguments", message: "Tool arguments failed validation." },
        };
      }
      return { ok: true, call: { name, args: parsed.data } };
    }
  }
}

/** Turn a validated call into argv for a fixed binary. Does not run a process. */
export function toBinaryArgs(call: ValidatedToolCall): string[] {
  switch (call.name) {
    case "read_page":
      return [call.name];
    case "click_element":
      return [call.name, call.args.ref];
    case "fill_field":
      return [call.name, call.args.ref, call.args.text];
    case "press_key":
      return [call.name, call.args.key];
  }
}
