import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";
import { StudentDashboard } from "@/components/StudentDashboard";

async function StudentPageLoader() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "STUDENT") {
    redirect(getDashboardPath(user.role));
  }
  return <StudentDashboard user={user} />;
}

export default function StudentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Talaba paneli yuklanmoqda...
        </div>
      }
    >
      <StudentPageLoader />
    </Suspense>
  );
}
