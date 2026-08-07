import Link from "next/link";
import { ArrowRight, CalendarDays, Repeat, Ticket, Wallet } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyShort, pluralize, SESSION_FORMS, VISIT_FORMS } from "@/lib/domain/money";
import { formatLocalTime, todayLocalDate } from "@/lib/domain/time";
import { getDashboardData } from "@/lib/services/analytics";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const organization = await requireOrganization();
  const today = todayLocalDate(organization.timezone);
  const data = await getDashboardData(today, organization.timezone);

  const upcoming = data.appointments.filter((a) => a.status === "PENDING" || a.status === "CONFIRMED");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" })}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Выручка сегодня"
          value={formatMoneyShort(data.todaySummary.revenueMinor, organization.currency)}
          hint={
            data.todaySummary.refundsMinor > 0
              ? `с учётом возвратов на ${formatMoneyShort(data.todaySummary.refundsMinor, organization.currency)}`
              : `${data.todaySummary.salesCount} ${pluralize(data.todaySummary.salesCount, ["продажа", "продажи", "продаж"])}`
          }
        />
        <StatCard
          icon={CalendarDays}
          label="Записей на сегодня"
          value={String(data.appointments.length)}
          hint={`${upcoming.length} ещё впереди`}
        />
        <StatCard
          icon={Ticket}
          label="Активных абонементов"
          value={String(data.activeSubscriptions.length)}
          hint={`${data.activeSubscriptions.reduce((sum, s) => sum + s.available, 0)} ${pluralize(
            data.activeSubscriptions.reduce((sum, s) => sum + s.available, 0),
            SESSION_FORMS,
          )} не использовано`}
        />
        <StatCard
          icon={Repeat}
          label="Возвратность"
          value={`${data.retention.returnRate}%`}
          hint={`${data.retention.dormantClients} не были больше 45 дней`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Записи на сегодня</CardTitle>
            <Link
              href="/calendar"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
            >
              Календарь <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.appointments.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                На сегодня записей нет
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {data.appointments.map((appointment) => (
                  <li key={appointment.id} className="flex items-center gap-3 py-3">
                    <span className="w-12 shrink-0 text-sm font-medium tabular-nums">
                      {formatLocalTime(appointment.startsAt, organization.timezone)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${appointment.clientId}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {appointment.client.lastName} {appointment.client.firstName}
                      </Link>
                      <span className="text-muted-foreground block truncate text-xs">
                        {appointment.serviceNameSnapshot}
                        {appointment.usage && " · по абонементу"}
                      </span>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Топ услуг за 30 дней</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topServices.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Пока нет оплаченных визитов
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.topServices.map((service) => {
                    const max = data.topServices[0]!.revenueMinor || 1;
                    const width = Math.max(4, Math.round((service.revenueMinor / max) * 100));

                    return (
                      <li key={service.serviceId}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm">{service.serviceName}</span>
                          <span className="shrink-0 text-sm font-medium tabular-nums">
                            {formatMoneyShort(service.revenueMinor, organization.currency)}
                          </span>
                        </div>
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div className="bg-primary h-full rounded-full" style={{ width: `${width}%` }} />
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {service.visits} {pluralize(service.visits, VISIT_FORMS)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Абонементы на исходе</CardTitle>
              <Link
                href="/subscriptions"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
              >
                Все <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent>
              {data.activeSubscriptions.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Активных абонементов нет
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {data.activeSubscriptions.slice(0, 5).map((subscription) => (
                    <li key={subscription.id} className="flex items-center gap-3 py-2.5">
                      <Link
                        href={`/clients/${subscription.clientId}`}
                        className="min-w-0 flex-1 truncate text-sm hover:underline"
                      >
                        {subscription.client.lastName} {subscription.client.firstName}
                      </Link>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        до {subscription.expiresAt.toLocaleDateString("ru-RU")}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {subscription.available}/{subscription.sessionsTotal}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
