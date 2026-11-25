import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Award, BookOpenCheck, Building2, CheckCircle2, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";

async function AuthRedirectCheck() {
  const user = await getSessionUser();
  if (user) {
    redirect(getDashboardPath(user.role));
  }
  return null;
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <Suspense fallback={null}>
        <AuthRedirectCheck />
      </Suspense>

      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold">
              K
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Kafedra LMS &amp; KPI</p>
              <p className="text-xs text-slate-500">Oliy ta&apos;lim kafedra boshqaruv tizimi</p>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            Tizimga kirish
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            O&apos;zbekiston OTM Kredit-Modul va KPI Standarti
          </span>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-slate-900">
            Kafedra o&apos;quv jarayoni, vazifalar va o&apos;qituvchi KPI yagona tizimda
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
            Talabalar vazifalarini versiyalar tarixi bilan topshiradi, o&apos;qituvchilar
            topshiriq berib baholaydi hamda ilmiy-uslubiy KPI ko&apos;rsatkichlarini hujjatlar
            bilan kiritadi, dekanat esa barchasini shaffof audit log asosida nazorat qiladi.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 transition"
            >
              Demo kabinetga kirish
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Building2 className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Dekanat / Kafedra paneli</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Guruhlar, fanlar va o&apos;qituvchilarni biriktirish
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                KPI hujjatlarini tekshirish va tasdiqlash/rad etish
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Excel (CSV) hisobotlar va to&apos;liq Audit Log
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Award className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">O&apos;qituvchi paneli</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Joriy, Oraliq, Lab va Mustaqil ishlar yaratish
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Topshiriqlarni baholash yoki qayta ishlashga qaytarish
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Scopus, OAK, DGU, darslik KPI ma&apos;lumotlarini kiritish
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Talaba paneli</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Muddat taymeri bilan vazifalarni kuzatish
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Fayl va GitHub havola yuklash (v1, v2 tarixi bilan)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                100 ballik kredit-modul reyting daftarchasi
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Barcha rollar uchun tayyor demo hisoblar mavjud
              </p>
              <p className="text-xs text-slate-500">
                Kirish sahifasida 1 bosish bilan Dekanat, O&apos;qituvchi yoki Talaba panelini sinab ko&apos;rishingiz mumkin.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
          >
            Kirish sahifasiga o&apos;tish
          </Link>
        </div>
      </main>
    </div>
  );
}
