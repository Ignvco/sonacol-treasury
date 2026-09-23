import { treasuryRpc } from "./decisionService";
/* ============================================================
 * Data service — single access point for treasury data.
 * Persistence layer: Enter Cloud (Postgres + RLS por rol).
 * The financial engine stays pure; this layer maps DB rows to
 * domain types and uses guarded RPCs for MANUAL mutations and their audit trail.
 * ============================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
// The generated Database type does not include treasury tables yet,
// so the client is used untyped here, contained to this data layer.

import { workingDate } from "./workingDate";
import { baseTreasuryService } from "./baseTreasuryService";
import { snapshotProjection } from "@/financial-engine/projection";
import {
  baseTreasury,
  total,
  type TreasuryRow,
} from "@/financial-engine/base-treasury";
import { amountInClp } from "@/financial-engine/currency";
import { supabase } from "@/integrations/supabase/client";
import {
  activeInvestments,
  agingBuckets,
  aggregateProjection,
  bankPositions,
  derivePayments,
  deepestDeficit,
  expectedCollections,
  expectedPayments,
  movementsBetween,
  nextDeficit,
  openingBalance,
  projectCashFlow,
  receivablesSummary,
  recentMovements,
  reconciliationRows,
} from "@/financial-engine/calculations";
import { todayISO, maskAccount } from "@/financial-engine/format";
import type {
  Bank,
  BankAccount,
  CashFlow,
  CashFlowCategory,
  CashFlowType,
  Customer,
  FxRate,
  Investment,
  Invoice,
  Payment,
  Profile,
  Projection,
  Reconciliation,
} from "@/financial-engine/types";

export interface DashboardData {
  kpis: {
    availableCash: number;
    projectedCash: number;
    expectedCollections: number;
    expectedPayments: number;
    investmentsActive: number;
    obligations: number;
    netLiquidity: number;
  };
  projection: ReturnType<typeof projectCashFlow>;
  projectionWeekly: ReturnType<typeof projectCashFlow>;
  projectionMonthly: ReturnType<typeof projectCashFlow>;
  positions: ReturnType<typeof bankPositions>;
  movements: CashFlow[];
  receivables: ReturnType<typeof receivablesSummary>;
  aging: ReturnType<typeof agingBuckets>;
  upcomingPayments: Payment[];
  deficit: ReturnType<typeof deepestDeficit>;
  nextDeficit: ReturnType<typeof nextDeficit>;
}

/** Untyped handle: the generated DB types do not include treasury tables yet. */
const db = supabase as any;

