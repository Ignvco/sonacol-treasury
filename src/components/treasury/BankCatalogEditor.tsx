import { useState, type FormEvent } from "react";
import type { BankControl } from "@/financial-engine/bank-control";
import type { PublicBankAccountBinding } from "@/financial-engine/bank-catalog-public";
import { bankAccountCatalogService } from "@/services/bankAccountCatalogService";

/** Authorized manager. A real number is never rendered again after submission. */
export function BankCatalogEditor({control,current,onClose,onSaved}: {
  control:BankControl; current:PublicBankAccountBinding|undefined;
  onClose:()=>void; onSaved:()=>void;
}) {
  const [number,setNumber]=useState("");
  const [evidence,setEvidence]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const save=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setBusy(true);setError("");
    try {
      await bankAccountCatalogService.save({
        company:control.company,ledger:control.ledger,currency:control.currency,
        bank:control.bank,accountNumber:number,evidenceRef:evidence,
        expectedRevision:current?.revision??null,
      });
      setNumber("");onSaved();
    } catch(err){setError(err instanceof Error?err.message:"No se pudo verificar la cuenta.");}
    finally{setBusy(false);}
  };
  return <div role="dialog" aria-modal="true" aria-label="Verificar cuenta bancaria" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
    <form onSubmit={save} className="w-full max-w-lg space-y-4 rounded-2xl border bg-card p-6 text-sm shadow-xl">
      <h3 className="text-lg font-semibold">{current?"Actualizar vínculo verificado":"Vincular cuenta bancaria"}</h3>
      <p className="text-muted-foreground">{control.company} · {control.bank} · cuenta contable {control.ledger} · {control.currency}</p>
      <p className="text-muted-foreground">El ERP identifica la cuenta contable, no necesariamente el número bancario. Verifica el número con evidencia oficial antes de guardarlo.</p>
      {current&&<p>Cuenta verificada actualmente: <strong>{current.maskedNumber}</strong> · revisión {current.revision}</p>}
      <label className="grid gap-1">Número de cuenta bancaria real (solo dígitos, espacios o guiones)
        <input className="t-input" autoComplete="off" inputMode="numeric" value={number} onChange={e=>setNumber(e.target.value)} required minLength={5} maxLength={60}/>
      </label>
      <label className="grid gap-1">Referencia verificable (cartola, certificado o comprobante)
        <input className="t-input" autoComplete="off" value={evidence} onChange={e=>setEvidence(e.target.value)} required minLength={5} maxLength={300}/>
      </label>
      <p className="text-xs text-muted-foreground">Operación disponible solo para administradores con segundo factor. La plataforma guarda auditoría y devuelve únicamente el número enmascarado.</p>
      {error&&<p role="alert" className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="t-button-secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="t-button" disabled={busy}>{busy?"Verificando…":"Guardar vinculación"}</button></div>
    </form>
  </div>;
}
