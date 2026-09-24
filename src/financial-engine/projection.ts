import {
  baseTreasury,
  nextDate,
  total,
  type ForecastLink,
  type TreasuryRow,
} from "./base-treasury";
import type { DailyProjection } from "./calculations";

export const PROJECTION_DEFAULTS = { horizon: 30, currency: "CLP", bank: "" };
export type ProjectionFilters = typeof PROJECTION_DEFAULTS;
/** Quick presets; the target date can be any day inside the engine limit. */
export const PROJECTION_HORIZONS = [7, 15, 30] as const;
/** The daily engine refuses to project beyond a year from the cutoff. */
export const PROJECTION_HORIZON_MAX = 366;
export const PROJECTION_CURRENCIES = [
  "CLP",
  "USD",
  "UF",
  "UTM",
  "BASE",
] as const;

/** Any whole day count the engine accepts, so a picked date is a real horizon. */
export function projectionHorizon(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= PROJECTION_HORIZON_MAX
    ? value
    : PROJECTION_DEFAULTS.horizon;
}

/** Select options for a horizon: the presets plus the exact day count in use. */
export function horizonOptions(current: number, presets: readonly number[]) {
  const options = presets.map((n) => ({
    value: String(n),
    label: `${n} días`,
  }));
  return (presets as readonly number[]).includes(current)
    ? options
    : [...options, { value: String(current), label: `${current} días` }];
}

export function projectionFilters(value: ProjectionFilters): ProjectionFilters {
  // A saved preference can never supply the accounting cutoff.
  return {
    horizon: projectionHorizon(value.horizon),
    currency: PROJECTION_CURRENCIES.some((c) => c === value.currency)
      ? value.currency
      : "CLP",
    bank: typeof value.bank === "string" ? value.bank : "",
  };
}

/** Both operational views consume this exact daily series and its closing row. */
export function snapshotProjection(
  snapshot: { rows: TreasuryRow[]; links: ForecastLink[]; cutoff: string },
  preferences: ProjectionFilters = PROJECTION_DEFAULTS,
) {
  const filters = projectionFilters(preferences);
  const model = baseTreasury(
    snapshot.rows,
    snapshot.links,
    snapshot.cutoff,
    filters.horizon,
    filters.currency,
    filters.bank,
  );
  const daily: DailyProjection[] = model.days.map((day, i) => ({
    date: day.date,
    initial: i === 0 ? model.available : model.days[i - 1].balance,
    income: day.income,
    expense: day.expense,
    final: day.balance,
    variation: total([day.income, -day.expense]),
  }));
  const closing = daily[daily.length - 1];
  return {
    ...model,
    daily,
    closing,
    projected: closing.final,
    cutoff: snapshot.cutoff,
    from: nextDate(snapshot.cutoff, 1),
    to: closing.date,
    filters,
  };
}

export type SnapshotProjection = ReturnType<typeof snapshotProjection>;
