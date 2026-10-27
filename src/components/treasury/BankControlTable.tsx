import { bankControls, type BankControlInput, type BankControl } from "@/financial-engine/bank-control";
import { baseNumber } from "./SourceBreakdown";
import type { VerifiedBankAccountBinding } from "@/financial-engine/bank-account-identity";

/** The same account equation is visible before import and on the accepted bank snapshot. */
export function BankControlTable({ records, onAccount, bindings = [] }: { records: BankControlInput[]; onAccount?: (account: BankControl) => void; bindings?: readonly VerifiedBankAccountBinding[] }) {
  const controls = bankControls(records, bindings);
  if (!controls.length) return null;
  return <section aria-label="Control bancario por cuenta" className="min-w-0 rounded-xl border p-4 text-sm">
    <h3 className="font-semibold">Saldo inicial + cargos − abonos = saldo calculado</h3>
    <p className="mt-1 text-xs text-muted-foreground">Cargo = ingreso. Abono = egreso. El saldo inicial no se cuenta como ingreso del período. Cada cuenta y moneda se calcula por separado.</p>
    <div className="mt-3 max-w-full overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["Banco / cuenta", "Período declarado", "Saldo inicial", "Cargos / ingresos", "Abonos / egresos", "Saldo calculado", "Saldo informado", "Diferencia"].map(label => <th className="whitespace-nowrap p-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {controls.map(c => <tr key={c.key} className="border-t" data-testid={`bank-control-${c.ledger}`}>
        <td className="min-w-40 p-2">{onAccount ? <button className="text-left text-brand underline" onClick={() => onAccount(c)}>{c.bank} · {c.ledger}</button> : <>{c.bank} · {c.ledger}</>}<p className="text-muted-foreground">{c.currency} · {c.movements} movimientos</p><p className="text-muted-foreground">{c.bankAccount.state === "verified" ? `Cuenta bancaria verificada: ${c.bankAccount.maskedNumber}` : "Número bancario no vinculado (identidad ERP contable)"}</p>{c.issues.map(issue => <p role="alert" className="mt-1 max-w-sm text-danger" key={issue}>{issue}</p>)}</td>
        <td className="whitespace-nowrap p-2">{c.periodStart || "Por declarar"}<br />a {c.cutoff || "por declarar"}</td>
        {[c.opening, c.income, c.expense, c.calculated].map((v, i) => <td key={i} className="whitespace-nowrap p-2 text-right tabular-nums">{baseNumber(v)}</td>)}
        <td className="whitespace-nowrap p-2 text-right tabular-nums">{c.reported === null ? "No informado" : baseNumber(c.reported)}</td>
        <td className={`whitespace-nowrap p-2 text-right tabular-nums ${c.difference ? "text-danger" : ""}`}>{c.difference === null ? "No comprobable" : baseNumber(c.difference)}</td>
      </tr>)}
    </tbody></table></div>
    {controls.some(c => c.reported === null) && <p className="mt-3 text-xs text-muted-foreground">El archivo no informa saldo final para todas las cuentas. Se calcula la caja con las aperturas y movimientos; la conciliación contra un cierre informado queda pendiente.</p>}
    <p className="mt-2 text-xs text-muted-foreground">Diferencia = calculado − informado. Un saldo informado se utiliza como control; no se suma nuevamente a la caja.</p>
  </section>;
}
