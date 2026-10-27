/** SONACOL Treasury PATCH 02: read-only schema/history preflight. No network or SQL writes. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const ANCHORS = Object.freeze({
  "20260926000000000": [["function", "erp_prepare"], ["function", "erp_business_key"]],
  "20260926010000000": [["table", "treasury_business_decisions"]],
  "20260926020000000": [["function", "erp_business_entities"]],
  "20260926030000000": [["column", "treasury_business_decisions", "source_json"]],
  "20260926040000000": [["function", "erp_seed_operating_rules"]],
  // 260500/270000 replace existing function bodies via dynamic SQL; final
  // objects cannot prove those historical SQL edits happened.
  "20260926050000000": [],
  "20260927000000000": [],
  "20260928000000000": [["function", "treasury_initial_plan_preview"]],
  "20261012000000000": [["column", "daily_base_batches", "projection_engine_version"]],
  "20261012010000000": [["column", "treasury_business_decisions", "execution_json"]],
  "20261012020000000": [["function", "treasury_october_plan_preview"]],
  "20261013000000000": [["function", "treasury_refresh_review"]],
  "20261013010000000": [["function", "erp_validate_before_daily_openings"]],
  "20261014000000000": [["table", "erp_bank_postings"], ["table", "erp_monthly_openings"], ["table", "erp_import_runs"], ["column", "erp_monthly_openings", "opening"]],
  "20261025034359": [["function", "excel_deletion_plan_before_work_guard"], ["function", "delete_excel_imports_before_work_guard"], ["function", "treasury_audit_plan_row"], ["trigger", "daily_manual", "treasury_manual_version"], ["trigger", "treasury_manual_details", "treasury_manual_details_version"], ["trigger", "daily_forecast_links", "treasury_forecast_link_version"]],
});

export function readLocalMigrations(root = process.cwd()) {
  const path = join(root, "supabase", "migrations");
  const files = readdirSync(path).filter((name) => /^\d{14,17}_[a-z0-9_]+\.sql$/i.test(name)).sort();
  const migrations = files.map((name) => ({ version: name.split("_")[0], name }));
  const versions = migrations.map((m) => m.version);
  if (versions.length !== new Set(versions).size) throw new Error("Versiones locales de migración duplicadas.");
  return migrations;
}

export function unwrapSnapshot(value) {
  const v = Array.isArray(value) && value.length === 1 ? value[0] : value;
  const snapshot = v?.snapshot ?? v;
  const parsed = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  for (const prop of ["history", "tables", "columns", "functions", "triggers"]) {
    if (!Array.isArray(parsed?.[prop])) throw new Error(`Snapshot SQL inválido: falta arreglo ${prop}.`);
  }
  return parsed;
}

function anchorExists(snapshot, [kind, name, field]) {
  if (kind === "table") return snapshot.tables.some((v) => v.name === name);
  if (kind === "function") return snapshot.functions.some((v) => v.name === name);
  if (kind === "column") return snapshot.columns.some((v) => v.table === name && v.name === field);
  if (kind === "trigger") return snapshot.triggers.some((v) => v.table === name && v.name === field);
  throw new Error(`Ancla no reconocida: ${kind}`);
}

export function analyzeMigrations(local, value) {
  const snapshot = unwrapSnapshot(value);
  const localVersions = new Set(local.map((x) => x.version));
  const history = snapshot.history.map((x) => String(x.version));
  if (history.length !== new Set(history).size) throw new Error("Historial de Supabase con versiones duplicadas.");
  const recorded = new Set(history);
  const missingFromHistory = local.filter((x) => !recorded.has(x.version));
  const missingLocally = snapshot.history.filter((x) => !localVersions.has(String(x.version)));
  const migrationEvidence = local.map((m) => {
    const anchors = ANCHORS[m.version] ?? [];
    const missing = anchors.filter((anchor) => !anchorExists(snapshot, anchor));
    return {
      version: m.version,
      file: m.name,
      inHistory: recorded.has(m.version),
      referenceCount: anchors.length,
      presentReferences: anchors.length - missing.length,
      missingReferences: missing.map((x) => x.join(".")),
      conclusion: !recorded.has(m.version)
        ? missing.length ? "SIN_HISTORIAL_Y_REFERENCIAS_AUSENTES" : anchors.length ? "SIN_HISTORIAL_CON_INDICIOS_SQL" : "SIN_HISTORIAL_NO_DEMOSTRABLE"
        : missing.length ? "HISTORIAL_CON_REFERENCIAS_AUSENTES" : anchors.length ? "HISTORIAL_CON_INDICIOS_SQL" : "HISTORIAL_NO_DEMOSTRABLE",
    };
  });
  const requiredTables = ["erp_bank_postings", "erp_monthly_openings", "erp_import_runs"];
  const rlsDisabled = requiredTables.filter((name) => snapshot.tables.find((x) => x.name === name)?.rls === false);
  const missingRequired = requiredTables.filter((name) => !snapshot.tables.some((x) => x.name === name));
  const monetaryType = snapshot.columns.find((x) => x.table === "erp_monthly_openings" && x.name === "opening")?.type;
  const currencyRisk = monetaryType && !/^numeric(?:\(|$)/i.test(monetaryType) ? monetaryType : null;
  const missingReferences = migrationEvidence.filter((x) => x.missingReferences.length);
  // Even a positive catalog check is only evidence, not a cryptographic proof
  // that EVERY statement in a migration ran. Never approve history repair here.
  return {
    contract: "sonacol-migration-preflight-v1",
    status: missingFromHistory.length || missingLocally.length || missingReferences.length || rlsDisabled.length || missingRequired.length || currencyRisk
      ? "BLOQUEADO_PARA_MIGRACIONES" : "REVISION_MANUAL_OBLIGATORIA",
    counts: { local: local.length, recorded: history.length, unrecorded: missingFromHistory.length, orphanHistory: missingLocally.length },
    unrecordedMigrations: missingFromHistory.map((x) => x.name),
    historyWithoutLocalFile: missingLocally.map((x) => x.version),
    missingSchemaReferences: missingReferences.map((x) => ({ file: x.file, references: x.missingReferences })),
    unprovableFromFinalCatalog: migrationEvidence.filter((x) => x.referenceCount === 0).map((x) => x.file),
    security: { rlsDisabled, missingRequiredTables: missingRequired, unexpectedOpeningType: currencyRisk },
    migrationEvidence,
    decision: "NO ejecutar db push, migration repair, db reset ni SQL histórico contra Supabase remoto. Verificar funciones, dependencias, datos y respaldos antes de cualquier regularización manual.",
  };
}

function main(argv) {
  const help = argv.includes("--help") || argv.includes("-h");
  if (help || !argv.includes("--snapshot")) {
    console.log("Uso: node scripts/treasury-migration-preflight.mjs --snapshot /ruta/captura.json [--json]");
    console.log("Captura: ejecutar scripts/treasury-schema-snapshot.sql (SELECT de solo lectura) en psql/Supabase SQL Editor.");
    if (!help) process.exitCode = 2;
    return;
  }
  const i = argv.indexOf("--snapshot");
  if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("Falta la ruta a la captura JSON.");
  const snapshot = JSON.parse(readFileSync(resolve(argv[i + 1]), "utf8"));
  const report = analyzeMigrations(readLocalMigrations(), snapshot);
  if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`SONACOL PATCH 02 — ${report.status}`);
    console.log(`Migraciones locales: ${report.counts.local}; registradas: ${report.counts.recorded}; sin registro: ${report.counts.unrecorded}; sin archivo local: ${report.counts.orphanHistory}.`);
    for (const m of report.migrationEvidence.filter((x) => !x.inHistory || x.missingReferences.length)) {
      console.log(`- ${m.file}: ${m.conclusion} (${m.presentReferences}/${m.referenceCount} referencias verificables)`);
      if (m.missingReferences.length) console.log(`  Faltan: ${m.missingReferences.join(", ")}`);
    }
    if (report.security.rlsDisabled.length) console.log(`ALERTA RLS: ${report.security.rlsDisabled.join(", ")}`);
    if (report.security.unexpectedOpeningType) console.log(`ALERTA importe no numeric: ${report.security.unexpectedOpeningType}`);
    console.log(report.decision);
  }
  // 2 = BLOCKED; 0 = captured/reviewable; no automatic approval.
  if (report.status === "BLOQUEADO_PARA_MIGRACIONES") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(`Preflight interrumpido: ${e.message}`); process.exitCode = 2; }
}
