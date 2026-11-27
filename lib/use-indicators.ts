"use client";

import { useEffect, useState } from "react";
import type { KeyIndicatorsResponse } from "@/lib/types";

// Una sola consulta compartida por la cinta superior y el panel del Dashboard.
let inflight: Promise<KeyIndicatorsResponse | null> | null = null;
let cached: { at: number; data: KeyIndicatorsResponse } | null = null;
const TTL = 55_000;

function load(): Promise<KeyIndicatorsResponse | null> {
  if (cached && Date.now() - cached.at < TTL) return Promise.resolve(cached.data);
  if (!inflight) {
    inflight = fetch("/api/indicators", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<KeyIndicatorsResponse>) : null))
      .then((d) => {
        if (d) cached = { at: Date.now(), data: d };
        return d;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useIndicators(refreshMs = 60_000) {
  const [data, setData] = useState<KeyIndicatorsResponse | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    const run = () =>
      load().then((d) => {
        if (!alive) return;
        if (d) setData(d);
        setLoading(false);
      });
    run();
    const id = setInterval(run, refreshMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshMs]);

  return { data, loading };
}
