import type { Severity } from "@/src/design/tokens";
import type {
  CurrentConditionsResponse,
  HourlyForecastEntry,
} from "@/src/types/weather";

// Tunable thresholds for flood signal derivation
const THRESHOLDS = {
  MONITOR: { precipProb: 40, qpfMmHr: 5 },
  PREPARE: { precipProb: 60, qpfMmHr: 15, thunderProb: 50 },
  LEAVE: { qpfMmHr: 30, thunderProb: 70 },
  EVACUATE: { qpfMmHr: 50, sustainedHours: 3 },
} as const;

/**
 * Derive a flood severity signal from weather data.
 * Uses current conditions + upcoming forecast hours to determine risk level.
 */
export function deriveFloodSignal(
  current: CurrentConditionsResponse | null,
  forecast: HourlyForecastEntry[],
): Severity {
  if (!current) return "MONITOR";

  const precipProb = current.precipitation?.probability?.percent ?? 0;
  const qpf = current.precipitation?.qpf?.quantity ?? 0;
  const thunderProb = current.thunderstormProbability ?? 0;

  // Count upcoming hours with heavy rain in the next N hours
  const heavyRainHours = forecast
    .slice(0, 6)
    .filter(
      (h) =>
        (h.precipitation?.qpf?.quantity ?? 0) >= THRESHOLDS.EVACUATE.qpfMmHr,
    ).length;

  // EVACUATE: extreme QPF with sustained heavy rain ahead
  if (
    qpf >= THRESHOLDS.EVACUATE.qpfMmHr &&
    heavyRainHours >= THRESHOLDS.EVACUATE.sustainedHours
  ) {
    return "EVACUATE";
  }

  // LEAVE: high QPF + high thunderstorm probability
  if (
    qpf >= THRESHOLDS.LEAVE.qpfMmHr &&
    thunderProb >= THRESHOLDS.LEAVE.thunderProb
  ) {
    return "LEAVE";
  }

  // PREPARE: elevated precipitation or thunderstorm risk
  if (
    precipProb >= THRESHOLDS.PREPARE.precipProb ||
    qpf >= THRESHOLDS.PREPARE.qpfMmHr ||
    thunderProb >= THRESHOLDS.PREPARE.thunderProb
  ) {
    return "PREPARE";
  }

  // MONITOR: moderate rain signals
  if (
    precipProb >= THRESHOLDS.MONITOR.precipProb ||
    qpf >= THRESHOLDS.MONITOR.qpfMmHr
  ) {
    return "MONITOR";
  }

  return "MONITOR";
}
