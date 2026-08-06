"use client";

import { useActionState, useState } from "react";
import { Ticket } from "lucide-react";
import {
  sellSubscriptionAction,
  type SubscriptionActionState,
} from "@/app/(admin)/subscriptions/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { discountPercent, formatMoney, pluralize, SESSION_FORMS } from "@/lib/domain/money";

type Plan = {
  id: string;
  name: string;
  sessionsCount: number;
  priceMinor: number;
  validityDays: number;
  serviceName: string;
  servicePriceMinor: number;
};

export function SellSubscriptionDialog({
  clientId,
  plans,
  currency,
}: {
  clientId: string;
  plans: Plan[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  // Диалог закрывается прямо в действии, а не эффектом на state.ok.
  // setState синхронно внутри эффекта вызывает лишний каскад рендеров,
  // и правило react-hooks/set-state-in-effect ругается справедливо:
  // закрытие — следствие успешного действия, а не синхронизация с внешним миром.
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(
    async (previous, formData) => {
      const result = await sellSubscriptionAction(previous, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );


  const plan = plans.find((item) => item.id === planId);
  const discount = plan
    ? discountPercent(plan.priceMinor, plan.sessionsCount, plan.servicePriceMinor)
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={plans.length === 0}>
            <Ticket className="size-4" />
            Продать абонемент
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <form action={action}>
          <input type="hidden" name="clientId" value={clientId} />

          <DialogHeader>
            <DialogTitle>Продажа абонемента</DialogTitle>
            <DialogDescription>
              Оплата фиксируется сразу, сеансы списываются по мере визитов.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {state.error && (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="planId">Абонемент</Label>
              <select
                id="planId"
                name="planId"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                required
              >
                {plans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            {plan && (
              <div className="bg-muted/40 space-y-1 rounded-md p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Услуга: </span>
                  {plan.serviceName}
                </p>
                <p>
                  <span className="text-muted-foreground">Сеансов: </span>
                  {plan.sessionsCount} {pluralize(plan.sessionsCount, SESSION_FORMS)}
                </p>
                <p>
                  <span className="text-muted-foreground">Цена: </span>
                  {formatMoney(plan.priceMinor, currency)}
                  {discount > 0 && (
                    <span className="text-primary ml-1">
                      — выгода {discount}% против поштучной покупки
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  Действует {plan.validityDays} дней с момента покупки
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="method">Способ оплаты</Label>
              <select
                id="method"
                name="method"
                defaultValue="CARD"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="CARD">Карта</option>
                <option value="CASH">Наличные</option>
                <option value="TRANSFER">Перевод</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending || !planId}>
              {pending ? "Оформляем…" : "Продать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
