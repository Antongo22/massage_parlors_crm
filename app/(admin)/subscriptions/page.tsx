import Link from "next/link";
import { Plus } from "lucide-react";
import { PlanDialog } from "@/components/subscriptions/plan-dialog";
import { RefundDialog } from "@/components/subscriptions/refund-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { discountPercent, formatMoney, pluralize, SESSION_FORMS } from "@/lib/domain/money";
import { requireOrganization } from "@/lib/services/organization";
import { countActiveUsages } from "@/lib/services/subscriptions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активен",
  EXHAUSTED: "Использован",
  EXPIRED: "Истёк",
  REFUNDED: "Возвращён",
};

export default async function SubscriptionsPage() {
  await requireAdmin();
  const organization = await requireOrganization();

  const [plans, subscriptions, services] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      orderBy: [{ isActive: "desc" }, { sessionsCount: "asc" }],
      include: { service: { select: { name: true, priceMinor: true } }, _count: { select: { subscriptions: true } } },
    }),
    prisma.subscription.findMany({
      orderBy: [{ status: "asc" }, { expiresAt: "asc" }],
      include: {
        client: { select: { id: true, lastName: true, firstName: true } },
        usages: { select: { state: true } },
      },
    }),
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, priceMinor: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Абонементы</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Пакеты сеансов со скидкой. Остаток считается по журналу списаний, а не счётчиком.
          </p>
        </div>

        <PlanDialog
          services={services}
          currency={organization.currency}
          trigger={
            <Button>
              <Plus className="size-4" />
              Новый пакет
            </Button>
          }
        />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Пакеты в продаже</CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Пакетов пока нет</p>
          ) : (
            <ul className="divide-border divide-y">
              {plans.map((plan) => {
                const discount = discountPercent(
                  plan.priceMinor,
                  plan.sessionsCount,
                  plan.service.priceMinor,
                );

                return (
                  <li key={plan.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{plan.name}</span>
                        {!plan.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Снят с продажи
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {plan.service.name} · {plan.sessionsCount}{" "}
                        {pluralize(plan.sessionsCount, SESSION_FORMS)} · действует{" "}
                        {plan.validityDays} дней · продан {plan._count.subscriptions} раз
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular-nums">
                        {formatMoney(plan.priceMinor, organization.currency)}
                      </p>
                      {discount > 0 && <p className="text-primary text-xs">выгода {discount}%</p>}
                    </div>

                    <PlanDialog
                      services={services}
                      currency={organization.currency}
                      plan={{
                        id: plan.id,
                        serviceId: plan.serviceId,
                        name: plan.name,
                        sessionsCount: plan.sessionsCount,
                        priceMinor: plan.priceMinor,
                        validityDays: plan.validityDays,
                        isActive: plan.isActive,
                      }}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Изменить
                        </Button>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Проданные абонементы</CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Пока ничего не продано
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {subscriptions.map((subscription) => {
                const used = countActiveUsages(subscription.usages);
                const available = subscription.sessionsTotal - used;

                return (
                  <li key={subscription.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${subscription.clientId}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {subscription.client.lastName} {subscription.client.firstName}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">
                        {subscription.serviceNameSnapshot} · до{" "}
                        {subscription.expiresAt.toLocaleDateString("ru-RU")}
                      </p>
                    </div>

                    <Badge variant="secondary" className="shrink-0">
                      {STATUS_LABELS[subscription.status]}
                    </Badge>

                    <span className="w-16 shrink-0 text-right text-sm tabular-nums">
                      {available}/{subscription.sessionsTotal}
                    </span>

                    {subscription.status !== "REFUNDED" && (
                      <RefundDialog
                        subscriptionId={subscription.id}
                        maxAmountMinor={subscription.pricePaidMinor}
                        currency={organization.currency}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
