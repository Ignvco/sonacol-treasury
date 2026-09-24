import { useEffect, useState } from "react";
import { useAsyncData } from "@/hooks/use-async";
import { dataService } from "@/services/dataService";
import { treasuryRpc } from "@/services/decisionService";
import { useCanWrite } from "@/contexts/auth-context";
import {
  suggestMatches,
  type BankMovement,
} from "@/financial-engine/decisions";
import { total, type TreasuryRow } from "@/financial-engine/base-treasury";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
import {
  SourceBreakdown,
  baseNumber,
} from "@/components/treasury/SourceBreakdown";
import { StatementImport } from "@/components/treasury/StatementImport";
import { ReconciliationBento } from "@/components/treasury/bento/ReconciliationBento";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
interface Match {
  id: string;
  note: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  items: { amount: number; ledger_id: string | null; bank_id: string | null }[];
}
interface ReconciliationData {
  statements: {
    id: string;
    file_name: string;
    end_date: string;
    closing: number | null;
  }[];
  transactions: BankMovement[];
  ledgerAllocations: { id: string; amount: number }[];
  matches: Match[];
}
export default function Reconciliation() {
  const state = useAsyncData(() => dataService.getReconciliations());
  const [accountId, setAccountId] = useState(""),
    [version, setVersion] = useState(0),
    [importing, setImporting] = useState(false),
    [detail, setDetail] = useState<TreasuryRow[] | null>(null),
    [ledger, setLedger] = useState<Record<string, number>>({}),
    [bank, setBank] = useState<Record<string, number>>({}),
    [note, setNote] = useState(""),
    [confirm, setConfirm] = useState(false),
    [voidId, setVoidId] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canWrite = useCanWrite();
  const account =
      state.data?.find((a) => a.id === accountId) ?? state.data?.[0],
    accountKey = account
      ? JSON.stringify([account.bankName, account.accountNumber || ""])
      : "";
  const matches = useAsyncData(
    () =>
      account
        ? treasuryRpc<ReconciliationData>("treasury_reconciliation", {
            p_account: accountKey,
            p_currency: account.currency,
          })
        : Promise.resolve(null),
    [accountKey, account?.currency, version],
  );
  useEffect(() => {
    setLedger({});
    setBank({});
    setConfirm(false);
    setError("");
  }, [accountKey, account?.currency]);
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} />;
  const data = matches.data,
    suggestions =
      account && data
        ? suggestMatches(
            account.rows,
            data.transactions,
            data.ledgerAllocations,
          )
        : [];
  const ledgerSum = total(Object.values(ledger)),
    bankSum = total(Object.values(bank)),
    statement = data?.statements.find(
      (s) => s.end_date <= String(account?.cutoff),
    );
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setConfirm(false);
      setVoidId("");
      setLedger({});
      setBank({});
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  };
  const choose = (id: string, amount: number, isBank = false) => {
    const setter = isBank ? setBank : setLedger;
    setter((previous) => {
      const next = { ...previous };
      if (id in next) delete next[id];
      else next[id] = amount;
      return next;
    });
  };
  const remaining = (r: TreasuryRow) =>
    total([
      r.amount,
      -Number(data?.ledgerAllocations.find((a) => a.id === r.id)?.amount ?? 0),
    ]);
  const pendingBase = account
      ? total(account.rows.filter((r) => r.recordId).map((r) => remaining(r)))
      : 0,
    pendingBank = total(
      (data?.transactions ?? []).map((t) =>
        total([Math.abs(t.amount), -Number(t.allocated)]),
      ),
    ),
    bankTotal = total((data?.transactions ?? []).map((t) => Math.abs(t.amount))),
    matchedBank = total([bankTotal, -pendingBank]),
    matchedShare = bankTotal > 0 ? matchedBank / bankTotal : 0;
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Conciliación"
        subtitle="Cruza BANCO de BASE con una cartola bancaria independiente."
        actions={
          canWrite && account ? (
            <button
              className="t-button-primary"
              onClick={() => setImporting(true)}
            >
              Importar cartola CSV
            </button>
          ) : undefined
        }
      />
      <SectionCard
        title="Cuentas importadas de BASE"
        subtitle="Selecciona una cuenta para revisar su origen."
      >
        <DataTable
          data={state.data ?? []}
          rowKey={(a) => a.id}
          onRowClick={(a) => {
            setAccountId(a.id);
            setDetail(a.rows);
          }}
          columns={[
            { key: "bank", header: "Banco", render: (a) => a.bankName },
            {
              key: "ledger",
              header: "Cuenta contable",
              render: (a) => a.accountNumber || "Sin código",
            },
            {
              key: "amount",
              header: "Saldo BASE",
              render: (a) => baseNumber(a.accountingBalance) + " " + a.currency,
            },
            {
              key: "status",
              header: "Estado",
              render: (a) =>
                a.id === account?.id && data?.statements.length
                  ? "Cartola disponible"
                  : "Pendiente de cartola",
            },
          ]}
        />
      </SectionCard>
      {account && (
        <>
          <label className="grid gap-1 text-sm">
            Cuenta de trabajo
            <select
              className="t-input"
              value={account.id}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {state.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bankName} · {a.accountNumber || "Sin código"} ·{" "}
                  {a.currency}
                </option>
              ))}
            </select>
          </label>
          {matches.loading ? (
            <LoadingState />
          ) : matches.error ? (
            <ErrorState message={matches.error} />
          ) : (
            data && (
              <>
                <ReconciliationBento
                  bankName={account.bankName}
                  accountNumber={account.accountNumber}
                  currency={account.currency}
                  cutoff={account.cutoff}
                  accountingBalance={account.accountingBalance}
                  statement={statement}
                  pendingBase={pendingBase}
                  pendingBank={pendingBank}
                  matchedBank={matchedBank}
                  matchedShare={matchedShare}
                  movementCount={data.transactions.length}
                  suggestionCount={suggestions.length}
                  onOpenBalance={() => setDetail(account.rows)}
                />
                {!!suggestions.length && (
                  <SectionCard
                    title="Coincidencias para revisar"
                    subtitle="Ninguna coincidencia se confirma automáticamente."
                  >
                    {suggestions.slice(0, 8).map((s) => (
                      <div
                        key={s.ledger.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm"
                      >
                        <span>
                          {s.ledger.description} · {baseNumber(s.amount)} ·{" "}
                          {s.ambiguous
                            ? s.candidates.length + " posibles movimientos"
                            : s.reason}
                        </span>
                        {canWrite && !s.ambiguous && (
                          <button
                            className="t-button-secondary"
                            onClick={() => {
                              setLedger({ [s.ledger.recordId!]: s.amount });
                              setBank({ [s.candidates[0].id]: s.amount });
                              setNote(s.reason);
                            }}
                          >
                            Preparar selección
                          </button>
                        )}
                      </div>
                    ))}
                  </SectionCard>
                )}
                <div className="grid gap-5 xl:grid-cols-2">
                  <SectionCard
                    title="Contabilidad BASE"
                    subtitle="Selecciona partidas y ajusta importes para una conciliación parcial."
                  >
                    <DataTable<TreasuryRow>
                      data={account.rows.filter((r) => r.recordId)}
                      rowKey={(r) => r.id}
                      search
                      searchText={(r) => r.description + " " + r.document}
                      pageSize={6}
                      columns={[
                        {
                          key: "select",
                          header: "Elegir",
                          render: (r) => (
                            <input
                              aria-label={"Seleccionar BASE " + r.description}
                              type="checkbox"
                              disabled={!canWrite || remaining(r) <= 0}
                              checked={r.recordId! in ledger}
                              onChange={() => choose(r.recordId!, remaining(r))}
                            />
                          ),
                        },
                        {
                          key: "description",
                          header: "Movimiento",
                          render: (r) => (
                            <>
                              <p>{r.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.date} ·{" "}
                                {r.type === "expense" ? "Cargo" : "Abono"}
                              </p>
                            </>
                          ),
                          className: "!whitespace-normal",
                        },
                        {
                          key: "remaining",
                          header: "Pendiente",
                          render: (r) => baseNumber(remaining(r)),
                        },
                        {
                          key: "amount",
                          header: "Asignar",
                          render: (r) =>
                            r.recordId! in ledger ? (
                              <input
                                className="t-input w-28"
                                aria-label={"Asignar BASE " + r.description}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={ledger[r.recordId!]}
                                onChange={(e) =>
                                  setLedger({
                                    ...ledger,
                                    [r.recordId!]: Number(e.target.value),
                                  })
                                }
                              />
                            ) : null,
                        },
                      ]}
                    />
                  </SectionCard>
                  <SectionCard
                    title="Cartola bancaria"
                    subtitle="Las cargas repetidas se reconocen conservando la multiplicidad de las partidas."
                  >
                    <DataTable<BankMovement>
                      data={data.transactions}
                      rowKey={(r) => r.id}
                      search
                      searchText={(r) => r.reference + " " + r.description}
                      pageSize={6}
                      columns={[
                        {
                          key: "select",
                          header: "Elegir",
                          render: (r) => (
                            <input
                              aria-label={
                                "Seleccionar cartola " + r.description
                              }
                              type="checkbox"
                              disabled={
                                !canWrite ||
                                Math.abs(r.amount) - Number(r.allocated) <= 0
                              }
                              checked={r.id in bank}
                              onChange={() =>
                                choose(
                                  r.id,
                                  total([
                                    Math.abs(r.amount),
                                    -Number(r.allocated),
                                  ]),
                                  true,
                                )
                              }
                            />
                          ),
                        },
                        {
                          key: "description",
                          header: "Movimiento",
                          render: (r) => (
                            <>
                              <p>{r.description || r.reference}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.date} · {r.amount < 0 ? "Cargo" : "Abono"}
                              </p>
                            </>
                          ),
                          className: "!whitespace-normal",
                        },
                        {
                          key: "remaining",
                          header: "Pendiente",
                          render: (r) =>
                            baseNumber(
                              total([Math.abs(r.amount), -Number(r.allocated)]),
                            ),
                        },
                        {
                          key: "amount",
                          header: "Asignar",
                          render: (r) =>
                            r.id in bank ? (
                              <input
                                className="t-input w-28"
                                aria-label={"Asignar cartola " + r.description}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={bank[r.id]}
                                onChange={(e) =>
                                  setBank({
                                    ...bank,
                                    [r.id]: Number(e.target.value),
                                  })
                                }
                              />
                            ) : null,
                        },
                      ]}
                    />
                  </SectionCard>
                </div>
                {canWrite && (
                  <SectionCard title="Asignación preparada">
                    <p className="mb-3 text-sm">
                      BASE {baseNumber(ledgerSum)} · Cartola{" "}
                      {baseNumber(bankSum)} {account.currency}
                    </p>
                    <label className="grid gap-1 text-sm">
                      Motivo de la conciliación
                      <input
                        className="t-input"
                        minLength={3}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <button
                      className="t-button-primary mt-3"
                      disabled={
                        ledgerSum <= 0 ||
                        Math.abs(ledgerSum - bankSum) > 0.005 ||
                        note.trim().length < 3 ||
                        busy
                      }
                      onClick={() => setConfirm(true)}
                    >
                      Revisar conciliación
                    </button>
                  </SectionCard>
                )}
                <SectionCard title="Historial de conciliaciones">
                  <DataTable<Match>
                    data={data.matches}
                    rowKey={(m) => m.id}
                    columns={[
                      {
                        key: "created_at",
                        header: "Fecha",
                        render: (m) =>
                          new Date(m.created_at).toLocaleString("es-CL"),
                      },
                      {
                        key: "note",
                        header: "Motivo",
                        className: "!whitespace-normal",
                      },
                      {
                        key: "amount",
                        header: "Asignado",
                        render: (m) =>
                          baseNumber(
                            total(
                              m.items
                                .filter((i) => i.ledger_id)
                                .map((i) => Number(i.amount)),
                            ),
                          ),
                      },
                      {
                        key: "status",
                        header: "Estado",
                        render: (m) =>
                          m.voided_at
                            ? "Revertida · " + m.void_reason
                            : "Confirmada",
                      },
                    ]}
                    actions={(m) =>
                      canWrite && !m.voided_at ? (
                        <button
                          className="t-button-secondary"
                          onClick={() => {
                            setVoidId(m.id);
                            setReason("");
                            setError("");
                          }}
                        >
                          Revertir
                        </button>
                      ) : null
                    }
                  />
                </SectionCard>
              </>
            )
          )}
        </>
      )}
      {detail && (
        <SourceBreakdown
          title="Saldo BASE y su origen"
          rows={detail}
          onClose={() => setDetail(null)}
        />
      )}
      {importing && account && (
        <StatementImport
          account={accountKey}
          currency={account.currency}
          onClose={() => setImporting(false)}
          onSaved={() => {
            setImporting(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
      <Dialog
        open={confirm || !!voidId}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setConfirm(false);
            setVoidId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {voidId ? "Revertir conciliación" : "Confirmar conciliación"}
            </DialogTitle>
            <DialogDescription>
              {voidId
                ? "Los importes vuelven a estar disponibles y la auditoría conserva la operación."
                : `${Object.keys(ledger).length} partidas BASE y ${Object.keys(bank).length} movimientos bancarios por ${baseNumber(ledgerSum)} ${account?.currency}.`}
            </DialogDescription>
          </DialogHeader>
          {voidId ? (
            <label className="grid gap-1 text-sm">
              Motivo de reversa
              <textarea
                className="t-input"
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          ) : (
            <p className="text-sm">{note}</p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <button
            className="t-button-primary"
            disabled={busy || (!!voidId && reason.trim().length < 5)}
            onClick={() =>
              void run(() =>
                voidId
                  ? treasuryRpc("treasury_void_match", {
                      p_id: voidId,
                      p_reason: reason,
                    })
                  : treasuryRpc("treasury_confirm_match", {
                      p_batch: account?.rows[0]?.batchId,
                      p_account: accountKey,
                      p_currency: account?.currency,
                      p_ledger: Object.entries(ledger).map(([id, amount]) => ({
                        id,
                        amount,
                      })),
                      p_bank: Object.entries(bank).map(([id, amount]) => ({
                        id,
                        amount,
                      })),
                      p_note: note,
                    }),
              )
            }
          >
            Confirmar
          </button>
        </DialogContent>
      </Dialog>
      {error && !confirm && !voidId && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
