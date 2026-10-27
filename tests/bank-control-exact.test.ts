import test from "node:test";
import assert from "node:assert/strict";
import { bankControls, erpBankSigned } from "../src/financial-engine/bank-control";

const opening = (currency: string, amount: number | string) => ({
  sourceProfile: "ERP-RAW-v1", recordRole: "bank_opening", company: "SONACOL", ledgerCode: "511010016",
  bank: "Banco de prueba", currency, periodStart: "2026-10-01", cutoffDate: "2026-10-14",
  signedAmount: amount, amount: typeof amount === "string" ? amount.replace(/^-/, "") : Math.abs(amount), type: String(amount).startsWith("-") ? "expense" : "income",
});
const posting = (currency: string, debit: number | string, credit: number | string, signed: number | string) => ({
  sourceProfile: "ERP-RAW-v1", recordRole: "bank_movement", company: "SONACOL", ledgerCode: "511010016",
  bank: "Banco de prueba", currency, periodStart: "2026-10-01", cutoffDate: "2026-10-14",
  debe: debit, haber: credit, signedAmount: signed,
  amount: String(signed).replace(/^-/, ""), type: String(signed).startsWith("-") ? "expense" : "income",
});
const item = (normalized: Record<string, unknown>) => ({ normalized, status: "VALID" });

test("Cargo/Abono in decimal cents are exact, not binary floating point rounding", () => {
  const rows = [item(opening("CLP", "100.10")), item(posting("CLP", "0.10", "0.00", "0.10")), item(posting("CLP", "0.20", "0.00", "0.20")), item(posting("CLP", "0.00", "0.05", "-0.05"))];
  const c = bankControls(rows);
  assert.equal(c.length, 1);
  assert.equal(c[0].calculated, 100.35);
  assert.equal(c[0].income, 0.3);
  assert.equal(c[0].expense, 0.05);
  assert.deepEqual(c[0].issues, []);
});

test("native currencies remain separate even when bank and ledger names coincide", () => {
  const rows = [item(opening("CLP", 10)),item(opening("USD", 20))];
  const positions = bankControls(rows);
  assert.equal(positions.length, 2);
  assert.deepEqual(positions.map(x => [x.currency,x.calculated]), [["CLP",10],["USD",20]]);
});

test("no third decimal, no hidden rounding, and no forged ERP sign", () => {
  assert.throws(() => erpBankSigned(posting("CLP", "0.005", "0", "0.005")), /centavos exactos/);
  assert.throws(() => erpBankSigned(posting("CLP", "10", "0", "-10")), /Cargo menos Abono/);
  assert.throws(() => erpBankSigned(posting("CLP", "1", "1", "0")), /Cargo menos Abono/);
});

test("balances larger than safe minor units are explicitly rejected", () => {
  assert.throws(() => erpBankSigned(opening("CLP", "90071992547409.92")), /rango seguro/);
  assert.throws(() => bankControls([item(opening("CLP", "90071992547409.91")),item(posting("CLP","0.01","0.00","0.01"))]), /rango numérico seguro/);
});

test("reported monthly closing stays control-only; missing closing stays unknown", () => {
  const a = bankControls([item(opening("CLP", "100.00"))])[0];
  assert.equal(a.reported,null);
  assert.equal(a.difference,null);
  const b = bankControls([item({...opening("CLP", "100.00"),bankReportedClosing:"99.99"})])[0];
  assert.equal(b.difference,0.01);
  assert.match(b.issues.join(" "),/Cuenta 511010016.*saldo calculado 100.00.*informado 99.99.*diferencia 0.01/);
});
