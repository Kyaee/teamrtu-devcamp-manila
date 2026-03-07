import type { Severity } from "@/src/design/tokens";
import type {
  CurrentConditionsResponse,
  HourlyForecastEntry,
} from "@/src/types/weather";

// ---------------------------------------------------------------------------
// Tunable thresholds — centralized for easy field adjustment
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  MONITOR: { precipProb: 40, qpfMmHr: 5 },
  PREPARE: { precipProb: 55, qpfMmHr: 12, thunderProb: 40 },
  LEAVE: { qpfMmHr: 25, thunderProb: 60, sustained3hMean: 15 },
  EVACUATE: { qpfMmHr: 40, sustained3hMean: 30, sustained6hHeavy: 3 },
} as const;

// ---------------------------------------------------------------------------
// Helpers — aggregate stats from forecast windows
// ---------------------------------------------------------------------------

type ForecastWindow = {
  meanQpf: number;
  maxQpf: number;
  meanThunder: number;
  heavyHours: number;
};

function windowStats(
  entries: HourlyForecastEntry[],
  hours: number,
): ForecastWindow {
  const slice = entries.slice(0, hours);
  if (slice.length === 0)
    return { meanQpf: 0, maxQpf: 0, meanThunder: 0, heavyHours: 0 };

  let totalQpf = 0;
  let maxQpf = 0;
  let totalThunder = 0;
  let heavyHours = 0;

  for (const h of slice) {
    const q = h.precipitation?.qpf?.quantity ?? 0;
    totalQpf += q;
    if (q > maxQpf) maxQpf = q;
    totalThunder += h.thunderstormProbability ?? 0;
    if (q >= THRESHOLDS.LEAVE.qpfMmHr) heavyHours++;
  }

  return {
    meanQpf: totalQpf / slice.length,
    maxQpf,
    meanThunder: totalThunder / slice.length,
    heavyHours,
  };
}

// ---------------------------------------------------------------------------
// Signal derivation
// ---------------------------------------------------------------------------

/**
 * Derive a flood severity signal from current conditions + hourly forecast.
 *
 * Evaluates 3-hour and 6-hour trend windows so that sustained moderate-to-heavy
 * rainfall (the primary PH urban flood driver) is weighted appropriately even
 * when the current snapshot is calm.
 */
export function deriveFloodSignal(
  current: CurrentConditionsResponse | null,
  forecast: HourlyForecastEntry[],
): Severity {
  if (!current && forecast.length === 0) return "MONITOR";

  const precipProb = current?.precipitation?.probability?.percent ?? 0;
  const qpf = current?.precipitation?.qpf?.quantity ?? 0;
  const thunderProb = current?.thunderstormProbability ?? 0;

  const win3 = windowStats(forecast, 3);
  const win6 = windowStats(forecast, 6);

  // EVACUATE: extreme current QPF with sustained heavy rain in 6h window,
  // OR the 3h mean alone indicates extreme sustained downpour.
  if (
    (qpf >= THRESHOLDS.EVACUATE.qpfMmHr &&
      win6.heavyHours >= THRESHOLDS.EVACUATE.sustained6hHeavy) ||
    win3.meanQpf >= THRESHOLDS.EVACUATE.sustained3hMean
  ) {
    return "EVACUATE";
  }

  // LEAVE: high current QPF with thunderstorm risk, OR sustained moderate
  // rainfall in the next 3 hours exceeding the 3h-mean threshold.
  if (
    (qpf >= THRESHOLDS.LEAVE.qpfMmHr &&
      thunderProb >= THRESHOLDS.LEAVE.thunderProb) ||
    win3.meanQpf >= THRESHOLDS.LEAVE.sustained3hMean ||
    (win3.maxQpf >= THRESHOLDS.LEAVE.qpfMmHr &&
      win3.meanThunder >= THRESHOLDS.LEAVE.thunderProb)
  ) {
    return "LEAVE";
  }

  // PREPARE: elevated precipitation / thunderstorm risk in current or 3h window.
  if (
    precipProb >= THRESHOLDS.PREPARE.precipProb ||
    qpf >= THRESHOLDS.PREPARE.qpfMmHr ||
    thunderProb >= THRESHOLDS.PREPARE.thunderProb ||
    win3.meanQpf >= THRESHOLDS.PREPARE.qpfMmHr ||
    win3.meanThunder >= THRESHOLDS.PREPARE.thunderProb
  ) {
    return "PREPARE";
  }

  // MONITOR: moderate rain signals.
  if (
    precipProb >= THRESHOLDS.MONITOR.precipProb ||
    qpf >= THRESHOLDS.MONITOR.qpfMmHr ||
    win6.meanQpf >= THRESHOLDS.MONITOR.qpfMmHr
  ) {
    return "MONITOR";
  }

  return "MONITOR";
}
