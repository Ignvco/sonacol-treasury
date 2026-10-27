/** Verified ERP ledger ↔ real bank-account mapping. Never infer from bank label. */
import { accountKey, type AccountIdentity } from "./financial-contract-core";

export interface VerifiedBankAccountBinding extends AccountIdentity {
  /** As stated in the ERP bank opening; aliases must be reviewed separately. */
  bank: string;
  /** Text, not number: leading zeroes are significant. Stored only in a controlled catalog. */
  accountNumber: string;
  evidenceRef: string;
  verifiedBy: string;
  verifiedAt: string;
}
export type BankAccountResolution =
  | { state: "catalog_absent" | "unmapped"; maskedNumber: null; issue: string }
  | { state: "verified"; maskedNumber: string; issue: null }
  | { state: "bank_mismatch"; maskedNumber: null; issue: string };

const bankName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();

/** Normalizes separators only. Never strips zeroes or converts an account to Number. */
export function canonicalBankAccountNumber(input: string): string {
  if (typeof input !== "string" || !/^[0-9][0-9 -]*[0-9]$/.test(input.trim()))
    throw new Error("Número de cuenta bancaria inválido; ingresar como texto y revisar evidencia.");
  const number = input.trim().replace(/[ -]/g, "");
  if (number.length < 5 || number.length > 30)
    throw new Error("Longitud del número de cuenta bancaria inválida.");
  return number;
}
export function maskedBankAccountNumber(number: string): string {
  return `•••• ${canonicalBankAccountNumber(number).slice(-4)}`;
}

/** Reject contradictory assignments before using any of the supplied mappings. */
export function verifyBankAccountBindings(bindings: readonly VerifiedBankAccountBinding[]): Map<string, VerifiedBankAccountBinding> {
  const byLedger = new Map<string, VerifiedBankAccountBinding>();
  const byAccount = new Map<string, string>();
  for (const b of bindings) {
    const ledgerKey = accountKey(b);
    if (!b.bank?.trim() || !b.evidenceRef?.trim() || !b.verifiedBy?.trim() ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(b.verifiedAt) ||
      !Number.isFinite(Date.parse(b.verifiedAt)))
      throw new Error("Vinculación bancaria sin banco, evidencia o verificación trazable.");
    const number = canonicalBankAccountNumber(b.accountNumber);
    if (byLedger.has(ledgerKey))
      throw new Error("Una misma cuenta contable y moneda tiene vinculaciones bancarias repetidas.");
    // An account cannot silently feed two ERP ledgers within the same company/currency.
    const physicalKey = JSON.stringify([b.company.trim(), bankName(b.bank), number, b.currency.trim().toUpperCase()]);
    if (byAccount.has(physicalKey) && byAccount.get(physicalKey) !== ledgerKey)
      throw new Error("Número bancario asignado a dos cuentas contables; requiere revisión explícita.");
    byAccount.set(physicalKey, ledgerKey);
    byLedger.set(ledgerKey, { ...b, accountNumber: number });
  }
  return byLedger;
}

/** Never pretends ERP contains a physical account number when it only has a ledger. */
export function resolveBankAccount(
  identity: AccountIdentity & {bank: string},
  bindings: readonly VerifiedBankAccountBinding[],
): BankAccountResolution {
  if (bindings.length === 0) return {
    state: "catalog_absent", maskedNumber: null,
    issue: "Número de cuenta bancaria aún no vinculado; ERP identifica solo la cuenta contable.",
  };
  const byLedger = verifyBankAccountBindings(bindings);
  const b = byLedger.get(accountKey(identity));
  if (!b) return { state: "unmapped", maskedNumber: null, issue: "Cuenta contable sin número bancario verificado." };
  if (bankName(b.bank) !== bankName(identity.bank)) return {
    state: "bank_mismatch", maskedNumber: null,
    issue: "El banco del ERP no coincide con la vinculación verificada de la cuenta.",
  };
  return { state: "verified", maskedNumber: maskedBankAccountNumber(b.accountNumber), issue: null };
}
