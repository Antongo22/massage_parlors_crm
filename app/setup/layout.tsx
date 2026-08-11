import { redirect } from "next/navigation";
import { SetupPasswordGate } from "@/components/setup/setup-password-gate";
import { hasSetupAccess, isSetupPasswordConfigured } from "@/lib/setup-access";
import { isSetupCompleted } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  // Пройденная настройка закрывает wizard навсегда: он создаёт администратора
  // и переписывает параметры салона, поэтому оставлять его открытым нельзя.
  if (await isSetupCompleted()) {
    redirect("/");
  }

  // До создания администратора у приложения ещё нет обычной аутентификации.
  // Отдельный пароль закрывает публичный wizard на production.
  if (isSetupPasswordConfigured() && !(await hasSetupAccess())) {
    return (
      <div className="bg-muted/30 min-h-dvh py-10">
        <SetupPasswordGate />
      </div>
    );
  }

  return <div className="bg-muted/30 min-h-dvh py-10">{children}</div>;
}