/** Read every page; Supabase's default row limit must not truncate treasury totals. */
async function readRows(
  table: string,
  configure?: (query: any) => any,
): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 499);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error)
      throw new Error(`No se pudieron cargar ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
let fxCache: {
  key: number;
  expires: number;
  promise: Promise<Record<string, number>>;
} | null = null;
async function historicalRates() {
  const bundle = await baseTreasuryService.load();
  return treasuryRpc<
    {
      id: string;
      currency: string;
      rate_to_clp: number;
      updated_at: string;
      effective_date: string;
      source: string;
    }[]
  >("treasury_fx_rates", { p_cutoff: bundle.cutoff });
}
function rateMap(): Promise<Record<string, number>> {
  const key = workingDate.version();
  if (fxCache?.key === key && fxCache.expires > Date.now())
    return fxCache.promise;
  const promise = historicalRates().then((rows) =>
    Object.fromEntries([
      ...rows.map((r) => [r.currency, Number(r.rate_to_clp)]),
      ["CLP", 1],
    ]),
  );
  fxCache = { key, expires: Date.now() + 60000, promise };
  promise.catch(() => {
    if (fxCache?.promise === promise) fxCache = null;
  });
  return promise;
}
async function convertFinancialRows(
  rows: any[],
  fields: string[],
): Promise<any[]> {
  if (!rows.some((r) => r.currency && r.currency !== "CLP")) return rows;
  const rates = await rateMap();
  return rows.map((r) => {
    const source = r.currency ?? "CLP";
    const rate = rates[source];
    if (!Number.isFinite(rate) || rate <= 0)
      throw new Error(
        `Falta una tasa válida para ${source}. No se puede consolidar en CLP.`,
      );
    const converted = { ...r, currency: "CLP" };
    for (const field of fields)
      converted[field] = amountInClp(Number(r[field] ?? 0), source, rates);
    return converted;
  });
}

/* ----------------------------- Mapping ----------------------------- */

const toInvoice = (r: any): Invoice => ({
  id: r.id,
  customerId: r.customer_id,
  document: r.document,
  issueDate: r.issue_date,
  dueDate: r.due_date,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  status: r.status,
});
const toCashFlow = (r: any): CashFlow => ({
  id: r.id,
  date: r.date,
  type: r.type,
  category: r.category,
  description: r.description,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  bankId: r.bank_id ?? "",
  status: r.status,
  origin: r.origin,
  importRecordId: r.import_record_id,
});
const toInvestment = (r: any): Investment => ({
  id: r.id,
  bankId: r.bank_id ?? "",
  type: r.type,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  startDate: r.start_date,
  endDate: r.end_date,
  rateKnown: r.rate_known !== false,
  rate: Number(r.rate ?? 0),
  estimatedInterest: Number(r.estimated_interest ?? 0),
  status: r.status,
});
const toProjection = (r: any): Projection => ({
  id: r.id,
  date: r.date,
  type: r.type,
  category: r.category,
  amount: Number(r.amount ?? 0),
  currency: r.currency,
  description: r.description,
  status: r.status,
  bankId: r.bank_id ?? undefined,
});
const toProfile = (r: any): Profile => ({
  id: r.id,
  email: r.email ?? "",
  name: r.name ?? "",
  role: r.role,
});

/* ------------------------------ Service ------------------------------ */

export const dataService = {
  /** Dashboard bundle. Accepts an optional date range (period selector). */
  async getDashboard(from?: string, to?: string): Promise<DashboardData> {
    const [banks, originalFlow, bundle] = await Promise.all([
      this.getBanks(),
      this.getMovementsFiltered({}),
      baseTreasuryService.load(),
    ]);
    const [invoices, investments] = await Promise.all([
      this.getInvoices(bundle.rows),
      this.getInvestments(bundle.rows),
    ]);
    // Legacy consolidated reports use CLP entries. Dashboard/Banks expose BASE
    // literal values and a native-currency selector without inventing FX rates.
    const base = baseTreasury(
      bundle.rows,
      bundle.links,
      bundle.cutoff,
      366,
      "CLP",
    );
    const accounts: BankAccount[] = base.positions.map((p) => ({
      id: p.key,
      bankId: banks.find((b) => b.name === p.bank)?.id ?? p.bank,
      accountNumber: p.ledger,
      currency: "CLP",
      status: "activo",
      balance: p.amount,
      reconciledBalance: 0,
      lastReconciliation: bundle.cutoff,
    }));
    const flow: CashFlow[] = base.events.map((r) => ({
      id: r.kind + ":" + r.id,
      date: r.effectiveDate,
      type: r.signed < 0 ? "expense" : "income",
      category:
        r.kind === "invoice"
          ? "collection"
          : r.kind === "investment"
            ? "investment_redemption"
            : r.signed < 0
              ? "supplier"
              : "other_income",
      description: r.description,
      amount: Math.abs(r.signed),
      currency: "CLP",
      bankId: banks.find((b) => b.name === r.bank)?.id ?? "",
      status: "proyectado",
      origin: "excel",
    }));
    const future = flow;
    const available = openingBalance(accounts);
    const invested = base.invested;

    let projection;
    let collections;
    let payments;
    if (from && to) {
      if (to < from)
        throw new Error("El fin del período debe ser posterior al inicio.");
      const days = Math.max(
        1,
        Math.round(
          (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
        ) + 1,
      );
      if (!Number.isFinite(days) || days > 366)
        throw new Error("Selecciona un período válido de hasta 366 días.");
      const carry = total(
        future
          .filter((m) => m.date < from)
          .map((m) => (m.type === "expense" ? -m.amount : m.amount)),
      );
      const projectedOpening: BankAccount[] = [
        {
          id: "opening",
          bankId: "",
          accountNumber: "",
          currency: "CLP",
          status: "activo",
          balance: available + carry,
          reconciledBalance: 0,
          lastReconciliation: bundle.cutoff,
        },
      ];
      projection = projectCashFlow(future, projectedOpening, days, from);
      collections = movementsBetween(
        future.filter(
          (m) =>
            !["conciliado", "pagado", "borrador", "cancelado"].includes(
              m.status,
            ),
        ),
        from,
        to,
        "income",
      ).reduce((a, m) => a + m.amount, 0);
      payments = movementsBetween(
        future.filter(
          (m) =>
            !["conciliado", "pagado", "borrador", "cancelado"].includes(
              m.status,
            ),
        ),
        from,
        to,
        "expense",
      ).reduce((a, m) => a + m.amount, 0);
    } else {
      const shared = snapshotProjection(bundle);
      projection = shared.daily;
      collections = shared.collections;
      payments = shared.payments;
    }

    const projectedCash =
      projection.length > 0
        ? projection[projection.length - 1].final
        : available;
    const deficit = deepestDeficit(projection);

    return {
      kpis: {
        availableCash: available,
        projectedCash,
        expectedCollections: collections,
        expectedPayments: payments,
        investmentsActive: invested,
        obligations: payments,
        netLiquidity: available + invested - payments,
      },
      projection,
      projectionWeekly: aggregateProjection(projection, "weekly"),
      projectionMonthly: aggregateProjection(projection, "monthly"),
      positions: bankPositions(
        banks,
        accounts,
        investments.filter((i) => base.investedRows.some((r) => r.id === i.id)),
      ),
      movements: recentMovements(originalFlow, 8),
      receivables: receivablesSummary(invoices, bundle.cutoff),
      aging: agingBuckets(invoices, bundle.cutoff),
      upcomingPayments: derivePayments(flow),
      deficit,
      nextDeficit: nextDeficit(projection),
    };
  },

  async getBanks(): Promise<Bank[]> {
    const bundle = await baseTreasuryService.load();
    return [...new Set(bundle.rows.map((r) => r.bank))]
      .sort()
      .map((name) => ({ id: name, name, status: "activo" }));
  },
  async getBankAccounts(): Promise<BankAccount[]> {
    const b = await baseTreasuryService.load();
    const positions = baseTreasury(b.rows, b.links, b.cutoff, 1).positions;
    const converted = await convertFinancialRows(
      positions.map((p) => ({ ...p, balance: p.amount })),
      ["balance"],
    );
    return converted.map((p) => ({
      id: p.key,
      bankId: p.bank,
      accountNumber: p.ledger,
      currency: "CLP",
      status: "activo",
      balance: p.balance,
      reconciledBalance: 0,
      lastReconciliation: b.cutoff,
    }));
  },
  async getBankPositions() {
    const [banks, accounts, investments] = await Promise.all([
      this.getBanks(),
      this.getBankAccounts(),
      this.getInvestments(),
    ]);
    return bankPositions(banks, accounts, investments);
  },
  async getCashFlow(): Promise<CashFlow[]> {
    return this.getMovementsFiltered({});
  },
  async getReconciliations() {
    const b = await baseTreasuryService.load();
    return baseTreasury(b.rows, b.links, b.cutoff, 1).positions.map((p) => ({
      id: p.key,
      bankName: p.bank,
      accountNumber: p.ledger,
      currency: p.currency,
      accountingBalance: p.amount,
      bankBalance: null,
      difference: null,
      status: "pendiente",
      cutoff: b.cutoff,
      rows: p.rows,
    }));
  },
  async getCustomers(): Promise<Customer[]> {
    const b = await baseTreasuryService.load();
    return [
      ...new Map(
        b.rows
          .filter((r) => r.kind === "invoice")
          .map((r) => {
            const n = r.normalized ?? {},
              id = String(n.rut || r.customer);
            return [
              id,
              {
                id,
                rut: String(n.rut ?? ""),
                name: r.customer,
                type: "cliente",
                status: "activo" as const,
              },
            ];
          }),
      ).values(),
    ];
  },
  async getInvoices(currentRows?: TreasuryRow[]): Promise<Invoice[]> {
    const source = currentRows ?? (await baseTreasuryService.load()).rows;
    const rows = source
      .filter((r) => r.kind === "invoice")
      .map((r) => {
        const n = r.normalized ?? {};
        return {
          id: r.id,
          customer_id: String(n.rut || r.customer),
          document: r.document,
          issue_date: n.issueDate ?? r.date,
          due_date: n.dueDate ?? r.plannedDate,
          amount: r.amount,
          currency: r.currency,
          status: r.status,
        };
      });
    return (await convertFinancialRows(rows, ["amount"])).map(toInvoice);
  },
  async getInvestments(currentRows?: TreasuryRow[]): Promise<Investment[]> {
    const source = currentRows ?? (await baseTreasuryService.load()).rows;
    const rows = source
      .filter((r) => r.kind === "investment")
      .map((r) => {
        const n = r.normalized ?? {};
        return {
          id: r.id,
          bank_id: r.bank,
          type: n.investmentType ?? "colocacion",
          amount: r.amount,
          currency: r.currency,
          start_date: n.startDate ?? r.date,
          end_date: n.endDate ?? r.plannedDate,
          rate_known: n.rateKnown !== false,
          rate: n.rate ?? 0,
          estimated_interest: r.interest,
          status: r.status,
        };
      });
    return (
      await convertFinancialRows(rows, ["amount", "estimated_interest"])
    ).map(toInvestment);
  },
  async getProjections(currentRows?: TreasuryRow[]): Promise<Projection[]> {
    const source = currentRows ?? (await baseTreasuryService.load()).rows;
    return source
      .filter((r) => r.kind === "projection")
      .map((r) => ({
        ...toProjection({
          id: r.id,
          date: r.plannedDate,
          type: r.type,
          category:
            r.normalized?.category ??
            (r.type === "expense" ? "supplier" : "other_income"),
          amount: r.amount,
          currency: r.currency,
          description: r.description,
          status: r.status,
          bank_id: r.bank,
        }),
        batchId: r.batchId,
        revision: r.revision,
        edited: r.edited,
      }));
  },
  async getPayments(): Promise<Payment[]> {
    return derivePayments(await this.getMovementsFiltered({ type: "expense" }));
  },

  async getAuditLogs(): Promise<
    {
      id: string;
      user: string;
      role: string;
      action: string;
      date: string;
      time: string;
      entity: string;
      previousValue: string;
      newValue: string;
    }[]
  > {
    const { data, error } = await db
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("No se pudo cargar el registro de auditoría.");
    return (data ?? []).map((r: any) => ({
      id: r.id,
      user: r.actor,
      role: r.role,
      action: r.action,
      date: (r.created_at ?? "").slice(0, 10),
      time: (r.created_at ?? "").slice(11, 16),
      entity: r.entity ?? "",
      previousValue: r.previous_value ?? "",
      newValue: r.new_value ?? "",
    }));
  },

  async getUsers(): Promise<Profile[]> {
    const data = await readRows("profiles");
    return (data ?? []).map(toProfile);
  },

  async getFxRates(): Promise<FxRate[]> {
    const data = await historicalRates();
    return (data ?? []).map((r: any) => ({
      id: r.id,
      currency: r.currency,
      rateToClp: Number(r.rate_to_clp),
      updatedAt: r.updated_at,
    }));
  },

  /** Movements filtered for the cash-flow module. */
  async getMovementsFiltered(filters: {
    from?: string;
    to?: string;
    bankId?: string;
    category?: CashFlowCategory;
    type?: CashFlowType;
    status?: string;
  }): Promise<CashFlow[]> {
    const b = await baseTreasuryService.load();
    const rows = b.rows
      .filter((r) => r.kind === "cash_flow" || r.kind === "projection")
      .map((r) =>
        toCashFlow({
          id: r.id,
          date: r.date,
          type: r.type,
          category:
            r.normalized?.category ??
            (r.type === "expense" ? "supplier" : "other_income"),
          description: r.description,
          amount: r.amount,
          currency: r.currency,
          bank_id: r.bank,
          status: r.status,
          origin: r.kind === "projection" ? "manual" : "excel",
          import_record_id: r.recordId,
        }),
      );
    return rows
      .filter(
        (r) =>
          (!filters.from || r.date >= filters.from) &&
          (!filters.to || r.date <= filters.to) &&
          (!filters.bankId || r.bankId === filters.bankId) &&
          (!filters.category || r.category === filters.category) &&
          (!filters.type || r.type === filters.type) &&
          (!filters.status || r.status === filters.status),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  /* ------------------------------ Mutations ------------------------------ */

  async saveProjection(
    p: Omit<Projection, "id"> & { id?: string },
    remove = false,
  ): Promise<Projection> {
    const batchId = p.batchId ?? (await baseTreasuryService.load()).batch?.id;
    if (!batchId)
      throw new Error("Carga una BASE antes de crear proyecciones.");
    const { data, error } = await db.rpc("save_daily_manual", {
      p_batch_id: batchId,
      p_id: p.id ?? null,
      p_revision: p.revision ?? null,
      p_values: {
        date: p.date,
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        description: p.description,
        category: p.category,
        status: p.status,
        bank: p.bankId ?? "Sin banco",
      },
      p_delete: remove,
    });
    if (error) throw new Error(error.message);
    workingDate.refresh();
    return { ...p, id: data.id, batchId, revision: data.revision };
  },
  async addProjection(p: Omit<Projection, "id">): Promise<Projection> {
    return this.saveProjection(p);
  },
  async updateProjectionStatus(
    p: Projection,
    status: Projection["status"],
  ): Promise<void> {
    await this.saveProjection({ ...p, status });
  },
  async deleteProjection(p: Projection): Promise<void> {
    await this.saveProjection(p, true);
  },
};
