import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, chmod, writeFile, readFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
export function connectionEnv(value) {
  const u = new URL(value);
  if (!["postgres:", "postgresql:"].includes(u.protocol))
    throw new Error("INVALID_DATABASE_URL");
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGSSLMODE: u.searchParams.get("sslmode") ?? "require",
  };
}
function run(command, args, env, capture = false) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, {
      env,
      stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"],
    });
    let out = "";
    if (capture)
      p.stdout.on("data", (b) => {
        out += b;
      });
    p.stderr.on("data", () => {});
    p.on("error", () => reject(new Error("POSTGRES_TOOLS_REQUIRED")));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error("POSTGRES_COMMAND_FAILED")),
    );
  });
}
export async function fileHash(file) {
  const h = createHash("sha256");
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest("hex");
}
async function operation(source, key, status, code, counts = {}) {
  const url = process.env.SUPABASE_URL,
    secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return;
  const r = await fetch(url + "/rest/v1/rpc/treasury_operation", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secret,
      apikey: secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_source: source,
      p_key: key,
      p_status: status,
      p_code: code,
      p_counts: counts,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("HEALTH_NOT_RECORDED");
}
export async function backupDatabase() {
  if (!process.env.DATABASE_BACKUP_URL || !process.env.BACKUP_DIRECTORY)
    throw new Error("MISSING_BACKUP_CONFIGURATION");
  const directory = path.resolve(process.env.BACKUP_DIRECTORY);
  if (
    directory.startsWith(process.cwd() + path.sep) ||
    directory === process.cwd()
  )
    throw new Error("BACKUP_MUST_BE_OUTSIDE_REPOSITORY");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const id = randomUUID(),
    file = path.join(
      directory,
      "sonacol-" + new Date().toISOString().replace(/[:.]/g, "-") + ".dump",
    );
  await operation("backup", id, "running", "BACKUP_STARTED");
  try {
    const env = connectionEnv(process.env.DATABASE_BACKUP_URL);
    await run(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl", "--file=" + file],
      env,
    );
    await chmod(file, 0o600);
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      file: path.basename(file),
      sha256: await fileHash(file),
      bytes: (await stat(file)).size,
    };
    await writeFile(file + ".json", JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    await operation("backup", id, "success", "BACKUP_VERIFIED", {
      bytes: manifest.bytes,
    });
    return { file, manifest: file + ".json" };
  } catch (e) {
    await operation("backup", id, "error", "BACKUP_FAILED").catch(
      () => undefined,
    );
    throw e;
  }
}
export async function verifyRestore(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.format !== 1 ||
    typeof manifest.file !== "string" ||
    path.basename(manifest.file) !== manifest.file
  )
    throw new Error("INVALID_MANIFEST");
  const file = path.join(path.dirname(manifestPath), manifest.file);
  if ((await fileHash(file)) !== manifest.sha256)
    throw new Error("BACKUP_HASH_MISMATCH");
  if (!process.env.DATABASE_RESTORE_URL)
    throw new Error("MISSING_RESTORE_TARGET");
  const target = connectionEnv(process.env.DATABASE_RESTORE_URL);
  if (!/^sonacol_restore_[a-z0-9_]+$/.test(target.PGDATABASE))
    throw new Error("ISOLATED_RESTORE_DATABASE_REQUIRED");
  // The target must already be provisioned with the same PostgreSQL/Supabase roles
  // and extensions, with no application or auth tables. Never use --clean.
  const objects = await run(
    "psql",
    [
      "-XAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select count(*) from pg_tables where schemaname in ('public','auth')",
    ],
    target,
    true,
  );
  if (Number(String(objects).trim()) !== 0)
    throw new Error("RESTORE_TARGET_NOT_EMPTY");
  const id = randomUUID();
  await operation("restore", id, "running", "RESTORE_STARTED");
  try {
    await run(
      "pg_restore",
      [
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--single-transaction",
        "--dbname=" + target.PGDATABASE,
        file,
      ],
      target,
    );
    await run(
      "psql",
      [
        "-XAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "select count(*) from public.daily_base_rows; select count(*) from public.treasury_access; select count(*) from public.treasury_scenarios; select count(*) from public.audit_logs;",
      ],
      target,
      true,
    );
    await operation("restore", id, "success", "RESTORE_VERIFIED");
    return {
      verified: true,
      database: target.PGDATABASE,
      sha256: manifest.sha256,
    };
  } catch (e) {
    await operation("restore", id, "error", "RESTORE_FAILED").catch(
      () => undefined,
    );
    throw e;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      JSON.stringify(
        process.argv[2] === "verify-restore"
          ? await verifyRestore(process.argv[3])
          : await backupDatabase(),
      ),
    );
  } catch (e) {
    console.error(
      "Respaldo/restauración no confirmado: " +
        (/^[A-Z_]+$/.test(e.message) ? e.message : "OPERATION_FAILED"),
    );
    process.exitCode = 1;
  }
}
