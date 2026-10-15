import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/** Public JSON remains the single translation source and HTTP fallback.
 * A virtual module bundles it without importing public assets as JS modules. */
export function localesPlugin(): Plugin {
  const publicId = "virtual:sonacol-locales", resolvedId = `\0${publicId}`;
  let manifest = "", locales = "";
  return {
    name: "sonacol-locales",
    configResolved(config) {
      manifest = path.resolve(config.root, "i18n.config.json");
      locales = path.resolve(config.publicDir, "locales");
    },
    resolveId(id) { if (id === publicId) return resolvedId; },
    async load(id) {
      if (id !== resolvedId) return;
      this.addWatchFile(manifest);
      const config = JSON.parse(await readFile(manifest, "utf8")) as { languages: { code: string }[] };
      const entries = await Promise.all(config.languages.map(async ({ code }) => {
        if (!/^[a-zA-Z0-9-]+$/.test(code)) throw new Error(`Código de idioma inválido: ${code}`);
        const file = path.join(locales, `${code}.json`);
        this.addWatchFile(file);
        const translation: unknown = JSON.parse(await readFile(file, "utf8"));
        if (!translation || Array.isArray(translation) || typeof translation !== "object" || Object.values(translation).some(v => typeof v !== "string"))
          throw new Error(`Traducciones inválidas: ${file}. Se requieren claves planas y textos.`);
        return [code, { translation }];
      }));
      return `export default ${JSON.stringify(Object.fromEntries(entries))};`;
    },
    handleHotUpdate({ file, server }) {
      if (file !== manifest && !(path.dirname(file) === locales && file.endsWith(".json"))) return;
      const module = server.moduleGraph.getModuleById(resolvedId);
      if (module) server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}
