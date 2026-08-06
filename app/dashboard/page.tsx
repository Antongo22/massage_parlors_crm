export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Дашборд</h1>
      <p className="text-muted-foreground text-sm">
        В разработке: выручка за сегодня, записи на день, топ услуг, активные абонементы.
      </p>
    </main>
  );
}
