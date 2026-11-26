"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  LogOut,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";
import { getDashboardPath, ROLE_LABELS } from "@/lib/domain";
import { NotificationBell, NotificationInbox, usePortalNotifications } from "./PortalNotifications";
import type { Role } from "@prisma/client";

export interface ShellUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  academicTitle: string | null;
  department?: { name: string; code: string; faculty: string } | null;
  group?: { name: string; courseYear: number; specialty: string } | null;
}

export function PortalShell({
  user,
  navItems = [],
  activeTab,
  inbox = false,
  onTabChange,
  children,
}: {
  user: ShellUser;
  navItems?: { id: string; label: string; badge?: number }[];
  activeTab?: string;
  inbox?: boolean;
  onTabChange?: (id: string) => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  const notifications = usePortalNotifications();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold tracking-tight sm:text-base text-slate-900">
                  Kafedra LMS &amp; KPI
                </span>
                <span className="hidden rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 sm:inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
              <p className="text-xs text-slate-500 line-clamp-1">
                {user.department?.name ?? "Kafedra axborot tizimi"}
                {user.group ? ` • Guruh: ${user.group.name}` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell feed={notifications} />

            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <UserCircle2 className="h-4 w-4 text-slate-500" />
              <div className="max-w-52 text-right">
                <p className="truncate text-xs font-semibold text-slate-900 leading-tight">
                  {user.fullName}
                </p>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {user.academicTitle ?? user.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Chiqish</span>
            </button>
          </div>
        </div>

        {navItems.length > 0 && (
          <nav className="border-t border-slate-100 bg-slate-50/70">
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
              {navItems.map((item) => {
                const active = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTabChange?.(item.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs sm:text-sm font-medium transition ${
                      active
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <span>{item.label}</span>
                    {typeof item.badge === "number" && item.badge > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          active
                            ? "bg-white/20 text-white"
                            : "bg-indigo-100 text-indigo-700"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {inbox ? <NotificationInbox feed={notifications} dashboard={getDashboardPath(user.role)} /> : children}
      </main>
    </div>
  );
}
