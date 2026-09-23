import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  sapRecords,
  ERP_ORIGINS,
} from "../supabase/functions/_shared/sap-contract.ts";
export function mapEntry(entry, feed, cutoff) {
  const result = {};
  for (const [target, source] of Object.entries(feed.fields ?? {}))
    result[target] =
      typeof source === "string" ? entry[source] : source?.literal;
  if (feed.signedAmount) {
    const amount = Number(result.amount);
    if (!Number.isFinite(amount) || amount === 0)
      throw new Error("INVALID_AMOUNT");
    result.type = amount < 0 ? "expense" : "income";
    result.amount = Math.abs(amount);
  } else result.amount = Number(result.amount);
  for (const key of ["date", "dueDate", "endDate", "startDate", "reportDate"])
    if (result[key]) result[key] = String(result[key]).slice(0, 10);
  result.cutoffDate = cutoff;
  if (typeof result.sourceId === "number")
    result.sourceId = String(result.sourceId);
  return result;
}
export function trustedUrl(path, base) {
  const url = new URL(path, base),
    root = new URL(base);
  if (
    url.origin !== root.origin ||
    !url.pathname.startsWith(root.pathname) ||
    url.username ||
    url.password
  )
    throw new Error("UNTRUSTED_PAGINATION");
  return url;
}
export async function extractFeed(feed, base, cookie, cutoff, fetcher = fetch) {
  if (!feed.path || !feed.countPath || !feed.fields || !feed.snapshotField)
    throw new Error("MISSING_FEED_CONFIG");
  const headers = { Cookie: cookie, Accept: "application/json" };
  const read = async (path) => {
    const r = await fetcher(trustedUrl(path, base), {
      headers,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!r.ok) throw new Error("SAP_READ_FAILED");
    return r;
  };
  const count = async () => {
    const v = (await (await read(feed.countPath)).text()).trim();
    if (!/^\d+$/.test(v) || Number(v) > 20000)
      throw new Error("INVALID_CONTROL_COUNT");
    return Number(v);
  };
  const expected = await count(),
    rows = [],
    seen = new Set();
  let path = feed.path,
    snapshot = null;
  while (path) {
    const url = trustedUrl(path, base).href;
    if (seen.has(url) || seen.size > 1000) throw new Error("PAGINATION_LOOP");
    seen.add(url);
    const body = await (await read(path)).json();
    if (!Array.isArray(body.value)) throw new Error("INVALID_FEED");
    for (const entry of body.value) {
      const v = entry[feed.snapshotField];
      if (v === undefined || v === null || String(v) === "")
        throw new Error("MISSING_SNAPSHOT");
      if (snapshot !== null && String(v) !== snapshot)
        throw new Error("SNAPSHOT_CHANGED");
      snapshot = String(v);
      rows.push(mapEntry(entry, feed, cutoff));
    }
    if (rows.length > 20000) throw new Error("TOO_MANY_ROWS");
    path = body["@odata.nextLink"] ?? body["odata.nextLink"] ?? "";
  }
  if (rows.length !== expected || (await count()) !== expected)
    throw new Error("INCOMPLETE_FEED");
  return { rows, snapshot };
}
export async function syncSap(config, env = process.env, fetcher = fetch) {
  for (const key of [
    "SAP_BASE_URL",
    "SAP_COMPANY_DB",
    "SAP_USERNAME",
    "SAP_PASSWORD",
    "SAP_RECEIVER_URL",
    "SAP_IMPORT_TOKEN",
  ])
    if (!env[key]) throw new Error("MISSING_CONFIGURATION");
  const base = new URL(
      env.SAP_BASE_URL.endsWith("/")
        ? env.SAP_BASE_URL
        : env.SAP_BASE_URL + "/",
    ),
    receiver = new URL(env.SAP_RECEIVER_URL);
  if (
    base.protocol !== "https:" ||
    receiver.protocol !== "https:" ||
    base.username ||
    base.password ||
    receiver.username ||
    receiver.password
  )
    throw new Error("HTTPS_REQUIRED");
  const cutoff =
      env.SAP_CUTOFF ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    runKey = randomUUID();
  const deliver = async (body) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetcher(receiver, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sap-token": env.SAP_IMPORT_TOKEN,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(65000),
          redirect: "error",
        });
        if (r.ok) return await r.json();
        if (r.status < 500) throw new Error("RECEIVER_REJECTED");
      } catch (e) {
        if (e.message === "RECEIVER_REJECTED" || attempt === 2) throw e;
      }
    }
    throw new Error("RECEIVER_FAILED");
  };
  const log = (status, code) =>
    deliver({ operation: { runKey, status, code } }).catch(() => undefined);
  let cookie = "";
  await log("running", "EXTRACTION_STARTED");
  try {
    const login = await fetcher(new URL("Login", base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        CompanyDB: env.SAP_COMPANY_DB,
        UserName: env.SAP_USERNAME,
        Password: env.SAP_PASSWORD,
      }),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!login.ok) throw new Error("SAP_LOGIN_FAILED");
    const body = await login.json();
    if (
      typeof body.SessionId !== "string" ||
      !/^[a-zA-Z0-9-]+$/.test(body.SessionId)
    )
      throw new Error("INVALID_SESSION");
    cookie = "B1SESSION=" + body.SessionId;
    const route = login.headers
      .get("set-cookie")
      ?.match(/(?:^|[,;]\s*)ROUTEID=([.a-zA-Z0-9_-]+)(?:;|,|$)/)?.[1];
    if (route) cookie += "; ROUTEID=" + route;
    const sources = {},
      counts = {};
    let snapshot = null;
    for (const origin of ERP_ORIGINS) {
      const f = await extractFeed(
        config.sources?.[origin] ?? {},
        base,
        cookie,
        cutoff,
        fetcher,
      );
      sources[origin] = f.rows;
      counts[origin] = f.rows.length;
      if (f.snapshot) {
        if (snapshot !== null && snapshot !== f.snapshot)
          throw new Error("SNAPSHOT_CHANGED");
        snapshot = f.snapshot;
      }
    }
    const payload = { cutoff, counts, sources };
    sapRecords(payload);
    const result = await deliver({ ...payload, runKey });
    if (result.status !== "completed") throw new Error("UNCONFIRMED_DELIVERY");
    return { id: result.id, cutoff: result.cutoff, records: result.records };
  } catch (e) {
    await log(
      "error",
      /^[A-Z_]{3,80}$/.test(e.message) ? e.message : "SYNC_FAILED",
    );
    throw new Error("SAP_SYNC_FAILED");
  } finally {
    if (cookie)
      await fetcher(new URL("Logout", base), {
        method: "POST",
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }).catch(() => undefined);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const config = JSON.parse(
      await readFile(
        process.env.SAP_MAPPING_FILE ?? "scripts/sap-mapping.example.json",
        "utf8",
      ),
    );
    console.log(JSON.stringify(await syncSap(config)));
  } catch {
    console.error(
      "SAP no confirmado. Consulta Integraciones y valida la configuración con TI.",
    );
    process.exitCode = 1;
  }
}
