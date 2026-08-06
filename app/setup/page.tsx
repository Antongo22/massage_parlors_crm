export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Первичная настройка</h1>
      <p className="text-muted-foreground text-sm">
        Мастер настройки в разработке: здесь будут создание администратора, данные салона,
        рабочие часы, SMTP и опциональные демо-данные.
      </p>
    </main>
  );
}
