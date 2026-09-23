import { useMemo, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataTable } from "./DataTable";
import { baseNumber } from "./SourceBreakdown";
import {
  csvCells,
  parseStatement,
  statementMapping,
  type StatementMapping,
} from "@/import-engine/statement";
import { treasuryRpc } from "@/services/decisionService";
import { total } from "@/financial-engine/base-treasury";
export function StatementImport({
  account,
  currency,
  onClose,
  onSaved,
}: {
  account: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(""),
    [name, setName] = useState(""),
    [separator, setSeparator] = useState(";"),
    [locale, setLocale] = useState<"es-CL" | "en-US">("es-CL"),
    [mapping, setMapping] = useState<StatementMapping | null>(null),
    [opening, setOpening] = useState(""),
    [closing, setClosing] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const parsed = useMemo(() => {
    let cells: string[][] = [];
    try {
      if (!text) return { cells, rows: [], error: "" };
      cells = csvCells(text, separator);
      return {
        cells,
        rows: parseStatement(
          cells,
          mapping ?? statementMapping(cells[0]),
          locale,
        ),
        error: "",
      };
    } catch (e) {
      return {
        cells,
        rows: [],
        error: e instanceof Error ? e.message : "CSV inválido.",
      };
    }
  }, [text, separator, mapping, locale]);
  const activeMap =
    mapping ?? (parsed.cells[0] ? statementMapping(parsed.cells[0]) : null);
  const sum = total(parsed.rows.map((r) => r.amount));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          text,
          mapping: activeMap,
          separator,
          locale,
          opening,
          closing,
        }),
      );
      await treasuryRpc("treasury_import_statement", {
        p_name: name,
        p_hash: bytesToHex(sha256(bytes)),
        p_account: account,
        p_currency: currency,
        p_rows: parsed.rows,
        p_opening: opening === "" ? null : Number(opening),
        p_closing: closing === "" ? null : Number(closing),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar cartola independiente</DialogTitle>
          <DialogDescription>
            CSV del banco · {currency}. Se usa para conciliación y no modifica
            BASE.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1 text-sm">
          Archivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setError("");
              setReviewed(false);
              setText("");
              setName("");
              setMapping(null);
              setOpening("");
              setClosing("");
              if (f.size > 10485760) {
                setError("Máximo 10 MB.");
                return;
              }
              void f
                .text()
                .then((t) => {
                  setText(t);
                  setName(f.name);
                  setMapping(null);
                })
                .catch(() => setError("No se pudo leer el archivo."));
            }}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Separador
            <select
              className="t-input"
              value={separator}
              onChange={(e) => {
                setSeparator(e.target.value);
                setMapping(null);
                setReviewed(false);
              }}
            >
              <option value=";">Punto y coma</option>
              <option value=",">Coma</option>
              <option value={"\t"}>Tabulación</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Formato numérico
            <select
              className="t-input"
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value as "es-CL" | "en-US");
                setReviewed(false);
              }}
            >
              <option value="es-CL">1.234,56</option>
              <option value="en-US">1,234.56</option>
            </select>
          </label>
        </div>
        {activeMap && (
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries({
              date: "Fecha",
              amount: "Monto con signo",
              reference: "Referencia",
              description: "Descripción",
              charge: "Cargo",
              credit: "Abono",
            }).map(([key, label]) => (
              <label className="grid gap-1 text-xs" key={key}>
                {label}
                <select
                  className="t-input"
                  value={activeMap[key as keyof StatementMapping]}
                  onChange={(e) => {
                    setMapping({ ...activeMap, [key]: Number(e.target.value) });
                    setReviewed(false);
                  }}
                >
                  <option value={-1}>Sin asignar</option>
                  {parsed.cells[0]?.map((h, i) => (
                    <option key={i} value={i}>
                      {i + 1} · {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Monto positivo = abono; negativo = cargo. Para usar Cargo y Abono deja
          Monto sin asignar.
        </p>
        {parsed.error && (
          <p role="alert" className="text-danger">
            {parsed.error}
          </p>
        )}
        {parsed.rows.length > 0 && (
          <>
            <p className="text-sm font-medium">
              {parsed.rows.length} movimientos · neto {baseNumber(sum)}{" "}
              {currency}
            </p>
            <DataTable
              data={parsed.rows.map((r, i) => ({ ...r, id: String(i) }))}
              rowKey={(r) => r.id}
              pageSize={5}
              columns={[
                { key: "date", header: "Fecha" },
                { key: "reference", header: "Referencia" },
                {
                  key: "description",
                  header: "Descripción",
                  className: "!whitespace-normal",
                },
                {
                  key: "amount",
                  header: "Monto",
                  render: (r) => baseNumber(r.amount),
                },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">
                Saldo inicial (opcional)
                <input
                  className="t-input min-w-0"
                  type="number"
                  step="0.01"
                  value={opening}
                  onChange={(e) => {
                    setOpening(e.target.value);
                    setReviewed(false);
                  }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Saldo final (opcional)
                <input
                  className="t-input min-w-0"
                  type="number"
                  step="0.01"
                  value={closing}
                  onChange={(e) => {
                    setClosing(e.target.value);
                    setReviewed(false);
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Si informas saldos, ambos deben cuadrar con los movimientos. Sin
              ellos no se presenta un saldo bancario total.
            </p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              Revisé cuenta, moneda, fechas y sentido de los movimientos.
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            className="t-button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="t-button-primary"
            disabled={
              !reviewed || !!parsed.error || !parsed.rows.length || busy
            }
            onClick={() => void save()}
          >
            Guardar cartola
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
