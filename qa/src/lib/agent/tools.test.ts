import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FILL_TEXT_LENGTH,
  TOOL_NAMES,
  toBinaryArgs,
  toolArgumentSchemas,
  validateToolCall,
} from "./tools.ts";

// FR-017: exactly four allowlisted tools; none accepts a URL.
test("allowlist has exactly four tools and no url-like argument fields", () => {
  assert.deepEqual(TOOL_NAMES, [
    "read_page",
    "click_element",
    "fill_field",
    "press_key",
  ]);
  assert.equal(TOOL_NAMES.length, 4);
  for (const name of TOOL_NAMES) {
    const keys = Object.keys(toolArgumentSchemas[name].shape);
    for (const key of keys) {
      assert.equal(
        /url|href|uri|navigate|location/i.test(key),
        false,
        `${name}.${key}`,
      );
    }
  }
});

// FR-017: unknown tools (including navigation) are refused.
test("validateToolCall refuses unknown tools including navigate and open_url", () => {
  for (const name of ["navigate", "open_url", "goto", "click", ""]) {
    const result = validateToolCall(name, {});
    assert.equal(result.ok, false, name);
    assert.ok(!result.ok);
    assert.equal(result.error.code, "unknown_tool");
    assert.equal(typeof result.error.message, "string");
    assert.ok(result.error.message.length > 0);
  }
});

// FR-016: extra or oversized arguments are refused; no binary argv is produced.
test("validateToolCall refuses extra and oversized arguments", () => {
  const invalid: Array<[string, unknown]> = [
    ["read_page", { url: "https://example.com" }],
    ["click_element", { ref: "e1", url: "https://example.com" }],
    ["fill_field", { ref: "e1", text: "ok", extra: true }],
    ["fill_field", { ref: "e1", text: "x".repeat(MAX_FILL_TEXT_LENGTH + 1) }],
    ["press_key", { key: "Enter", url: "/" }],
    ["press_key", {}],
  ];
  for (const [name, args] of invalid) {
    const result = validateToolCall(name, args);
    assert.equal(result.ok, false, JSON.stringify({ name, args }));
    assert.ok(!result.ok);
    assert.equal(result.error.code, "invalid_arguments");
  }
});

test("validateToolCall refuses non-accessibility-snapshot element refs", () => {
  for (const ref of ["--help", "-e1", "e1 e2", "https://x"]) {
    const click = validateToolCall("click_element", { ref });
    assert.equal(click.ok, false, `click_element ${ref}`);
    assert.ok(!click.ok);
    assert.equal(click.error.code, "invalid_arguments");

    const fill = validateToolCall("fill_field", { ref, text: "ok" });
    assert.equal(fill.ok, false, `fill_field ${ref}`);
    assert.ok(!fill.ok);
    assert.equal(fill.error.code, "invalid_arguments");
  }
});

test("validateToolCall refuses a disallowed key", () => {
  const result = validateToolCall("press_key", { key: "Control" });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.code, "invalid_arguments");
});

// FR-016: shell metacharacters stay one argv element; nothing is interpreted.
test("toBinaryArgs keeps shell metacharacters as one literal fill argument", () => {
  const text = "; rm -rf / # $(id) `id`";
  const result = validateToolCall("fill_field", { ref: "e1", text });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  const argv = toBinaryArgs(result.call);
  assert.deepEqual(argv, ["fill_field", "e1", text]);
  assert.equal(argv.length, 3);
  assert.equal(argv[2], text);
});

test("validateToolCall accepts the four allowlisted shapes", () => {
  assert.equal(validateToolCall("read_page", {}).ok, true);
  assert.equal(validateToolCall("click_element", { ref: "e12" }).ok, true);
  assert.equal(validateToolCall("click_element", { ref: "@e12" }).ok, true);
  assert.equal(validateToolCall("fill_field", { ref: "e12", text: "Buy milk" }).ok, true);
  assert.equal(validateToolCall("fill_field", { ref: "@e12", text: "-leading dash ok" }).ok, true);
  assert.equal(validateToolCall("press_key", { key: "Enter" }).ok, true);
  assert.deepEqual(toBinaryArgs({ name: "read_page", args: {} }), ["read_page"]);
  assert.deepEqual(toBinaryArgs({ name: "press_key", args: { key: "Tab" } }), [
    "press_key",
    "Tab",
  ]);
});
