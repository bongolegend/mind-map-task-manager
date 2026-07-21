"use client";

import { useEffect, useState } from "react";
import { DrillDown } from "@/components/DrillDown";
import type { Store } from "@/lib/types";

export default function Home() {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/store");
        if (!res.ok) throw new Error("Failed to load store");
        const data = (await res.json()) as Store;
        if (!cancelled) setStore(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-[var(--muted)]">
        {error}
      </main>
    );
  }

  if (!store) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-[var(--muted)]">
        Loading…
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <DrillDown store={store} onStoreChange={setStore} />
    </main>
  );
}
