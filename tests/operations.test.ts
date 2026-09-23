import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractFeed, trustedUrl, syncSap } from "../scripts/sap-sync.mjs";
import {
  connectionEnv,
  fileHash,
  verifyRestore,
  backupDatabase,
} from "../scripts/database-backup.mjs";
const feed = {
  path: "Feed",
  countPath: "Feed/$count",
  snapshotField: "SnapshotId",
  signedAmount: true,
  fields: {
    sourceId: "Id",
    amount: "Amount",
    date: "Date",
    currency: { literal: "CLP" },
    bank: { literal: "Banco" },
    ledgerCode: { literal: "1101" },
  },
};
const base = "https://sap.example.test/b1s/v2/";
const entry = (id: number, amount = 100) => ({
  Id: id,
  Amount: amount,
  Date: "2026-09-19",
  SnapshotId: "2026-09-19-v1",
});
test("SAP: pagination preserves stable IDs and explicit sign; untrusted pages never receive a cookie", async () => {
  const calls: string[] = [];
  const fetcher = async (input: URL) => {
    calls.push(input.href);
    return input.pathname.endsWith("$count")
      ? new Response("2")
      : Response.json(
          input.search
            ? { value: [entry(2, -40)] }
            : { value: [entry(1)], "@odata.nextLink": "Feed?page=2" },
        );
  };
  const result = await extractFeed(
    feed,
    base,
    "B1SESSION=test",
    "2026-09-19",
    fetcher,
  );
  assert.deepEqual(
    result.rows.map((r) => [r.sourceId, r.type, r.amount]),
    [
      ["1", "income", 100],
      ["2", "expense", 40],
    ],
  );
  assert.equal(calls.length, 4);
  assert.throws(
    () => trustedUrl("https://evil.test/b1s/v2/Feed", base),
    /UNTRUSTED/,
  );
  assert.throws(() => trustedUrl("/other/path", base), /UNTRUSTED/);
});
test("SAP: truncated and changing snapshots cannot reach the receiver", async () => {
  await assert.rejects(
    extractFeed(feed, base, "cookie", "2026-09-19", async (input: URL) =>
      input.pathname.endsWith("$count")
        ? new Response("2")
        : Response.json({ value: [entry(1)] }),
    ),
    /INCOMPLETE/,
  );
  await assert.rejects(
    extractFeed(feed, base, "cookie", "2026-09-19", async (input: URL) =>
      input.pathname.endsWith("$count")
        ? new Response("2")
        : Response.json({
            value: [entry(1), { ...entry(2), SnapshotId: "other" }],
          }),
    ),
    /SNAPSHOT_CHANGED/,
  );
});
test("SAP: complete delivery is confirmed by the receiver, logs do not fabricate a success", async () => {
  const env = {
    SAP_BASE_URL: base,
    SAP_COMPANY_DB: "company",
    SAP_USERNAME: "user",
    SAP_PASSWORD: "secret",
    SAP_RECEIVER_URL: "https://receiver.test/sap",
    SAP_IMPORT_TOKEN: "token",
    SAP_CUTOFF: "2026-09-19",
  };
  const deliveries: { operation?: { status: string }; sources?: unknown }[] =
    [];
  let loggedOut = false;
  const fetcher = async (input: URL, init: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === "receiver.test") {
      const body = JSON.parse(String(init.body));
      deliveries.push(body);
      return Response.json(
        body.operation
          ? { recorded: true }
          : {
              status: "completed",
              id: "batch",
              records: 1,
              cutoff: env.SAP_CUTOFF,
            },
      );
    }
    if (url.pathname.endsWith("Login"))
      return Response.json(
        { SessionId: "test-session" },
        { headers: { "set-cookie": "ROUTEID=.node1; Path=/" } },
      );
    if (url.pathname.endsWith("Logout")) {
      loggedOut = true;
      return new Response();
    }
    const isBank = url.pathname.includes("/Feed");
    return url.pathname.endsWith("$count")
      ? new Response(isBank ? "1" : "0")
      : Response.json({ value: isBank ? [entry(1)] : [] });
  };
  const config = {
    sources: {
      BANCO: feed,
      CLIENTES: { ...feed, path: "Clients", countPath: "Clients/$count" },
      COLOCACIONES: {
        ...feed,
        path: "Investments",
        countPath: "Investments/$count",
      },
    },
  };
  const result = await syncSap(config, env, fetcher);
  assert.equal(result.records, 1);
  assert.equal(deliveries.filter((d) => d.sources).length, 1);
  assert.ok(deliveries.every((d) => d.operation?.status !== "success"));
  assert.ok(loggedOut);
});
test("backup: secrets stay in process environment and restore refuses a tampered or live target", async () => {
  const env = connectionEnv(
    "postgresql://user:p%40ss@db.example.test:5433/sonacol_restore_test?sslmode=verify-full",
  );
  assert.equal(env.PGPASSWORD, "p@ss");
  assert.equal(env.PGSSLMODE, "verify-full");
  const directory = await mkdtemp(path.join(tmpdir(), "sonacol-backup-test-"));
  const previous = process.env.DATABASE_RESTORE_URL;
  try {
    const file = path.join(directory, "copy.dump");
    await writeFile(file, "test backup");
    const manifest = path.join(directory, "copy.json");
    await writeFile(
      manifest,
      JSON.stringify({ format: 1, file: "copy.dump", sha256: "wrong" }),
    );
    await assert.rejects(verifyRestore(manifest), /HASH_MISMATCH/);
    await writeFile(
      manifest,
      JSON.stringify({
        format: 1,
        file: "copy.dump",
        sha256: await fileHash(file),
      }),
    );
    process.env.DATABASE_RESTORE_URL =
      "postgresql://user:pass@db.example.test/production";
    await assert.rejects(verifyRestore(manifest), /ISOLATED_RESTORE/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_RESTORE_URL;
    else process.env.DATABASE_RESTORE_URL = previous;
    await rm(directory, { recursive: true });
  }
});
test("backup: database dump cannot be written into the repository", async () => {
  const previous = {
    url: process.env.DATABASE_BACKUP_URL,
    dir: process.env.BACKUP_DIRECTORY,
  };
  process.env.DATABASE_BACKUP_URL =
    "postgresql://user:pass@db.example.test/prod";
  process.env.BACKUP_DIRECTORY = process.cwd() + "/dumps";
  try {
    await assert.rejects(backupDatabase(), /OUTSIDE_REPOSITORY/);
  } finally {
    for (const [key, v] of Object.entries({
      DATABASE_BACKUP_URL: previous.url,
      BACKUP_DIRECTORY: previous.dir,
    }))
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
  }
});
