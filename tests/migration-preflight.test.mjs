import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMigrations, unwrapSnapshot } from "../scripts/treasury-migration-preflight.mjs";

const local = [
  {version: "20260921000000", name: "20260921000000_previous.sql"},
  {version: "20261014000000000", name: "20261014000000000_monthly_incremental_erp.sql"},
  {version: "20261025034359", name: "20261025034359_protect_treasury_work.sql"},
];
const live = () => ({
  history: [{ version: "20260921000000", name: "previous" }],
  tables: ["erp_bank_postings", "erp_monthly_openings", "erp_import_runs"].map((name) => ({name, rls:true})),
  columns: [{table:"erp_monthly_openings",name:"opening",type:"numeric"}],
  functions: ["excel_deletion_plan_before_work_guard", "delete_excel_imports_before_work_guard", "treasury_audit_plan_row"].map((name) => ({name})),
  triggers: [
    {table:"daily_manual",name:"treasury_manual_version"},
    {table:"treasury_manual_details",name:"treasury_manual_details_version"},
    {table:"daily_forecast_links",name:"treasury_forecast_link_version"},
  ],
});

test("history can be missing even though SQL anchors exist; block automatic reconciliation", () => {
  const r = analyzeMigrations(local, live());
  assert.equal(r.status, "BLOQUEADO_PARA_MIGRACIONES");
  assert.equal(r.counts.unrecorded, 2);
  assert.equal(r.missingSchemaReferences.length, 0);
  assert.equal(r.migrationEvidence[1].conclusion, "SIN_HISTORIAL_CON_INDICIOS_SQL");
  assert.match(r.decision, /NO ejecutar db push/);
});
test("missing objects in unrecorded migration cannot be interpreted as safely unapplied", () => {
  const s = live(); s.tables = s.tables.filter((t) => t.name !== "erp_bank_postings");
  const r = analyzeMigrations(local, s);
  assert.equal(r.status, "BLOQUEADO_PARA_MIGRACIONES");
  assert.ok(r.missingSchemaReferences.some((e) => e.references.includes("table.erp_bank_postings")));
});
test("recorded migration but missing anchor is still unsafe", () => {
  const s = live(); s.history.push({version: "20261014000000000"},{version:"20261025034359"});
  s.triggers = s.triggers.filter((t) => t.name !== "treasury_manual_version");
  const r = analyzeMigrations(local, s);
  assert.equal(r.status, "BLOQUEADO_PARA_MIGRACIONES");
  assert.equal(r.migrationEvidence[2].conclusion, "HISTORIAL_CON_REFERENCIAS_AUSENTES");
});
test("missing local migration or disabled RLS are blockers", () => {
  const s = live(); s.history.push({version: "20261014000000000"},{version:"20261025034359"},{version:"99999999999999"});
  s.tables[0].rls = false;
  const r = analyzeMigrations(local, s);
  assert.equal(r.counts.orphanHistory, 1);
  assert.deepEqual(r.security.rlsDisabled,["erp_bank_postings"]);
  assert.equal(r.status, "BLOQUEADO_PARA_MIGRACIONES");
});
test("full catalog anchors are indicative, not automatic repair authorization", () => {
  const s = live(); s.history.push({version: "20261014000000000"},{version:"20261025034359"});
  const r = analyzeMigrations(local,s);
  assert.equal(r.status,"REVISION_MANUAL_OBLIGATORIA");
  assert.match(r.decision,/migration repair/);
});
test("snapshot malformed/missing required sections rejected; SQL editor wrapper supported", () => {
  assert.deepEqual(unwrapSnapshot([{snapshot:live()}]),live());
  assert.deepEqual(unwrapSnapshot({snapshot:JSON.stringify(live())}),live());
  assert.throws(() => unwrapSnapshot({history:[]}),/falta arreglo/);
});
test("financial monthly opening must be numeric", () => {
  const s = live(); s.columns[0].type = "double precision";
  assert.equal(analyzeMigrations(local,s).security.unexpectedOpeningType,"double precision");
});
