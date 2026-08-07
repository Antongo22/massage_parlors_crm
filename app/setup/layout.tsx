import { redirect } from "next/navigation";
import { isSetupCompleted } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  // Пройденная настройка закрывает wizard навсегда: он создаёт администратора
  // и переписывает параметры салона, поэтому оставлять его открытым нельзя.
  if (await isSetupCompleted()) {
    redirect("/");
  }

  return <div className="bg-muted/30 min-h-dvh py-10">{children}</div>;
}
