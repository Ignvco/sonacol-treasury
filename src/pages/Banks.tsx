import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsyncData } from "@/hooks/use-async";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { baseTreasury, type TreasuryRow } from "@/financial-engine/base-treasury";
import { SourceBreakdown, baseNumber } from "@/components/treasury/SourceBreakdown";
import { BentoStats } from "@/components/treasury/bento/BentoStats";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/treasury/PageHeader";
import { DataTable } from "@/components/treasury/DataTable";
import { LoadingState, ErrorState, NoBaseState } from "@/components/treasury/feedback";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { BankControlTable } from "@/components/treasury/BankControlTable";
import { bankControls } from "@/financial-engine/bank-control";
export default function Banks() {
 const {data,loading,error}=useAsyncData(()=>baseTreasuryService.load(),[]);
 const [filters,setFilters,reset]=useSavedFilters("banks-v6",{currency:"BASE",bank:""});
 const [detail,setDetail]=useState<{title:string;rows:TreasuryRow[]}|null>(null);
 if(loading)return <LoadingState/>;
 if(error)return <ErrorState message={error}/>;
 if(!data)return <NoBaseState/>;
 const model=baseTreasury(data.rows,data.links,data.cutoff,30,filters.currency,filters.bank);
 const controls=bankControls(model.cashRows.map(r=>({normalized:r.normalized??{},row:r.row}))), erp=controls.length>0;
 return <div className="t-fade-in space-y-5">
  <PageHeader title="Saldos bancarios" subtitle={"Saldo contable calculado desde "+(erp?"ERP":"BASE")+" · corte "+data.cutoff} actions={<Link to="/reconciliation" className="t-button-secondary">Conciliación con cartola</Link>}/>
  <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"><label className="grid gap-1 text-xs">Moneda<select className="t-input" value={filters.currency} onChange={e=>setFilters(f=>({...f,currency:e.target.value}))}><option value="BASE">{erp?"Moneda original · sin conversión":"Como en BASE · sin conversión"}</option>{[...new Set(data.rows.map(r=>r.currency))].map(c=><option key={c} value={c}>{c}</option>)}</select></label><label className="grid gap-1 text-xs">Banco<select className="t-input" value={filters.bank} onChange={e=>setFilters(f=>({...f,bank:e.target.value}))}><option value="">Todos</option>{[...new Set(data.rows.filter(r=>r.origin==="BANCO").map(r=>r.bank))].sort().map(b=><option key={b} value={b}>{b}</option>)}</select></label><button className="t-button-secondary" onClick={reset}>Restablecer</button></div>
  {data.warning&&<p role="alert" className="rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm text-warning">{data.warning}</p>}
  <BentoStats items={[{key:"available",label:erp?"Caja disponible · saldo inicial + cargos − abonos":"Caja disponible · suma de REAL de BANCO",valueText:baseNumber(model.available),subtext:model.cashRows.length+" filas de origen · revisa cada fila del cálculo",icon:Wallet,hint:"Ver movimientos",onClick:()=>setDetail({title:"Caja disponible desde "+(erp?"ERP":"BASE"),rows:model.cashRows})}]}/>
  {erp&&<BankControlTable records={model.cashRows.map(r=>({normalized:r.normalized??{},row:r.row}))} onAccount={c=>setDetail({title:c.bank+" · "+c.ledger,rows:model.cashRows.filter(r=>r.ledger===c.ledger&&r.currency===c.currency)})}/>}
  <section className="t-card p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Desglose por cuenta contable</h2><ExportMenu filename={erp?"saldos-erp":"saldos-base"} rows={erp?controls.map(c=>({Banco:c.bank,Cuenta:c.ledger,Moneda:c.currency,Desde:c.periodStart,Corte:c.cutoff,SaldoInicial:c.opening,Cargos:c.income,Abonos:c.expense,SaldoCalculado:c.calculated,SaldoInformado:c.reported??"No informado",Diferencia:c.difference??"No comprobable"})):model.positions.map(p=>({Banco:p.bank,CuentaContable:p.ledger,Moneda:p.currency,SaldoREAL:p.amount,Corte:data.cutoff}))}/></div>
   <DataTable data={model.positions} rowKey={p=>p.key} storageKey="banks-positions" search searchText={p=>p.bank+" "+p.ledger} pageSize={12} onRowClick={p=>setDetail({title:p.bank+" · "+p.ledger,rows:p.rows})} columns={[
    {key:"bank",header:"Banco",sortValue:p=>p.bank},{key:"ledger",header:"Cuenta contable",sortValue:p=>p.ledger},{key:"currency",header:"Moneda"},{key:"amount",header:erp?"Saldo calculado":"Saldo REAL",align:"right",render:p=>baseNumber(p.amount),sortValue:p=>p.amount}
   ]}/>
  </section>
  <p className="text-xs leading-relaxed text-muted-foreground">{erp?"La apertura proviene de SALDOS BANCOS cuando está presente. Los movimientos BANCOS se aplican como Cargo menos Abono. Las aperturas no son ingresos del período.":"La apertura ya está incluida en BANCO."} Los cobros previstos, rescates programados y movimientos MANUAL se reflejan en la caja futura. El código contable no es un número de cuenta bancaria.</p>
  {detail&&<SourceBreakdown {...detail} onClose={()=>setDetail(null)}/>}
 </div>;
}
