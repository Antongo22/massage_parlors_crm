import Link from "next/link";
import { AlertTriangle, Plus, Search, Ticket } from "lucide-react";
import { ClientDialog } from "@/components/clients/client-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth-guards";
import { pluralize, VISIT_FORMS } from "@/lib/domain/money";
import { listClients } from "@/lib/services/clients";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const { q } = await searchParams;
  const clients = await listClients(q);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Клиенты</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {clients.length} {pluralize(clients.length, ["карточка", "карточки", "карточек"])}
          </p>
        </div>

        <ClientDialog
          trigger={
            <Button>
              <Plus className="size-4" />
              Новый клиент
            </Button>
          }
        />
      </header>

      <form className="relative max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Фамилия, имя или телефон"
          className="pl-9"
        />
      </form>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            {q ? "Никого не нашли по этому запросу" : "Клиентов пока нет"}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {clients.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/clients/${client.id}`}
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {client.lastName} {client.firstName} {client.middleName ?? ""}
                        </span>
                        {client.hasContraindications && (
                          <AlertTriangle
                            className="text-destructive size-4 shrink-0"
                            aria-label="Есть противопоказания"
                          />
                        )}
                        {client.activeSubscriptions > 0 && (
                          <Ticket
                            className="text-primary size-4 shrink-0"
                            aria-label="Есть активный абонемент"
                          />
                        )}
                      </div>
                      <span className="text-muted-foreground text-sm">{client.phone}</span>
                    </div>

                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-sm tabular-nums">
                        {client._count.appointments}{" "}
                        {pluralize(client._count.appointments, VISIT_FORMS)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {client.lastVisitAt
                          ? `был ${client.lastVisitAt.toLocaleDateString("ru-RU")}`
                          : "ещё не приходил"}
                      </p>
                    </div>

                    {client.noShowCount > 0 && (
                      <span
                        className="bg-destructive/10 text-destructive shrink-0 rounded px-1.5 py-0.5 text-xs"
                        title="Количество неявок"
                      >
                        {client.noShowCount} неявк{client.noShowCount === 1 ? "а" : "и"}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
