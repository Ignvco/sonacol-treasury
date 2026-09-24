import { useMemo } from "react";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { ReceivablesBento } from "@/components/treasury/bento/ReceivablesBento";
import { DataTable } from "@/components/treasury/DataTable";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { LoadingState, ErrorState, EmptyState, NoBaseState } from "@/components/treasury/feedback";
import { useCurrency } from "@/contexts/currency-context";
import { agingBuckets, customerName, receivablesSummary } from "@/financial-engine/calculations";
import { INVOICE_STATUS_LABEL, type Invoice } from "@/financial-engine/types";
import { daysUntil, formatDateMedium, todayISO } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

export default function Receivables() {
  const { data: invoices, loading, error } = useAsyncData(() => dataService.getInvoices(), []);
  const { data: customers } = useAsyncData(() => dataService.getCustomers(), []);
  const { money } = useCurrency();

  const summary = useMemo(() => (invoices ? receivablesSummary(invoices, todayISO()) : null), [invoices]);
  const aging = useMemo(() => (invoices ? agingBuckets(invoices, todayISO()) : []), [invoices]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!invoices || !summary || !customers) return <NoBaseState />;

  const nameOf = (id: string) => customerName(customers, id);

  const exportRows = invoices
    .filter((i) => i.status !== "pagado")
    .map((i) => ({
      Cliente: nameOf(i.customerId),
      Documento: i.document,
      "Fecha emisión": formatDateMedium(i.issueDate),
      "Fecha vencimiento": formatDateMedium(i.dueDate),
      Monto: i.amount,
      "Días vencidos": Math.max(0, -daysUntil(i.dueDate)),
      Estado: INVOICE_STATUS_LABEL[i.status],
    }));

  const open = invoices.filter((i) => i.status !== "pagado");

  return (
    <div className="t-fade-in flex flex-col gap-5">
      <PageHeader
        title="Cobranzas"
        subtitle="Cartera de clientes — estado y antigüedad de saldos"
        actions={<ExportMenu rows={exportRows} filename="cuentas-por-cobrar" />}
      />

      <ReceivablesBento
        today={todayISO()}
        openCount={open.length}
        total={summary.total}
        overdue={summary.overdue}
        upcoming={summary.upcoming}
        dueSoon={summary.dueSoon}
        aging={aging}
      />

      <SectionCard title="Detalle de Cartera" subtitle="Documentos abiertos por cliente" bodyClassName="pt-2">
        <DataTable<Invoice>
          data={open}
          rowKey={(i) => i.id}
          search
          searchText={(i) => `${nameOf(i.customerId)} ${i.document} ${INVOICE_STATUS_LABEL[i.status]}`}
          pageSize={7}
          defaultSort={{ key: "dueDate", dir: "asc" }}
          columns={[
            {
              key: "customer",
              header: "Cliente",
              sortValue: (i) => nameOf(i.customerId),
              render: (i) => (
                <div className="max-w-[170px]">
                  <p className="truncate text-[13px] font-medium">{nameOf(i.customerId)}</p>
                  <p className="t-num text-[11px] text-muted-foreground">{i.document}</p>
                </div>
              ),
            },
            { key: "due", header: "Vencimiento", sortValue: (i) => i.dueDate, render: (i) => <span className="text-muted-foreground">{formatDateMedium(i.dueDate)}</span> },
            { key: "amount", header: "Monto", align: "right", sortValue: (i) => i.amount, render: (i) => <span className="t-num font-semibold">{money(i.amount)}</span> },
            {
              key: "days",
              header: "Días vencidos",
              align: "right",
              hideBelow: "md",
              sortValue: (i) => -daysUntil(i.dueDate),
              render: (i) => {
                const d = -daysUntil(i.dueDate);
                return (
                  <span className={cn("t-num text-[12px] font-semibold", d > 0 ? "text-danger" : d === 0 ? "text-warning" : "text-success")}>
                    {d > 0 ? d : "—"}
                  </span>
                );
              },
            },
            { key: "status", header: "Estado", align: "center", render: (i) => <StatusBadge label={INVOICE_STATUS_LABEL[i.status]} /> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
