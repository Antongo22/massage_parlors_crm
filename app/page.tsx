import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-guards";
import { isSetupCompleted } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Пока wizard не завершён, у приложения нет ни расписания, ни таймзоны,
  // ни администратора — показывать дашборд не из чего.
  if (!(await isSetupCompleted())) {
    redirect("/setup");
  }

  const user = await getSessionUser();

  if (!user) redirect("/login");

  redirect(user.role === "ADMIN" ? "/dashboard" : "/my");
}
