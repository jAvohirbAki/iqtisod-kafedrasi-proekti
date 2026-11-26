"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronRight, LoaderCircle } from "lucide-react";
import { PortalEmptyState } from "./PortalEmptyState";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface FeedPage {
  notifications: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}

export function usePortalNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetching = useRef(false);
  const writing = useRef(false);
  const mutation = useRef(0);
  const paged = useRef(false);

  const load = useCallback(async (after?: string, reportError = true) => {
    if (fetching.current || writing.current) return;
    fetching.current = true;
    const revision = mutation.current;
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (after) query.set("cursor", after);
      const response = await fetch(`/api/notifications?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const page: FeedPage = await response.json();
      if (revision !== mutation.current) return;
      const keepPrevious = paged.current;
      setItems((previous) => {
        const pageIds = new Set(page.notifications.map(({ id }) => id));
        const rest = previous.filter(({ id }) => !pageIds.has(id));
        return after ? [...rest, ...page.notifications] : [...page.notifications, ...(keepPrevious ? rest : [])];
      });
      setUnreadCount(page.unreadCount);
      if (after || !keepPrevious) setCursor(page.nextCursor);
      if (after) paged.current = true;
      setError(null);
    } catch {
      if (reportError && revision === mutation.current) setError("Bildirishnomalarni yuklab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") void load(undefined, false);
    }
    void load();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function loadMore() {
    if (!cursor || fetching.current || writing.current) return;
    setPaging(true);
    try {
      await load(cursor);
    } finally {
      setPaging(false);
    }
  }

  async function markRead(id?: string) {
    if (writing.current) return false;
    writing.current = true;
    mutation.current += 1;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error ?? "Bildirishnomani o'qilgan deb belgilab bo'lmadi.");
        return false;
      }
      setItems((previous) => previous.map((item) => !id || item.id === id ? { ...item, isRead: true } : item));
      setUnreadCount(result.unreadCount);
      return true;
    } catch {
      setError("Tarmoq bilan aloqa uzildi. Qayta urinib ko'ring.");
      return false;
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  async function open(item: NotificationItem) {
    if (!item.link || (!item.isRead && !await markRead(item.id))) return;
    window.location.assign(item.link);
  }

  return { items, unreadCount, cursor, loading, paging, saving, error, load, loadMore, markRead, open };
}

type NotificationFeed = ReturnType<typeof usePortalNotifications>;

function MarkAllButton({ feed }: { feed: NotificationFeed }) {
  if (!feed.unreadCount) return null;
  return (
    <button
      type="button"
      disabled={feed.saving}
      onClick={() => void feed.markRead()}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
    >
      <CheckCheck aria-hidden="true" className="size-3.5 shrink-0" />
      Barchasini o&apos;qilgan qilish
    </button>
  );
}

function NotificationList({ feed, preview = false }: { feed: NotificationFeed; preview?: boolean }) {
  if (feed.loading) {
    return (
      <p role="status" className="flex items-center gap-2 px-4 py-5 text-sm text-slate-600">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Bildirishnomalar yuklanmoqda…
      </p>
    );
  }
  const items = preview ? feed.items.slice(0, 5) : feed.items;
  return (
    <>
      {feed.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 bg-rose-50 px-4 py-2 text-xs text-rose-800">
          {feed.error}
          <button type="button" onClick={() => void feed.load()} className="min-h-8 font-semibold underline">Yangilash</button>
        </div>
      )}
      {items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className={`min-w-0 break-words px-4 py-3 ${item.isRead ? "bg-white" : "bg-indigo-50/60"}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                {!item.isRead && <span className="text-[11px] font-medium text-indigo-700">O&apos;qilmagan</span>}
              </div>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">{item.message}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("uz-UZ")}</time>
              </p>
              <div className="flex flex-wrap items-center gap-x-3">
                {item.link && (
                  <a
                    href={item.link}
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
                      event.preventDefault();
                      void feed.open(item);
                    }}
                    className="inline-flex min-h-9 items-center text-xs font-semibold text-indigo-700 hover:underline"
                  >
                    Ko&apos;rish <ChevronRight aria-hidden="true" className="size-3.5" />
                  </a>
                )}
                {!item.isRead && (
                  <button
                    type="button"
                    disabled={feed.saving}
                    onClick={() => void feed.markRead(item.id)}
                    className="min-h-9 text-xs font-medium text-slate-700 hover:underline disabled:opacity-60"
                  >
                    O&apos;qilgan deb belgilash
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : !feed.error && (
        <div className="p-3"><PortalEmptyState title="Bildirishnomalar hali yo‘q" description="Yangi xabarlar shu yerda ko‘rinadi." /></div>
      )}
    </>
  );
}

export function NotificationBell({ feed }: { feed: NotificationFeed }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="md:relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          document.getElementById("portal-notification-bell")?.focus();
        }
      }}
    >
      <button
        id="portal-notification-bell"
        type="button"
        onClick={() => {
          if (!open) void feed.load();
          setOpen(!open);
        }}
        className="relative flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        aria-label={`Bildirishnomalar, ${feed.unreadCount} ta o'qilmagan`}
        aria-expanded={open}
        aria-controls={open ? "portal-notification-preview" : undefined}
      >
        <Bell aria-hidden="true" className="size-4" />
        {feed.unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {feed.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <section
          id="portal-notification-preview"
          aria-label="So'nggi bildirishnomalar"
          className="absolute inset-x-3 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl md:inset-x-auto md:right-0 md:mt-2 md:w-96"
        >
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 px-4 py-2">
            <h2 className="text-sm font-bold text-slate-900">Bildirishnomalar</h2>
            <MarkAllButton feed={feed} />
          </div>
          <div className="max-h-[min(55vh,26rem)] overflow-y-auto"><NotificationList feed={feed} preview /></div>
          <Link onClick={() => setOpen(false)} href="/notifications" className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
            Barcha bildirishnomalar
          </Link>
        </section>
      )}
    </div>
  );
}

export function NotificationInbox({ feed, dashboard }: { feed: NotificationFeed; dashboard: string }) {
  return (
    <section className="mx-auto max-w-3xl">
      <Link href={dashboard} className="mb-3 inline-flex min-h-9 items-center text-sm font-semibold text-indigo-700 hover:underline">Panelga qaytish</Link>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Bildirishnomalar</h1>
            <p className="mt-1 text-sm text-slate-600">{feed.unreadCount} ta o&apos;qilmagan</p>
          </div>
          <MarkAllButton feed={feed} />
        </div>
        <NotificationList feed={feed} />
        {feed.cursor && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              type="button"
              disabled={feed.paging || feed.saving}
              onClick={() => void feed.loadMore()}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {feed.paging ? "Yuklanmoqda…" : "Oldingi bildirishnomalarni ko‘rsatish"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
