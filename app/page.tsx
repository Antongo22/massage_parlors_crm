export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { isSetupCompleted } from "@/lib/services/organization";

export default async function HomePage() {
  // Пока wizard не завершён, у приложения нет ни расписания, ни таймзоны,
  // ни администратора — показывать дашборд не из чего.
  if (!(await isSetupCompleted())) {
    redirect("/setup");
  }

  redirect("/dashboard");
}
