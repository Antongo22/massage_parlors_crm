import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarPlus, Pencil } from "lucide-react";
import { ClientDialog } from "@/components/clients/client-dialog";
import { ClientNotes } from "@/components/clients/client-notes";
import { SellSubscriptionDialog } from "@/components/subscriptions/sell-subscription-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { formatMoney, pluralize, SESSION_FORMS } from "@/lib/domain/money";
import { formatLocalDateTime } from "@/lib/domain/time";
import { SOURCE_LABELS } from "@/lib/domain/client";
import { getClientCard } from "@/lib/services/clients";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function ClientCardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const [client, organization] = await Promise.all([getClientCard(id), requireOrganization()]);

  if (!client) notFound();

  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    include: { service: { select: { name: true, priceMinor: true } } },
    orderBy: { sessionsCount: "asc" },
  });

  const contraindications = client.notes.filter((note) => note.type === "CONTRAINDICATION");

  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />К списку клиентов
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.lastName} {client.firstName} {client.middleName ?? ""}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {client.phone}
            {client.email && ` · ${client.email}`}
            {client.source && ` · ${SOURCE_LABELS[client.source] ?? client.source}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <ClientDialog
            client={client}
            trigger={
              <Button variant="outline">
                <Pencil className="size-4" />
                Изменить
              </Button>
            }
          />
          <SellSubscriptionDialog
            clientId={client.id}
            currency={organization.currency}
            plans={plans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              sessionsCount: plan.sessionsCount,
              priceMinor: plan.priceMinor,
              validityDays: plan.validityDays,
              serviceName: plan.service.name,
              servicePriceMinor: plan.service.priceMinor,
            }))}
          />
          <Button render={<Link href={`/calendar?clientId=${client.id}`} />} nativeButton={false}>
            <CalendarPlus className="size-4" />
            Записать
          </Button>
        </div>
      </header>

      {contraindications.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-3">
            <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-destructive font-medium">Противопоказания</p>
              <ul className="mt-1 space-y-1 text-sm">
                {contraindications.map((note) => (
                  <li key={note.id}>{note.body}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Визитов" value={String(client.stats.totalVisits)} />
        <Stat label="Потрачено" value={formatMoney(client.stats.spentMinor, organization.currency)} />
        <Stat
          label="Первый визит"
          value={client.stats.firstVisitAt?.toLocaleDateString("ru-RU") ?? "—"}
        />
        <Stat label="Неявок" value={String(client.noShowCount)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>История посещений</CardTitle>
            </CardHeader>
            <CardContent>
              {client.appointments.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Записей пока нет
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {client.appointments.map((appointment) => (
                    <li key={appointment.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {appointment.serviceNameSnapshot}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatLocalDateTime(appointment.startsAt, organization.timezone)}
                          {appointment.usage && " · по абонементу"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">
                        {appointment.usage
                          ? "—"
                          : formatMoney(appointment.priceMinorSnapshot, organization.currency)}
                      </span>
                      <StatusBadge status={appointment.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Абонементы</CardTitle>
            </CardHeader>
            <CardContent>
              {client.subscriptions.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Абонементов нет
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {client.subscriptions.map((subscription) => (
                    <li key={subscription.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {subscription.serviceNameSnapshot}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Куплен {subscription.purchasedAt.toLocaleDateString("ru-RU")} · действует
                          до {subscription.expiresAt.toLocaleDateString("ru-RU")}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {subscription.available} из {subscription.sessionsTotal}{" "}
                        {pluralize(subscription.available, SESSION_FORMS)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <ClientNotes clientId={client.id} notes={client.notes} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
