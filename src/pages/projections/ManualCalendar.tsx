import { useState } from "react";
import type { Projection } from "@/financial-engine/types";
import { nextDate } from "@/financial-engine/base-treasury";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
export function ManualCalendar({
  items,
  date,
  canWrite,
  onEdit,
  onMove,
}: {
  items: Projection[];
  date: string;
  canWrite: boolean;
  onEdit: (p: Projection) => void;
  onMove: (p: Projection, date: string) => void;
}) {
  const [view, setView] = useState("month"),
    [anchor, setAnchor] = useState(date);
  const first = anchor.slice(0, 7) + "-01";
  const weekday =
    (new Date((view === "month" ? first : anchor) + "T12:00:00Z").getUTCDay() +
      6) %
    7;
  const start = nextDate(view === "month" ? first : anchor, -weekday);
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) =>
    nextDate(start, i),
  );
  const shift = (direction: number) => {
    if (view === "week") setAnchor(nextDate(anchor, direction * 7));
    else {
      const d = new Date(first + "T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    }
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            className="t-button-secondary"
            onClick={() => shift(-1)}
            aria-label="Periodo anterior"
          >
            ←
          </button>
          <input
            aria-label="Fecha de agenda"
            type="date"
            className="t-input"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
          />
          <button
            className="t-button-secondary"
            onClick={() => shift(1)}
            aria-label="Periodo siguiente"
          >
            →
          </button>
        </div>
        <label className="text-sm">
          Vista{" "}
          <select
            className="t-input"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="week">Semana</option>
            <option value="month">Mes</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Arrastra un movimiento para revisar el cambio de fecha antes de
        guardarlo. En móvil, toca el movimiento y edita su fecha.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((day) => (
          <div
            key={day}
            className={
              "min-h-28 rounded-xl border p-2 " +
              (day.slice(0, 7) === anchor.slice(0, 7)
                ? "bg-card"
                : "bg-sunken")
            }
            onDragOver={(e) => {
              if (canWrite) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!canWrite) return;
              const id = e.dataTransfer.getData("text/sonacol-manual");
              const p = items.find((p) => p.id === id);
              if (p && p.date !== day) onMove(p, day);
            }}
          >
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {new Date(day + "T12:00:00Z").toLocaleDateString("es-CL", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
            {items
              .filter((p) => p.date === day)
              .map((p) => (
                <button
                  key={p.id}
                  draggable={canWrite}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/sonacol-manual", p.id)
                  }
                  disabled={!canWrite}
                  onClick={() => onEdit(p)}
                  className={
                    "mb-1 w-full rounded-lg border-l-2 p-2 text-left text-xs " +
                    (p.type === "expense"
                      ? "border-rose-400 bg-rose-50"
                      : "border-brand bg-brand-soft")
                  }
                >
                  <p className="line-clamp-2 font-medium">{p.description}</p>
                  <p className="mt-1 break-words">
                    {baseNumber(p.amount)} {p.currency}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {p.status}
                  </p>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
