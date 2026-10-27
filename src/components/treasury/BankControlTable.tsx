import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useAsyncData } from "@/hooks/use-async";
import { bankAccountCatalogService } from "@/services/bankAccountCatalogService";
import { BankCatalogEditor } from "./BankCatalogEditor";
import { bankControls, type BankControlInput, type BankControl } from "@/financial-engine/bank-control";
import { baseNumber } from "./SourceBreakdown";
import type { VerifiedBankAccountBinding } from "@/financial-engine/bank-account-identity";

/** The same account equation is visible before import and on the accepted bank snapshot. */
export function BankControlTable({ records, onAccount, bindings = [], editable = false }: { records: BankControlInput[]; onAccount?: (account: BankControl) => void; bindings?: readonly VerifiedBankAccountBinding[]; editable?: boolean }) {
  const {user} = useAuth();
  const [revision,setRevision]=useState(0);
  const [editing,setEditing]=useState<BankControl|null>(null);
  const catalog=useAsyncData(()=>bankAccountCatalogService.load(),[revision]);
  const controls = bankControls(records, bindings, catalog.data?.bindings ?? []);
  const canEdit = editable && catalog.data?.installed && user?.role === "administrador" && user?.accessStatus === "approved" && user?.mfaLevel === "aal2";
  if (!controls.length) return null;
  return <section aria-label="Control bancario por cuenta" className="min-w-0 rounded-xl border p-4 text-sm">
    <h3 className="font-semibold">Saldo inicial + cargos − abonos = saldo calculado</h3>
    <p className="mt-1 text-xs text-muted-foreground">Cargo = ingreso. Abono = egreso. El saldo inicial no se cuenta como ingreso del período. Cada cuenta y moneda se calcula por separado.</p>
    <div className="mt-3 max-w-full overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["Banco / cuenta", "Período declarado", "Saldo inicial", "Cargos / ingresos", "Abonos / egresos", "Saldo calculado", "Saldo informado", "Diferencia"].map(label => <th className="whitespace-nowrap p-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {controls.map(c => <tr key={c.key} className="border-t" data-testid={`bank-control-${c.ledger}`}>
        <td className="min-w-40 p-2">{onAccount ? <button className="text-left text-brand underline" onClick={() => onAccount(c)}>{c.bank} · {c.ledger}</button> : <>{c.bank} · {c.ledger}</>}<p className="text-muted-foreground">{c.currency} · {c.movements} movimientos</p><p className="text-muted-foreground">{c.bankAccount.state === "verified" ? `Cuenta bancaria verificada: ${c.bankAccount.maskedNumber}` : "Número bancario no vinculado (identidad ERP contable)"}</p>{canEdit&&<button type="button" className="mt-1 text-brand underline" onClick={()=>setEditing(c)}>{c.bankAccount.state === "verified" ? "Reverificar vínculo" : "Vincular cuenta bancaria"}</button>}{c.issues.map(issue => <p role="alert" className="mt-1 max-w-sm text-danger" key={issue}>{issue}</p>)}</td>
        <td className="whitespace-nowrap p-2">{c.periodStart || "Por declarar"}<br />a {c.cutoff || "por declarar"}</td>
        {[c.opening, c.income, c.expense, c.calculated].map((v, i) => <td key={i} className="whitespace-nowrap p-2 text-right tabular-nums">{baseNumber(v)}</td>)}
        <td className="whitespace-nowrap p-2 text-right tabular-nums">{c.reported === null ? "No informado" : baseNumber(c.reported)}</td>
        <td className={`whitespace-nowrap p-2 text-right tabular-nums ${c.difference ? "text-danger" : ""}`}>{c.difference === null ? "No comprobable" : baseNumber(c.difference)}</td>
      </tr>)}
    </tbody></table></div>
    {controls.some(c => c.reported === null) && <p className="mt-3 text-xs text-muted-foreground">El archivo no informa saldo final para todas las cuentas. Se calcula la caja con las aperturas y movimientos; la conciliación contra un cierre informado queda pendiente.</p>}
    {catalog.error&&<p role="alert" className="mt-2 text-xs text-danger">No se pudo cargar el catálogo bancario: {catalog.error}</p>}
    {!catalog.loading&&!catalog.error&&!catalog.data?.installed&&<p className="mt-2 text-xs text-muted-foreground">El catálogo persistente aún no está instalado. La cuenta mostrada sigue siendo contable, no un número bancario verificado.</p>}
    {editing&&<BankCatalogEditor control={editing} current={catalog.data?.bindings.find(b=>b.company===editing.company&&b.ledger===editing.ledger&&b.currency===editing.currency)} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setRevision(v=>v+1);}}/>}
    <p className="mt-2 text-xs text-muted-foreground">Diferencia = calculado − informado. Un saldo informado se utiliza como control; no se suma nuevamente a la caja.</p>
  </section>;
}
