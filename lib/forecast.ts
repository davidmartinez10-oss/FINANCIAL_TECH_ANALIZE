// Utilidades compartidas para construir series de pronóstico a distintos
// horizontes y renderizar la envolvente de incertidumbre Monte Carlo.

export interface HorizonOption {
  key: string;
  label: string;
  days: number; // días hábiles
}

// Horizontes en días hábiles (~21 hábiles por mes).
export const HORIZONS: HorizonOption[] = [
  { key: "1d", label: "Día", days: 1 },
  { key: "1w", label: "Semana", days: 5 },
  { key: "1m", label: "Mes", days: 21 },
  { key: "3m", label: "3 Meses", days: 63 },
  { key: "6m", label: "6 Meses", days: 126 },
];

export interface ForecastPoint {
  d: number; // día +N (0 = hoy)
  ens: number; // línea del ensamble
  lo: number; // base invisible (límite inferior de la banda)
  outer: number; // ancho de la banda P5–P95 (apilada sobre `lo`)
}

export interface ForecastSeries {
  data: ForecastPoint[];
  modelHorizon: number; // hasta dónde llega el pronóstico real del modelo
  isExtrapolated: boolean; // true si el horizonte supera al del modelo
  endpointReturnPct: number; // retorno % en el extremo del horizonte
}

/**
 * Construye la serie para un horizonte dado.
 *
 * - Para t ≤ horizonte del modelo: usa el pronóstico ensamblado real (slicing).
 * - Para t > horizonte del modelo: extrapola la trayectoria con la deriva
 *   geométrica diaria implícita y ensancha la banda ~√t (varianza de
 *   caminata aleatoria), claramente etiquetado como proyección extendida.
 *
 * Las bandas se centran en la línea del ensamble y escalan los percentiles
 * terminales P5/P95 (relativos a P50) por √(t / H_modelo).
 */
export function buildForecastSeries(
  P0: number,
  fc: number[],
  bands: Record<string, number>,
  horizonDays: number
): ForecastSeries {
  const Hmodel = fc.length;
  const p5 = bands["P5"] ?? P0;
  const p50 = bands["P50"] ?? fc[Hmodel - 1] ?? P0;
  const p95 = bands["P95"] ?? P0;

  // Multiplicadores relativos del percentil terminal respecto a la mediana.
  const relHi = p50 > 0 ? p95 / p50 : 1;
  const relLo = p50 > 0 ? p5 / p50 : 1;

  // Deriva geométrica diaria implícita del ensamble (para extrapolar).
  const g =
    P0 > 0 && Hmodel > 0 ? Math.pow(fc[Hmodel - 1] / P0, 1 / Hmodel) : 1;

  const H = Math.max(1, Math.round(horizonDays));
  const data: ForecastPoint[] = [{ d: 0, ens: P0, lo: P0, outer: 0 }];

  for (let t = 1; t <= H; t++) {
    const ens = t <= Hmodel ? fc[t - 1] : P0 * Math.pow(g, t);
    const s = Math.sqrt(t / Hmodel); // ensanchamiento ~√t
    const hi = ens * Math.pow(relHi, s);
    const lo = ens * Math.pow(relLo, s);
    data.push({ d: t, ens, lo, outer: Math.max(0, hi - lo) });
  }

  const endpoint = data[data.length - 1].ens;
  const endpointReturnPct = P0 > 0 ? (endpoint / P0 - 1) * 100 : 0;

  return {
    data,
    modelHorizon: Hmodel,
    isExtrapolated: H > Hmodel,
    endpointReturnPct,
  };
}
