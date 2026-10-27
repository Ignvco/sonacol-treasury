/** PATCH 08. Read-only bridge: ERP identity is additional evidence, never a
 * replacement for the existing reconciliation account key [bank, ledger]. */
import { resolvePublicBankAccount, type PublicBankAccountBinding } from "./bank-catalog-public";

export interface ReconciliationAccountSource {
  bankName: string;
  /** This is the ERP accounting ledger, NOT a physical bank number. */
  accountNumber: string;
  currency: string;
  rows: readonly { normalized?: Record<string, unknown> }[];
}
export interface ReconciliationCatalog {
  installed: boolean;
  bindings: readonly PublicBankAccountBinding[];
}
export type ReconciliationIdentityState =
  | "catalog_not_installed" | "legacy_base" | "verified" | "unmapped"
  | "bank_mismatch" | "ambiguous_company";
export interface ReconciliationIdentity {
  state: ReconciliationIdentityState;
  legacyAccountKey: string;
  company: string | null;
  maskedNumber: string | null;
  revision: number | null;
  mayWrite: boolean;
  issue: string;
  fingerprint: string;
}

export function reconciliationLegacyKey(bankName: string, ledger: string): string {
  // Historical persisted account key: do not normalize, mask or replace.
  return JSON.stringify([bankName, ledger]);
}

/** No full physical number is accepted or returned by this adapter. */
export function reconcileBankIdentity(
  account: ReconciliationAccountSource,
  catalog: ReconciliationCatalog,
): ReconciliationIdentity {
  const legacyAccountKey = reconciliationLegacyKey(account.bankName, account.accountNumber);
  const erpRows = account.rows.filter(r => r.normalized?.sourceProfile === "ERP-RAW-v1" &&
    (r.normalized?.recordRole === "bank_opening" || r.normalized?.recordRole === "bank_movement"));
  const companies = new Set(erpRows.map(r => String(r.normalized?.company ?? "").trim()));
  const company = companies.size === 1 && !companies.has("") ? [...companies][0] : null;
  let state: ReconciliationIdentityState;
  let maskedNumber: string | null = null;
  let revision: number | null = null;
  let mayWrite = false;
  let issue = "";

  if (!catalog.installed) {
    state = "catalog_not_installed";
    mayWrite = true; // Preserve legacy operation until reviewed catalog SQL is installed.
    issue = "Catálogo bancario aún no instalado: conciliación heredada por banco y cuenta contable. No equivale a identidad bancaria verificada.";
  } else if (!erpRows.length) {
    state = "legacy_base";
    mayWrite = true; // A non-ERP legacy workbook cannot claim ERP mapping.
    issue = "BASE histórica sin identidad ERP: se conserva la conciliación heredada, sin número bancario verificado.";
  } else if (companies.size !== 1 || company === null) {
    state = "ambiguous_company";
    issue = "La cobertura ERP mezcla empresas o no declara una empresa inequívoca para esta cuenta. Revisa antes de registrar nuevas conciliaciones.";
  } else {
    // The catalog publicly exposes only a masked account number and revision.
    const mapping = resolvePublicBankAccount({
      company, ledger: account.accountNumber, currency: account.currency, bank: account.bankName,
    }, catalog.bindings);
    if (mapping.state === "verified") {
      const record = catalog.bindings.find(b => b.company.trim() === company &&
        b.ledger.trim() === account.accountNumber.trim() && b.currency.trim().toUpperCase() === account.currency.trim().toUpperCase());
      if (!record) throw new Error("Identidad bancaria sin revisión verificable.");
      state = "verified";
      maskedNumber = mapping.maskedNumber;
      revision = record.revision;
      mayWrite = true;
      issue = "Cuenta bancaria verificada. Las cartolas y conciliaciones conservan su clave histórica contable; el número real no se incorpora a ella.";
    } else if (mapping.state === "bank_mismatch") {
      state = "bank_mismatch";
      issue = mapping.issue;
    } else {
      state = "unmapped";
      issue = mapping.issue;
    }
  }
  return {
    state, legacyAccountKey, company, maskedNumber, revision, mayWrite, issue,
    // A changed catalog version cannot silently authorize an in-progress operation.
    fingerprint: JSON.stringify([legacyAccountKey, account.currency, state, company, maskedNumber, revision]),
  };
}

export function assertSameReconciliationIdentity(
  expected: ReconciliationIdentity,
  account: ReconciliationAccountSource,
  currentCatalog: ReconciliationCatalog,
): void {
  const current = reconcileBankIdentity(account, currentCatalog);
  if (!expected.mayWrite || !current.mayWrite)
    throw new Error("Cuenta bancaria sin validación suficiente para registrar nuevas operaciones. Revisa la vinculación en Saldos bancarios.");
  if (current.fingerprint !== expected.fingerprint)
    throw new Error("La vinculación bancaria cambió durante la revisión. Actualiza la pantalla y vuelve a comprobar la cuenta.");
}
