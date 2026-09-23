/** SAP handoff contract; no guesses about a company's chart of accounts or UDTs. */
export const ERP_ORIGINS = ["BANCO", "CLIENTES", "COLOCACIONES"] as const;
export function sapRecords(input: unknown) {
  const payload = input as Record<string, unknown>;
  const cutoff = String(payload?.cutoff ?? "");
  const date = new Date(cutoff + "T12:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== cutoff) throw new Error("Fecha de corte inválida.");
  const feeds = payload.sources as Record<string, unknown>;
  const counts = payload.counts as Record<string, unknown>;
  if (!feeds || !counts || Object.keys(feeds).some(k => !ERP_ORIGINS.includes(k as typeof ERP_ORIGINS[number]))) throw new Error("Se requieren exactamente BANCO, CLIENTES y COLOCACIONES. SAP no envía MANUAL.");
  let index = 0;
  const seen = new Set<string>();
  const rows = ERP_ORIGINS.flatMap(origin => {
    const feed = feeds[origin];
    if (!Array.isArray(feed) || counts[origin] !== feed.length) throw new Error("Entrega incompleta: verifica el total de " + origin + ".");
    if (origin === "BANCO" && feed.length === 0) throw new Error("La entrega no contiene los movimientos BANCO completos.");
    return feed.map((entry: Record<string, unknown>) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.sourceId !== "string" || !entry.sourceId.trim() || seen.has(origin + ":" + entry.sourceId)) throw new Error("Identificador SAP ausente o repetido.");
      seen.add(origin + ":" + entry.sourceId);
      const entityType = origin === "BANCO" ? "cash_flow" : origin === "CLIENTES" ? "invoice" : "investment";
      return { sheet: "BASE", row: ++index, entityType, status: "VALID", warnings: "", raw: entry,
        normalized: { ...entry, entityType, sourceOrigin: origin, sourceProfile: "BASE-ONLY-SAP-v7", cutoffDate: cutoff } };
    });
  });
  if (rows.length > 20000) throw new Error("La entrega supera 20.000 filas.");
  return rows;
}
