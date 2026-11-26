import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { getSessionUser } from "@/lib/auth";

async function NotificationsContent() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <PortalShell user={user} inbox />;
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-600">Bildirishnomalar yuklanmoqda…</p>}>
      <NotificationsContent />
    </Suspense>
  );
}
