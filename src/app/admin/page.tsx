import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";
import { AdminDashboard } from "@/components/AdminDashboard";

async function AdminPageLoader() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ADMIN") {
    redirect(getDashboardPath(user.role));
  }
  return <AdminDashboard user={user} />;
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Administrator paneli yuklanmoqda...
        </div>
      }
    >
      <AdminPageLoader />
    </Suspense>
  );
}
