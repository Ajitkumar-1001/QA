import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// proxy.ts imports next/server, which `node --test` cannot load, and the
// framework needs its matcher as a constant in that file. So the test reads the source.
const source = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");

test("the matcher is a constant that skips only static assets and metadata files", () => {
  const found = [...source.matchAll(/matcher:\s*\[\s*"([^"]+)"\s*\]/g)];
  assert.equal(found.length, 1);
  const matches = new RegExp(`^${found[0]?.[1] ?? "(?!)"}$`);
  for (const path of ["/", "/runs/0b5c", "/api/anything", "/form?x=1"]) {
    assert.ok(matches.test(path), `should gate ${path}`);
  }
  for (const path of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/robots.txt", "/sitemap.xml"]) {
    assert.equal(matches.test(path), false, `should skip ${path}`);
  }
});

test("proxy.ts sets no runtime, which the Node.js proxy rejects", () => {
  assert.equal(/export\s+const\s+runtime\b/.test(source), false);
});
