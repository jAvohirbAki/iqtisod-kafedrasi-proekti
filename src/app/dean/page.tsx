import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";
import { DeanDashboard } from "@/components/DeanDashboard";

async function DeanPageLoader() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "DEAN") {
    redirect(getDashboardPath(user.role));
  }
  return <DeanDashboard user={user} />;
}

export default function DeanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Dekanat paneli yuklanmoqda...
        </div>
      }
    >
      <DeanPageLoader />
    </Suspense>
  );
}
