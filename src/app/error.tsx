"use client";

import { useEffect } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const errObj = error instanceof Error ? error : new Error(String(error));

  useEffect(() => {
    fetch("/api/monitoring/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: errObj.name || "Interfeys xatoligi",
        message: errObj.message || "Noma'lum UI xatoligi yuz berdi",
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        stackTrace: errObj.stack,
        severity: "ERROR",
      }),
    }).catch(() => {});
  }, [errObj.message, errObj.name, errObj.stack]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-white p-6 shadow-md text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertOctagon className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          Kutilmagan xatolik yuz berdi
        </h2>
        <p className="text-xs sm:text-sm text-slate-600">
          Hodisa tizim administratoriga avtomatik yuborildi. Sahifani qayta yuklab ko&apos;ring.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-indigo-700 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Qayta urinish
        </button>
      </div>
    </div>
  );
}
