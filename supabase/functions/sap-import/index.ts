// Server-to-server receiver. SAP credentials never enter the browser.
// Deploy only after TI supplies and validates the three complete ERP feeds.
// The shared SAP contract is inlined on purpose: only index.ts is bundled when
// the function is deployed, so a sibling import would break the deployment.
const ERP_ORIGINS = ["BANCO", "CLIENTES", "COLOCACIONES"] as const;
function sapRecords(input: unknown) {
  const payload = input as Record<string, unknown>;
  const cutoff = String(payload?.cutoff ?? "");
  const date = new Date(cutoff + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(cutoff) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== cutoff
  )
    throw new Error("Fecha de corte inválida.");
  const feeds = payload.sources as Record<string, unknown>;
  const counts = payload.counts as Record<string, unknown>;
  if (
    !feeds ||
    !counts ||
    Object.keys(feeds).some(
      (k) => !ERP_ORIGINS.includes(k as (typeof ERP_ORIGINS)[number]),
    )
  )
    throw new Error(
      "Se requieren exactamente BANCO, CLIENTES y COLOCACIONES. SAP no envía MANUAL.",
    );
  let index = 0;
  const seen = new Set<string>();
  const rows = ERP_ORIGINS.flatMap((origin) => {
    const feed = feeds[origin];
    if (!Array.isArray(feed) || counts[origin] !== feed.length)
      throw new Error(
        "Entrega incompleta: verifica el total de " + origin + ".",
      );
    if (origin === "BANCO" && feed.length === 0)
      throw new Error(
        "La entrega no contiene los movimientos BANCO completos.",
      );
    return feed.map((entry: Record<string, unknown>) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        typeof entry.sourceId !== "string" ||
        !entry.sourceId.trim() ||
        seen.has(origin + ":" + entry.sourceId)
      )
        throw new Error("Identificador SAP ausente o repetido.");
      seen.add(origin + ":" + entry.sourceId);
      const entityType =
        origin === "BANCO"
          ? "cash_flow"
          : origin === "CLIENTES"
            ? "invoice"
            : "investment";
      return {
        sheet: "BASE",
        row: ++index,
        entityType,
        status: "VALID",
        warnings: "",
        raw: entry,
        normalized: {
          ...entry,
          entityType,
          sourceOrigin: origin,
          sourceProfile: "BASE-ONLY-SAP-v7",
          cutoffDate: cutoff,
        },
      };
    });
  });
  if (rows.length > 20000) throw new Error("La entrega supera 20.000 filas.");
  return rows;
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Usa POST." });
  const token = Deno.env.get("SAP_IMPORT_TOKEN");
  const actor = Deno.env.get("SAP_SYNC_USER_ID");
  if (!token || token.length < 32 || !actor)
    return reply(503, { error: "Recepción SAP pendiente de configurar." });
  const digest = (s: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const [expected, actual] = await Promise.all([
    digest(token),
    digest(req.headers.get("x-sap-token") ?? ""),
  ]);
  const a = new Uint8Array(actual);
  let difference = 0;
  new Uint8Array(expected).forEach((v, i) => {
    difference |= v ^ a[i];
  });
  if (difference) return reply(401, { error: "Entrega no autorizada." });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const rpc = async (name: string, body: unknown) =>
    fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + serviceKey,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  let runKey = crypto.randomUUID();
  const log = async (status: string, code: string, counts: unknown = {}) => {
    const response = await rpc("treasury_operation", {
      p_source: "sap",
      p_key: runKey,
      p_status: status,
      p_code: code,
      p_counts: counts,
    }).catch(() => null);
    return response?.ok ?? false;
  };
  try {
    // Enforce the body limit while streaming, including requests without Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: "Falta la entrega." });
    const decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 25000000) {
        await reader.cancel();
        return reply(413, { error: "Entrega demasiado grande." });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const payload = JSON.parse(text);
    if (payload.operation) {
      const o = payload.operation;
      if (
        typeof o.runKey !== "string" ||
        !/^[a-f0-9-]{36}$/.test(o.runKey) ||
        !["running", "error"].includes(o.status) ||
        typeof o.code !== "string" ||
        !/^[A-Z_]{3,80}$/.test(o.code)
      )
        return reply(400, { error: "Estado inválido." });
      runKey = o.runKey;
      const recorded = await log(o.status, o.code);
      return reply(recorded ? 200 : 503, { recorded });
    }
    if (
      typeof payload.runKey === "string" &&
      /^[a-f0-9-]{36}$/.test(payload.runKey)
    )
      runKey = payload.runKey;
    await log("running", "DELIVERY_STARTED");
    const records = sapRecords(payload);
    const hash = Array.from(
      new Uint8Array(await digest("SAP-v7:" + JSON.stringify(records))),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const result = await fetch(
      Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/import_sap_daily",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_actor: actor,
          p_file_hash: hash,
          p_records: records,
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!result.ok) {
      await log("error", "DATABASE_REJECTED");
      return reply(422, {
        error:
          "SAP no se guardó. Revisa tipos, fechas, permisos y el contrato de datos. La BASE anterior se conserva.",
      });
    }
    const batch = await result.json();
    await log("success", "DELIVERY_CONFIRMED", payload.counts);
    return reply(200, {
      id: batch.id,
      status: batch.status,
      cutoff: batch.cutoff,
      records: batch.total_records,
    });
  } catch (e) {
    await log("error", "DELIVERY_FAILED");
    return reply(400, {
      error:
        e instanceof SyntaxError
          ? "JSON inválido."
          : e instanceof Error && e.name === "TimeoutError"
            ? "No se recibió confirmación. Consulta el historial antes de reenviar."
            : "Entrega SAP inválida. Revisa el contrato de datos.",
    });
  }
});
