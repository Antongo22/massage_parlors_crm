import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { auth } from "@/lib/auth";
import { getOrganization, isSetupCompleted } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; error?: string }>;
}) {
  if (!(await isSetupCompleted())) {
    redirect("/setup");
  }

  const session = await auth();

  if (session) {
    redirect("/");
  }

  const [organization, params] = await Promise.all([getOrganization(), searchParams]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      {params.setup === "done" && (
        <p className="text-primary mb-6 flex items-start gap-2 rounded-md border border-current/20 bg-current/5 p-3 text-sm">
          <CheckCircle2 className="mt-px size-4 shrink-0" />
          <span className="text-foreground">
            Настройка завершена. Войдите под адресом администратора, который вы указали.
          </span>
        </p>
      )}

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {organization?.name ?? "CRM массажного салона"}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Введите email — пришлём ссылку для входа. Пароль не нужен.
        </p>
      </header>

      <LoginForm error={params.error} />
    </main>
  );
}
