import { useEffect, useMemo, useState } from "react";
import { InvestmentMaturities } from "@/components/treasury/InvestmentMaturities";
import { InvestmentCalendar } from "@/components/treasury/InvestmentCalendar";
import { investmentCalendar, maturityDays } from "@/financial-engine/investment-maturities";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { Link } from "react-router-dom";
import { CalendarClock, CalendarRange, Percent, PiggyBank, Wallet } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { BentoStats } from "@/components/treasury/bento/BentoStats";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { LoadingState, ErrorState, EmptyState, NoBaseState } from "@/components/treasury/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrency } from "@/contexts/currency-context";
import {
  INVESTMENT_STATUS_LABEL,
  INVESTMENT_TYPE_LABEL,
  type Investment,
} from "@/financial-engine/types";
import { formatDateMedium, formatDateShort } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

export default function Investments() {
  const { data: investments, loading, error } = useAsyncData(() => dataService.getInvestments(), []);
  const { data: banks } = useAsyncData(() => dataService.getBanks(), []);
  const { data: dashboard } = useAsyncData(() => dataService.getDashboard(), []);
  const { data: base, loading: baseLoading, error: baseError } = useAsyncData(() => baseTreasuryService.load(), []);
  const cutoff = base?.cutoff ?? "";
  const { money } = useCurrency();
  const [items, setItems] = useState<Investment[]>([]);
  const [selected, setSelected] = useState<Investment | null>(null);

  // Keep the editable portfolio in sync with the loaded seed data
  useEffect(() => {
    if (investments) setItems(investments);
  }, [investments]);

  const bankName = useMemo(() => {
    const map = new Map<string, string>();
    banks?.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [banks]);

  const schedule = useMemo(() => investmentCalendar(items, cutoff), [items, cutoff]);
  const summary = useMemo(() => {
    const active = items.filter((i) => i.status !== "rescatada");
    const dueSoon = schedule.filter(i => i.days >= 0 && i.days <= 30);
    return {
      total: active.reduce((a, i) => a + i.amount, 0),
      dueSoonAmount: dueSoon.filter(i => !i.sourceEvidence).reduce((a, i) => a + i.amount, 0),
      dueSoonCount: dueSoon.length,
      unknownInterest: active.filter((i) => i.rateKnown === false).length,
      sourceMaturities: active.some(i => i.maturityEntries !== undefined),
      interest: active.reduce((a, i) => a + i.estimatedInterest, 0),
    };
  }, [items, schedule]);

  if (loading || baseLoading) return <LoadingState />;
  if (error || baseError) return <ErrorState message={error || baseError || "No se pudo leer el corte."} />;
  if (!investments || !summary || !banks) return <NoBaseState />;

  const exportRows = items.map((i) => ({
    Tipo: INVESTMENT_TYPE_LABEL[i.type],
    Banco: bankName.get(i.bankId) ?? "—",
    Monto: i.amount,
    Inicio: formatDateMedium(i.startDate),
    Término: i.maturityEntries ? "Consultar vencimientos por asiento ERP" : formatDateMedium(i.endDate),
    "Días al corte": i.maturityEntries ? "Por asiento ERP" : maturityDays(i.endDate, cutoff) ?? "Sin fecha válida",
    Tasa: i.rateKnown === false ? "No informada" : `${i.rate}%`,
    "Interés estimado": i.rateKnown === false ? "No informado" : i.estimatedInterest,
    Estado: INVESTMENT_STATUS_LABEL[i.status],
  }));


  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Inversiones"
        subtitle="COLOCACIONES · Datos del ERP de solo lectura"
        actions={<><Link className="t-button-secondary" to="/planning">Programar rescates</Link><ExportMenu rows={exportRows} filename="inversiones" /></>}
      />

      <BentoStats
        items={[
          {
            key: "total",
            label: "Total invertido",
            valueText: money(summary.total),
            subtext: "Colocaciones + fondos mutuos vigentes",
            icon: PiggyBank,
          },
          {
            key: "dueSoon",
            label: "Por vencer (30 días)",
            valueText: summary.sourceMaturities ? `${summary.dueSoonCount} ${summary.dueSoonCount === 1 ? "fecha" : "fechas"}` : money(summary.dueSoonAmount),
            subtext:
              summary.sourceMaturities ? "Al corte seleccionado · revisar capital remanente" : summary.dueSoonCount > 0
                ? `${summary.dueSoonCount} inversiones`
                : "Sin vencimientos próximos",
            tone: summary.sourceMaturities || summary.dueSoonCount > 0 ? "warning" : "success",
            icon: CalendarClock,
          },
          {
            key: "interest",
            label: "Intereses estimados",
            valueText: summary.unknownInterest
              ? "No disponible"
              : money(summary.interest),
            subtext: summary.unknownInterest
              ? `${summary.unknownInterest} inversiones sin tasa informada`
              : "Al vencimiento",
            icon: Percent,
          },
          {
            key: "liquidity",
            label: "Liquidez disponible",
            valueText: money(dashboard?.kpis.availableCash ?? 0),
            subtext: "Caja en bancos",
            icon: Wallet,
          },
        ]}
      />

      {/* Maturity timeline */}
      <SectionCard
        title="Calendario de Vencimientos"
        subtitle="Fechas explícitas de las colocaciones"
        action={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <CalendarRange className="h-4 w-4" strokeWidth={1.8} />
          </span>
        }
      >
        <InvestmentCalendar entries={schedule} cutoff={cutoff} />
        {summary.sourceMaturities && <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">Detalle del mayor ERP</summary>
          {items.filter(i => i.maturityEntries).map(i => <InvestmentMaturities key={i.id} entries={i.maturityEntries!} cutoff={cutoff} />)}
        </details>}
      </SectionCard>

      <SectionCard title="Portafolio" bodyClassName="pt-2">
        <DataTable<Investment>
          data={items}
          rowKey={(i) => i.id}
          search
          searchText={(i) => `${INVESTMENT_TYPE_LABEL[i.type]} ${bankName.get(i.bankId) ?? ""} ${INVESTMENT_STATUS_LABEL[i.status]}`}
          pageSize={10}
          defaultSort={{ key: "end", dir: "asc" }}
          onRowClick={setSelected}
          columns={[
            {
              key: "type",
              header: "Tipo",
              sortValue: (i) => INVESTMENT_TYPE_LABEL[i.type],
              render: (i) => (
                <div className="max-w-[140px]">
                  <p className="truncate text-[13px] font-medium">{INVESTMENT_TYPE_LABEL[i.type]}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{bankName.get(i.bankId) ?? "—"}</p>
                </div>
              ),
            },
            { key: "amount", header: "Monto", align: "right", sortValue: (i) => i.amount, render: (i) => <span className="t-num font-semibold">{money(i.amount)}</span> },
            { key: "start", header: "Inicio", hideBelow: "lg", render: (i) => <span className="text-muted-foreground">{formatDateShort(i.startDate)}</span> },
            { key: "end", header: "Término", sortValue: (i) => i.endDate, render: (i) => <span className="text-muted-foreground">{i.maturityEntries ? "Ver fechas ERP" : formatDateShort(i.endDate)}</span> },
            {
              key: "days",
              header: "Días restantes",
              align: "right",
              hideBelow: "md",
              sortValue: (i) => maturityDays(i.endDate, cutoff) ?? Number.MAX_SAFE_INTEGER,
              render: (i) => {
                const d = maturityDays(i.endDate, cutoff);
                return (
                  <span className={cn("t-num text-[12px] font-semibold", d !== null && d <= 30 && d >= 0 ? "text-warning" : d !== null && d < 0 ? "text-muted-foreground" : "text-foreground")}>
                    {i.maturityEntries ? "Por asiento ERP" : d === null ? "Sin fecha válida" : i.status === "rescatada" ? "—" : d >= 0 ? d : "Vencida"}
                  </span>
                );
              },
            },
            { key: "rate", header: "Tasa", align: "right", hideBelow: "md", render: (i) => <span className="t-num text-[13px]">{i.rateKnown === false ? "No informada" : `${i.rate.toFixed(1)}%`}</span> },
            { key: "interest", header: "Interés est.", align: "right", hideBelow: "md", render: (i) => <span className="t-num text-[13px] text-muted-foreground">{i.rateKnown === false ? "No informado" : money(i.estimatedInterest)}</span> },
            { key: "status", header: "Estado", align: "center", render: (i) => <StatusBadge label={INVESTMENT_STATUS_LABEL[i.status]} /> },
          ]}
        />
      </SectionCard>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md grid-cols-1 overflow-y-auto">
          <DialogHeader className="min-w-0 pr-6">
            <DialogTitle className="text-[17px] font-semibold">Detalle de inversión</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="rounded-2xl bg-brand-soft px-4 py-3">
                <p className="t-label mb-1">{INVESTMENT_TYPE_LABEL[selected.type]}</p>
                <p className="t-kpi-value !text-[24px]">{money(selected.amount)}</p>
                <p className="text-[12px] text-muted-foreground">{bankName.get(selected.bankId)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InvestDetail label="Fecha de inicio" value={formatDateMedium(selected.startDate)} />
                <InvestDetail label="Fecha de término" value={selected.maturityEntries ? "Por asiento ERP" : formatDateMedium(selected.endDate)} />
                <InvestDetail label="Tasa anual" value={selected.rateKnown === false ? "No informada" : `${selected.rate.toFixed(1)}%`} />
                <InvestDetail label="Interés estimado" value={selected.rateKnown === false ? "No informado" : money(selected.estimatedInterest)} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <span className="text-[12px] text-muted-foreground">Estado</span>
                <StatusBadge label={INVESTMENT_STATUS_LABEL[selected.status]} />
              </div>
              <InvestmentCalendar entries={schedule.filter(e => e.investmentId === selected.id)} cutoff={cutoff} />
              <Link className="t-button-secondary whitespace-normal text-center" to="/planning">Revisar rescates y capital reservado</Link>
            </div>
          )}
        </DialogContent>
      </Dialog>


    </div>
  );
}

function InvestDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border p-3.5">
      <p className="t-label mb-1">{label}</p>
      <p className="text-[13px] font-semibold text-foreground">{value}</p>
    </div>
  );
}
