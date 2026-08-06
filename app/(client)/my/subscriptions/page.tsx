import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireClientProfile } from "@/lib/auth-guards";
import { formatMoney, pluralize, SESSION_FORMS } from "@/lib/domain/money";
import { formatLocalDate } from "@/lib/domain/time";
import { requireOrganization } from "@/lib/services/organization";
import { getClientSubscriptions } from "@/lib/services/subscriptions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активен",
  EXHAUSTED: "Использован",
  EXPIRED: "Истёк",
  REFUNDED: "Возвращён",
};

export default async function MySubscriptionsPage() {
  const { client } = await requireClientProfile();
  const organization = await requireOrganization();
  const subscriptions = await getClientSubscriptions(client.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Мои абонементы</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Остаток обновляется после каждого визита. Сеанс списывается, когда визит состоялся.
        </p>
      </header>

      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            Абонементов нет. Спросите администратора — пакет из 5 или 10 сеансов
            выходит дешевле поштучной оплаты.
          </CardContent>
        </Card>
      ) : (
        subscriptions.map((subscription) => (
          <Card key={subscription.id}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{subscription.serviceNameSnapshot}</CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  Куплен {formatLocalDate(subscription.purchasedAt, organization.timezone)} за{" "}
                  {formatMoney(subscription.pricePaidMinor, organization.currency)} · действует до{" "}
                  {formatLocalDate(subscription.expiresAt, organization.timezone)}
                </p>
              </div>
              <Badge variant="secondary">{STATUS_LABELS[subscription.status]}</Badge>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm">
                    Осталось {subscription.available} из {subscription.sessionsTotal}{" "}
                    {pluralize(subscription.sessionsTotal, SESSION_FORMS)}
                  </span>
                </div>
                <div className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full">
                  {Array.from({ length: subscription.sessionsTotal }, (_, index) => (
                    <span
                      key={index}
                      className={index < subscription.available ? "bg-primary flex-1" : "bg-muted flex-1"}
                    />
                  ))}
                </div>
              </div>

              {subscription.usages.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                    История списаний
                  </p>
                  <ul className="space-y-1 text-sm">
                    {subscription.usages
                      .filter((usage) => usage.state !== "REVERTED")
                      .map((usage) => (
                        <li key={usage.id} className="text-muted-foreground flex justify-between">
                          <span>
                            {usage.appointment
                              ? formatLocalDate(usage.appointment.startsAt, organization.timezone)
                              : "—"}
                          </span>
                          <span>{usage.state === "CONSUMED" ? "списан" : "забронирован"}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
