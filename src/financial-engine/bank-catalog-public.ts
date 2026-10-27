/** Public catalog DTO: NEVER includes the bank account number in cleartext. */
import { accountKey, type AccountIdentity } from "./financial-contract-core";
import type { BankAccountResolution } from "./bank-account-identity";

export interface PublicBankAccountBinding extends AccountIdentity {
  bank: string;
  maskedNumber: string;
  verifiedAt: string;
  revision: number;
}
const bankName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();

/** A malformed RPC response must never be interpreted as a verified mapping. */
export function parsePublicBankCatalog(value: unknown): PublicBankAccountBinding[] {
  if (!Array.isArray(value)) throw new Error("El catálogo bancario no tiene el formato esperado.");
  const seen = new Set<string>();
  return value.map((v: unknown) => {
    if (!v || typeof v !== "object") throw new Error("Registro bancario inválido.");
    const x = v as Record<string, unknown>;
    if (![x.company, x.ledger, x.currency, x.bank, x.maskedNumber, x.verifiedAt].every(y => typeof y === "string") ||
      !/^•••• [0-9]{4}$/.test(String(x.maskedNumber)) ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(String(x.verifiedAt)) ||
      !Number.isFinite(Date.parse(String(x.verifiedAt))) ||
      !Number.isSafeInteger(x.revision) || Number(x.revision) < 1 || !String(x.bank).trim())
      throw new Error("Respuesta del catálogo sin verificación válida o sin enmascarar.");
    const entry = {company: String(x.company), ledger: String(x.ledger), currency: String(x.currency),
      bank: String(x.bank), maskedNumber: String(x.maskedNumber), verifiedAt: String(x.verifiedAt), revision: Number(x.revision)};
    const key = accountKey(entry);
    if (seen.has(key)) throw new Error("El catálogo declara dos vinculaciones para la misma cuenta contable.");
    seen.add(key);
    return entry;
  });
}

/** Source bank mismatch blocks the physical mapping; it does not change the cash math. */
export function resolvePublicBankAccount(
  identity: AccountIdentity & {bank:string},
  bindings: readonly PublicBankAccountBinding[],
): BankAccountResolution {
  if (!bindings.length) return {state:"catalog_absent",maskedNumber:null,
    issue:"Número de cuenta bancaria aún no vinculado; ERP identifica solo la cuenta contable."};
  const found = bindings.filter(b => accountKey(b) === accountKey(identity));
  if (!found.length) return {state:"unmapped",maskedNumber:null,issue:"Cuenta contable sin número bancario verificado."};
  if (found.length !== 1) throw new Error("Catálogo con identidades bancarias duplicadas.");
  if (bankName(found[0].bank) !== bankName(identity.bank)) return {state:"bank_mismatch",maskedNumber:null,
    issue:"El banco del ERP no coincide con la vinculación verificada de la cuenta."};
  return {state:"verified",maskedNumber:found[0].maskedNumber,issue:null};
}
