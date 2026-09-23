import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { cutoffWorkbook } from "./helpers/cutoff-workbook";
import { decisionDb, query } from "./helpers/decision-db";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { importFileHash } from "../src/import-engine/file-hash";
import { importCutoffIssue } from "../src/import-engine/cutoff";
import { snapshotRows, type RawSnapshot } from "../src/financial-engine/snapshot";
import { snapshotProjection } from "../src/financial-engine/projection";

test("selected cutoff persists atomically; repeats do not duplicate cash and historical dates remain frozen", async () => {
  const db = await decisionDb();
  try {
    const bytes = XLSX.write(cutoffWorkbook(), { bookType: "xlsm", type: "array" });
    const sheets = await parseWorkbook(bytes);
    const source = (cutoffDate: string) => {
      const options = { BASE: { cutoffDate } };
      const summary = processWorkbook(sheets, undefined, options);
      assert.equal(importCutoffIssue(summary), null);
      return { records: JSON.stringify(summary.records), hash: importFileHash(bytes, options) };
    };
    const a = source("2026-09-22"), b = source("2026-09-23");
    const stale = await query(db, "select compare_daily_base($1::jsonb) s", [a.records]);
    await assert.rejects(query(db, "select import_daily_base($1,$2,$3::jsonb,$4,$5::int[]) s", ["BASE.xlsm", b.hash, b.records, stale.revision, []]), /vista previa/);
    assert.equal((await db.query("select * from daily_base_batches")).rows.length, 0);
    const commit = async (data: typeof a) => {
      const p = await query(db, "select compare_daily_base($1::jsonb) s", [data.records]);
      return query(db, "select import_daily_base($1,$2,$3::jsonb,$4,$5::int[]) s", ["BASE.xlsm", data.hash, data.records, p.revision, []]);
    };
    const first = await commit(a);
    assert.equal(first.cutoff, "2026-09-22");
    assert.equal((await commit(a)).id, first.id);
    assert.equal((await db.query("select * from daily_base_batches")).rows.length, 1);
    const second = await commit(b);
    assert.notEqual(second.id, first.id);
    for (const [id, cutoff] of [[first.id, "2026-09-22"], [second.id, "2026-09-23"]]) {
      const snapshot: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [id]);
      assert.equal(snapshot.batch!.cutoff, cutoff);
      const rows = snapshotRows(snapshot);
      const invoice = rows.find((r) => r.kind === "invoice")!;
      assert.equal(invoice.normalized!.dueDate, "2026-09-23");
      assert.equal(invoice.plannedDate, "2026-09-24");
      const model = snapshotProjection({ rows, links: snapshot.links, cutoff });
      assert.equal(model.available, 100);
      assert.equal(model.projected, 350);
      assert.equal(model.daily.find((d) => d.date === "2026-09-24")!.income, 300);
      if (cutoff === "2026-09-22") {
        assert.equal(model.daily[0].date, "2026-09-23");
        assert.equal(model.daily[0].variation, 0);
        assert.equal(model.daily[0].final, 100);
      }
    }
  } finally { await db.close(); }
});
