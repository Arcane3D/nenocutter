export interface PrintEstimate {
  grams: number;
  minutes: number;
  filamentMeters: number;
}

/** Rough solid-plastic estimate. Walls are treated as solid; infill is not guessed. */
export function estimatePrint(volumeMm3: number): PrintEstimate {
  const volume = Math.max(0, volumeMm3);
  const grams = (volume / 1000) * 1.24;
  const filamentMeters = volume / (Math.PI * 0.875 ** 2) / 1000;
  const flow = 0.45 * 0.2 * 50;
  const minutes = flow > 0 ? volume / flow / 60 : 0;
  return { grams, minutes, filamentMeters };
}

export function formatEstimate(volumeMm3: number): string {
  const estimate = estimatePrint(volumeMm3);
  if (estimate.grams < 0.05) return 'Too small to estimate';
  return `About ${estimate.grams.toFixed(1)} g · ${estimate.filamentMeters.toFixed(2)} m · ${Math.max(1, Math.round(estimate.minutes))} min`;
}
