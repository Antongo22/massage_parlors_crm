import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="bg-primary/10 text-primary mb-6 flex size-12 items-center justify-center rounded-full">
        <Mail className="size-6" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Проверьте почту</h1>

      <p className="text-muted-foreground mt-3 text-sm">
        {email ? (
          <>
            Если <span className="text-foreground font-medium">{email}</span> зарегистрирован
            в системе, на него отправлена ссылка для входа. Она действует 24 часа.
          </>
        ) : (
          <>Ссылка для входа отправлена. Она действует 24 часа.</>
        )}
      </p>

      <p className="text-muted-foreground mt-4 text-xs">
        В режиме разработки письма не уходят наружу — они видны в Mailpit
        на http://localhost:8025.
      </p>

      {/* Base UI использует render вместо asChild из старого shadcn */}
      <Button render={<Link href="/login" />} nativeButton={false} variant="outline" className="mt-8">
        Ввести другой адрес
      </Button>
    </main>
  );
}
