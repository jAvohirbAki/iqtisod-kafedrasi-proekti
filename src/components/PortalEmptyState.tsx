import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function PortalEmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-9 text-center">
      <span className="mb-3 rounded-xl bg-indigo-50 p-3 text-indigo-600"><Inbox aria-hidden="true" className="size-5" /></span>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-600">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
