import Link from "next/link";
import { Banknote, Receipt, TrendingUp, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { RevenueChart } from "@/components/finance/revenue-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { formatMoney, formatMoneyShort, pluralize, VISIT_FORMS } from "@/lib/domain/money";
import { formatLocalDate, localDayRange, shiftLocalDate, todayLocalDate } from "@/lib/domain/time";
import {
  getPeriodSummary,
  getRetentionStats,
  getRevenueByService,
  getRevenueSeries,
  type Granularity,
} from "@/lib/services/analytics";
import { requireOrganization } from "@/lib/services/organization";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANGES = {
  day: { label: "По дням", days: 30, granularity: "day" as Granularity },
  week: { label: "По неделям", days: 120, granularity: "week" as Granularity },
  month: { label: "По месяцам", days: 365, granularity: "month" as Granularity },
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: keyof typeof RANGES }>;
}) {
  await requireAdmin();

  const organization = await requireOrganization();
  const params = await searchParams;
  const range = RANGES[params.range ?? "day"] ?? RANGES.day;

  const today = todayLocalDate(organization.timezone);
  const { to } = localDayRange(today, organization.timezone);
  const { from } = localDayRange(shiftLocalDate(today, -range.days), organization.timezone);

  const [series, byService, summary, retention, recentPayments] = await Promise.all([
    getRevenueSeries({ from, to, granularity: range.granularity, timezone: organization.timezone }),
    getRevenueByService({ from, to }),
    getPeriodSummary({ from, to }),
    getRetentionStats(),
    prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
      take: 15,
      include: {
        client: { select: { id: true, lastName: true, firstName: true } },
        appointment: { select: { serviceNameSnapshot: true } },
        subscription: { select: { serviceNameSnapshot: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Финансы</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Выручка считается по журналу платежей: абонемент оплачивается один раз,
          а визитов по нему несколько.
        </p>
      </header>

      <div className="flex gap-2">
        {Object.entries(RANGES).map(([key, value]) => (
          <Link
            key={key}
            href={`/finance?range=${key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              (params.range ?? "day") === key
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            {value.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Banknote}
          label={`Выручка за ${range.days} дней`}
          value={formatMoneyShort(summary.revenueMinor, organization.currency)}
          hint={
            summary.refundsMinor > 0
              ? `возвраты: ${formatMoneyShort(summary.refundsMinor, organization.currency)}`
              : `${summary.salesCount} ${pluralize(summary.salesCount, ["продажа", "продажи", "продаж"])}`
          }
        />
        <StatCard
          icon={Receipt}
          label="Средний чек"
          value={formatMoneyShort(summary.averageSaleMinor, organization.currency)}
          hint="выручка / число продаж"
        />
        <StatCard
          icon={TrendingUp}
          label="Выручка на визит"
          value={formatMoneyShort(summary.averagePerVisitMinor, organization.currency)}
          hint={`${summary.completedVisits} ${pluralize(summary.completedVisits, VISIT_FORMS)}`}
        />
        <StatCard
          icon={Users}
          label="Возвратность"
          value={`${retention.returnRate}%`}
          hint={`${retention.retention60} вернулись за 60 дней`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Динамика выручки</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart
            points={series}
            granularity={range.granularity}
            currency={organization.currency}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Доход по услугам</CardTitle>
          </CardHeader>
          <CardContent>
            {byService.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                За период не было оплат
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {byService.map((service) => (
                  <li key={service.serviceId} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{service.serviceName}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {service.visits} {pluralize(service.visits, VISIT_FORMS)}
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(service.revenueMinor, organization.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Последние операции</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">Операций нет</p>
            ) : (
              <ul className="divide-border divide-y">
                {recentPayments.map((payment) => (
                  <li key={payment.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${payment.clientId}`}
                        className="block truncate text-sm hover:underline"
                      >
                        {payment.client.lastName} {payment.client.firstName}
                      </Link>
                      <span className="text-muted-foreground block truncate text-xs">
                        {payment.appointment?.serviceNameSnapshot ??
                          `Абонемент: ${payment.subscription?.serviceNameSnapshot ?? ""}`}{" "}
                        · {formatLocalDate(payment.paidAt, organization.timezone)}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        payment.kind === "REFUND" && "text-destructive",
                      )}
                    >
                      {payment.kind === "REFUND" ? "−" : "+"}
                      {formatMoney(payment.amountMinor, organization.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Удержание клиентов</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-4">
          <Metric label="Клиентов с визитами" value={String(retention.totalClients)} />
          <Metric label="Пришли повторно" value={String(retention.returningClients)} />
          <Metric label="Вернулись за 60 дней" value={String(retention.retention60)} />
          <Metric
            label="Не были 45+ дней"
            value={String(retention.dormantClients)}
            hint="кандидаты на возврат"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
