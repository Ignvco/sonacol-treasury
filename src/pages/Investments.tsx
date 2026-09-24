import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarRange, Percent, PiggyBank, Wallet, X } from "lucide-react";
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
import { daysUntil, formatDateMedium, formatDateShort } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

export default function Investments() {
  const { data: investments, loading, error } = useAsyncData(() => dataService.getInvestments(), []);
  const { data: banks } = useAsyncData(() => dataService.getBanks(), []);
  const { data: dashboard } = useAsyncData(() => dataService.getDashboard(), []);
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

  const summary = useMemo(() => {
    const active = items.filter((i) => i.status !== "rescatada");
    const dueSoon = items.filter((i) => {
      const d = daysUntil(i.endDate);
      return i.status !== "rescatada" && d >= 0 && d <= 30;
    });
    return {
      total: active.reduce((a, i) => a + i.amount, 0),
      dueSoonAmount: dueSoon.reduce((a, i) => a + i.amount, 0),
      dueSoonCount: dueSoon.length,
      unknownInterest: active.filter((i) => i.rateKnown === false).length,
      interest: active.reduce((a, i) => a + i.estimatedInterest, 0),
    };
  }, [items]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!investments || !summary || !banks) return <NoBaseState />;

  const exportRows = items.map((i) => ({
    Tipo: INVESTMENT_TYPE_LABEL[i.type],
    Banco: bankName.get(i.bankId) ?? "—",
    Monto: i.amount,
    Inicio: formatDateMedium(i.startDate),
    Término: formatDateMedium(i.endDate),
    "Días restantes": Math.max(0, daysUntil(i.endDate)),
    Tasa: i.rateKnown === false ? "No informada" : `${i.rate}%`,
    "Interés estimado": i.rateKnown === false ? "No informado" : i.estimatedInterest,
    Estado: INVESTMENT_STATUS_LABEL[i.status],
  }));

  const schedule = items.filter((i) => i.status !== "rescatada");

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Inversiones"
        subtitle="COLOCACIONES · Datos del ERP de solo lectura"
        actions={<ExportMenu rows={exportRows} filename="inversiones" />}
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
            valueText: money(summary.dueSoonAmount),
            subtext:
              summary.dueSoonCount > 0
                ? `${summary.dueSoonCount} inversiones`
                : "Sin vencimientos próximos",
            tone: summary.dueSoonCount > 0 ? "warning" : "success",
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
        subtitle="Próximos rescates y vencimientos"
        action={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <CalendarRange className="h-4 w-4" strokeWidth={1.8} />
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          {schedule.map((i) => {
            const days = daysUntil(i.endDate);
            const progress = Math.min(100, Math.max(0, 100 - (days / 180) * 100));
            const isSoon = days >= 0 && days <= 30;
            return (
              <div key={i.id} className="flex items-center gap-4">
                <div className="w-[130px] shrink-0">
                  <p className="truncate text-[12px] font-semibold text-foreground">{INVESTMENT_TYPE_LABEL[i.type]}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDateShort(i.endDate)}</p>
                </div>
                <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", isSoon ? "bg-warning-vivid" : i.status === "rescate_programado" ? "bg-info-vivid" : "bg-brand")}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="w-[150px] shrink-0 text-right">
                  <p className="t-num text-[13px] font-semibold text-foreground">{money(i.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {i.status === "rescatada" ? "Rescatada" : days >= 0 ? `${days} días restantes` : "Vencida"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Portafolio" subtitle="Detalle de inversiones vigentes" bodyClassName="pt-2">
        <DataTable<Investment>
          data={items}
          rowKey={(i) => i.id}
          search
          searchText={(i) => `${INVESTMENT_TYPE_LABEL[i.type]} ${bankName.get(i.bankId) ?? ""} ${INVESTMENT_STATUS_LABEL[i.status]}`}
          pageSize={10}
          defaultSort={{ key: "endDate", dir: "asc" }}
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
            { key: "end", header: "Término", sortValue: (i) => i.endDate, render: (i) => <span className="text-muted-foreground">{formatDateShort(i.endDate)}</span> },
            {
              key: "days",
              header: "Días restantes",
              align: "right",
              hideBelow: "md",
              sortValue: (i) => daysUntil(i.endDate),
              render: (i) => {
                const d = daysUntil(i.endDate);
                return (
                  <span className={cn("t-num text-[12px] font-semibold", d <= 30 && d >= 0 ? "text-warning" : d < 0 ? "text-muted-foreground" : "text-foreground")}>
                    {i.status === "rescatada" ? "—" : d >= 0 ? d : "Vencida"}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold">Detalle de inversión</DialogTitle>
            <button onClick={() => setSelected(null)} className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-brand-soft px-4 py-3">
                <p className="t-label mb-1">{INVESTMENT_TYPE_LABEL[selected.type]}</p>
                <p className="t-kpi-value !text-[24px]">{money(selected.amount)}</p>
                <p className="text-[12px] text-muted-foreground">{bankName.get(selected.bankId)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InvestDetail label="Fecha de inicio" value={formatDateMedium(selected.startDate)} />
                <InvestDetail label="Fecha de término" value={formatDateMedium(selected.endDate)} />
                <InvestDetail label="Tasa anual" value={selected.rateKnown === false ? "No informada" : `${selected.rate.toFixed(1)}%`} />
                <InvestDetail label="Interés estimado" value={selected.rateKnown === false ? "No informado" : money(selected.estimatedInterest)} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <span className="text-[12px] text-muted-foreground">Estado</span>
                <StatusBadge label={INVESTMENT_STATUS_LABEL[selected.status]} />
              </div>
              <p className="text-sm text-muted-foreground">COLOCACIONES proviene del ERP y es de solo lectura. Registra ajustes de planificación en Proyecciones MANUAL.</p>
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
