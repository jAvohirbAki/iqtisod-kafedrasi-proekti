"use client";

import React, { useState } from "react";
import { GraduationCap, KeyRound, Loader2, Mail, ShieldAlert } from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    label: "Tizim administratori",
    email: "admin@kafedra.uz",
    roleHint: "Xatoliklar monitoringi, tizim diagnostikasi va foydalanuvchilar",
  },
  {
    label: "Dekanat / Kafedra mudiri",
    email: "dekanat@kafedra.uz",
    roleHint: "KPI tasdiqlash, guruh va fanlar boshqaruvi",
  },
  {
    label: "O'qituvchi (Dotsent)",
    email: "karimova@kafedra.uz",
    roleHint: "Vazifa qo'yish, baholash va KPI kiritish",
  },
  {
    label: "Talaba (AT-301)",
    email: "ali@student.uz",
    roleHint: "Vazifa yuklash va reyting daftarchasi",
  },
];

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kirishda xatolik");
        return;
      }
      window.location.replace(data?.redirectTo ?? "/");
    } catch {
      setError("Server bilan aloqa o'rnatib bo'lmadi");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitLogin(email, password);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-4xl grid gap-6 lg:grid-cols-2 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-lg">
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Kafedra LMS &amp; KPI
                </h1>
                <p className="text-xs text-slate-500">
                  Yagona akademik boshqaruv tizimi
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Elektron pochta
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="email"
                    name="email"
                    autoComplete="username"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="masalan: karimova@kafedra.uz"
                    className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Parol
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Tizimga kirish
              </button>
            </form>
          </div>

          <p className="mt-6 text-[11px] text-slate-400">
            Barcha harakatlar rolga asoslangan xavfsizlik (RBAC) va audit log orqali himoyalangan.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Tezkor Demo Kirish (Sinov uchun)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Har bir panelni alohida tekshirish uchun quyidagi tayyor hisoblardan birini tanlang (parol:{" "}
              <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-slate-800">
                Kafedra2026!
              </code>
              ):
            </p>

            <div className="mt-4 space-y-2.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword("Kafedra2026!");
                    submitLogin(acc.email, "Kafedra2026!");
                  }}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:bg-indigo-50/40 transition group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700">
                      {acc.label}
                    </span>
                    <span className="text-[11px] font-mono text-indigo-600">
                      {acc.email}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{acc.roleHint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
            Eslatma: Demo ma&apos;lumotlar bazasida 2 ta guruh (AT-301, DI-202), 3 ta fan,
            3 ta o&apos;qituvchi va 5 ta talaba oldindan yaratilgan.
          </div>
        </div>
      </div>
    </div>
  );
}
