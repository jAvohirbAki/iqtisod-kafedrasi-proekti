"use client";

import { useEffect } from "react";

export default function GlobalError({
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
        title: errObj.name || "Global UI xatoligi",
        message: errObj.message || "Global layout xatoligi",
        route: typeof window !== "undefined" ? window.location.pathname : "/",
        stackTrace: errObj.stack,
        severity: "CRITICAL",
      }),
    }).catch(() => {});
  }, [errObj.message, errObj.name, errObj.stack]);

  return (
    <html lang="uz">
      <body className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-slate-900">
        <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-white p-6 shadow-md text-center space-y-4">
          <h2 className="text-lg font-bold text-rose-700">Tizimda jiddiy xatolik</h2>
          <p className="text-sm text-slate-600">
            Xatolik avtomatik qayd etildi. Iltimos, sahifani qayta yuklang.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Qayta yuklash
          </button>
        </div>
      </body>
    </html>
  );
}
