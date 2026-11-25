import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";
import { TeacherDashboard } from "@/components/TeacherDashboard";

async function TeacherPageLoader() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "TEACHER") {
    redirect(getDashboardPath(user.role));
  }
  return <TeacherDashboard user={user} />;
}

export default function TeacherPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          O&apos;qituvchi paneli yuklanmoqda...
        </div>
      }
    >
      <TeacherPageLoader />
    </Suspense>
  );
}
