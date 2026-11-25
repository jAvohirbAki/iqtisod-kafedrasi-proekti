import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";
import { LoginForm } from "./LoginForm";

async function LoginPageContent() {
  const user = await getSessionUser();
  if (user) {
    redirect(getDashboardPath(user.role));
  }

  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
