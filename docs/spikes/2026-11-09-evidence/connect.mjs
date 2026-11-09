// THROWAWAY spike: connect from the host to Playwright run-server inside the sandbox.
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";

const ws = process.argv[2]; // wss://<sandbox-domain>/
const t0 = Date.now();
const browser = await chromium.connect(ws, { timeout: 30_000 });
const page = await browser.newPage();
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(m.text()));
const resp = await page.goto("https://example.com", { timeout: 30_000 });
const shot = await page.screenshot();
mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../out/shot.png", import.meta.url), shot);
console.log(JSON.stringify({ status: resp?.status(), title: await page.title(), bytes: shot.length, ms: Date.now() - t0, consoleMsgs }));
await browser.close();
