"use client";

import { useActionState, useState } from "react";
import { refundSubscription, type SubscriptionActionState } from "@/app/(admin)/subscriptions/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, minorToInput } from "@/lib/domain/money";

export function RefundDialog({
  subscriptionId,
  maxAmountMinor,
  currency,
}: {
  subscriptionId: string;
  maxAmountMinor: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  // Диалог закрывается прямо в действии, а не эффектом на state.ok.
  // setState синхронно внутри эффекта вызывает лишний каскад рендеров,
  // и правило react-hooks/set-state-in-effect ругается справедливо:
  // закрытие — следствие успешного действия, а не синхронизация с внешним миром.
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(
    async (previous, formData) => {
      const result = await refundSubscription(previous, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            Возврат
          </Button>
        }
      />

      <DialogContent className="sm:max-w-sm">
        <form action={action}>
          <input type="hidden" name="subscriptionId" value={subscriptionId} />

          <DialogHeader>
            <DialogTitle>Возврат абонемента</DialogTitle>
            <DialogDescription>
              Возврат — отдельное движение денег и попадёт в отчёт сегодняшнего дня.
              Забронированные по абонементу сеансы вернутся.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {state.error && (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Сумма возврата, ₽</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min={0}
                defaultValue={minorToInput(maxAmountMinor)}
                required
              />
              <p className="text-muted-foreground text-xs">
                Оплачено: {formatMoney(maxAmountMinor, currency)}. Можно вернуть часть.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Оформляем…" : "Вернуть"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
