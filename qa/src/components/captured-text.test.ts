import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapturedText } from "./captured-text.ts";

const SCRIPT_PAYLOAD = "<script>alert(1)</script>";
const IMG_PAYLOAD = "<img src=x onerror=alert(1)>";

function renderCaptured(
  kind: "page_text" | "console" | "network" | "model_output",
  content: unknown,
): string {
  return renderToStaticMarkup(
    createElement(CapturedText, { kind, content }),
  );
}

function preText(html: string): string {
  const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(match, "expected a <pre> element");
  return match[1] ?? "";
}

test("script markup appears only as escaped text, never as a script element", () => {
  const html = renderCaptured("page_text", SCRIPT_PAYLOAD);

  assert.equal(html.includes("<script"), false);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes('aria-label="Page text"'));
  assert.ok(html.includes("<h2>Page text</h2>"));
});

test("img onerror markup appears only as escaped text, never as an img element", () => {
  const html = renderCaptured("console", IMG_PAYLOAD);

  assert.equal(html.includes("<img"), false);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes('aria-label="Console log"'));
  assert.ok(html.includes("<h2>Console log</h2>"));
});

test("object content renders as escaped pretty-printed JSON text", () => {
  const html = renderCaptured("network", {
    url: "https://example.com",
    status: 200,
  });

  assert.ok(html.includes('aria-label="Network log"'));
  assert.ok(html.includes("<h2>Network log</h2>"));
  assert.ok(html.includes("&quot;url&quot;"));
  assert.ok(html.includes("https://example.com"));
  assert.ok(html.includes("&quot;status&quot;"));
  assert.ok(html.includes("200"));
  assert.equal(html.includes("<script"), false);
});

test("whitespace and newlines are preserved inside the pre text", () => {
  const content = "line one\n  indented\n\nline three";
  const html = renderCaptured("model_output", content);

  assert.ok(html.includes('aria-label="Model output"'));
  assert.ok(html.includes("<h2>Model output</h2>"));
  assert.match(html, /<pre[^>]*>line one\n  indented\n\nline three<\/pre>/);
});

test("undefined renders non-empty literal text and does not throw", () => {
  const html = renderCaptured("page_text", undefined);
  const text = preText(html);
  assert.ok(text.length > 0);
  assert.equal(text, "undefined");
});

test("symbol renders non-empty literal text and does not throw", () => {
  const html = renderCaptured("console", Symbol("captured"));
  const text = preText(html);
  assert.ok(text.length > 0);
  assert.equal(text, "Symbol(captured)");
});

test("bigint renders non-empty literal text and does not throw", () => {
  const html = renderCaptured("network", BigInt(42));
  const text = preText(html);
  assert.ok(text.length > 0);
  assert.ok(text.includes("42"));
});

test("circular object renders non-empty literal text and does not throw", () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  const html = renderCaptured("model_output", circular);
  const text = preText(html);
  assert.ok(text.length > 0);
});

test("function renders non-empty literal text and does not throw", () => {
  const html = renderCaptured("page_text", function namedCapture() {});
  const text = preText(html);
  assert.ok(text.length > 0);
  assert.equal(text, "[function]");
});

// Cheap tripwire; escaping tests are the real XSS guarantee.
test("qa/src must not use dangerouslySetInnerHTML", () => {
  const thisFile = fileURLToPath(import.meta.url);
  const srcRoot = join(dirname(thisFile), "..");
  const hits: string[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) {
        walk(path);
        continue;
      }
      if (path === thisFile) continue;
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) continue;
      const source = readFileSync(path, "utf8");
      if (source.includes("dangerouslySetInnerHTML")) {
        hits.push(relative(srcRoot, path));
      }
    }
  }

  walk(srcRoot);
  assert.deepEqual(hits, []);
});
