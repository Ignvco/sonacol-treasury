import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, build } from "vite";
import { createInstance } from "i18next";
import { localesPlugin } from "../config/locales-plugin";

test("canonical translations load as a virtual module in dev/build and retain every key across language changes", async () => {
 const root = await mkdtemp(path.join(tmpdir(), "sonacol-locales-"));
 const manifest = JSON.parse(await readFile("i18n.config.json", "utf8"));
 const resources: Record<string, { translation: Record<string, string> }> = {};
 try {
  await mkdir(path.join(root, "public/locales"), { recursive: true });
  for (const { code } of manifest.languages) {
   const raw = await readFile(`public/locales/${code}.json`, "utf8");
   await writeFile(path.join(root, `public/locales/${code}.json`), raw); resources[code] = { translation: JSON.parse(raw) };
  }
  await writeFile(path.join(root, "i18n.config.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "entry.js"), 'export { default } from "virtual:sonacol-locales";');
  const server = await createServer({ configFile: false, root, plugins: [localesPlugin()], server: { middlewareMode: true, hmr: false }, logLevel: "silent" });
  try {
   const loaded = await server.ssrLoadModule("virtual:sonacol-locales"); assert.deepEqual(loaded.default, resources);
  } finally { await server.close(); }
  const output = await build({ configFile: false, root, plugins: [localesPlugin()], logLevel: "silent", build: { write: false, minify: false, lib: { entry: path.join(root, "entry.js"), formats: ["es"] } } });
  const bundles = Array.isArray(output) ? output : [output];
  const chunk = bundles.flatMap(b => "output" in b ? b.output : []).find(o => o.type === "chunk");
  assert.ok(chunk && chunk.type === "chunk");
  const bundled = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  assert.deepEqual(bundled.default, resources);
  const i18n = createInstance(); await i18n.init({ resources: bundled.default, fallbackLng: manifest.fallbackLng, keySeparator: false, nsSeparator: false });
  for (const { code } of manifest.languages) {
   await i18n.changeLanguage(code);
   for (const [key, value] of Object.entries(resources[code].translation)) assert.equal(i18n.t(key), value);
  }
 } finally { await rm(root, { recursive: true, force: true }); }
});
