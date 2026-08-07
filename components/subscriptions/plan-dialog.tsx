"use client";

import { useActionState, useState } from "react";
import { savePlan, type SubscriptionActionState } from "@/app/(admin)/subscriptions/actions";
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
import { discountPercent, formatMoney, minorToInput } from "@/lib/domain/money";

type Plan = {
  id: string;
  serviceId: string;
  name: string;
  sessionsCount: number;
  priceMinor: number;
  validityDays: number;
  isActive: boolean;
};

export function PlanDialog({
  services,
  currency,
  plan,
  trigger,
}: {
  services: Array<{ id: string; name: string; priceMinor: number }>;
  currency: string;
  plan?: Plan;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(plan?.serviceId ?? services[0]?.id ?? "");
  const [sessions, setSessions] = useState(plan?.sessionsCount ?? 5);
  const [price, setPrice] = useState(plan ? Number(minorToInput(plan.priceMinor)) : 0);
  // Диалог закрывается прямо в действии, а не эффектом на state.ok.
  // setState синхронно внутри эффекта вызывает лишний каскад рендеров,
  // и правило react-hooks/set-state-in-effect ругается справедливо:
  // закрытие — следствие успешного действия, а не синхронизация с внешним миром.
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(
    async (previous, formData) => {
      const result = await savePlan(previous, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );


  const service = services.find((item) => item.id === serviceId);
  const fullPrice = service ? service.priceMinor * sessions : 0;
  const discount = service ? discountPercent(price * 100, sessions, service.priceMinor) : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />

      <DialogContent className="sm:max-w-md">
        <form action={action}>
          <DialogHeader>
            <DialogTitle>{plan ? "Изменить пакет" : "Новый пакет"}</DialogTitle>
            <DialogDescription>
              Изменение не затрагивает уже проданные абонементы — в них снимок цены и количества.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {state.error && (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            )}

            {plan && <input type="hidden" name="id" value={plan.id} />}

            <div className="space-y-2">
              <Label htmlFor="serviceId">Услуга</Label>
              <select
                id="serviceId"
                name="serviceId"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                required
              >
                {services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Абонемент действует только на одну услугу
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                name="name"
                defaultValue={plan?.name}
                placeholder="Классический массаж, 10 сеансов"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sessionsCount">Сеансов</Label>
                <Input
                  id="sessionsCount"
                  name="sessionsCount"
                  type="number"
                  min={2}
                  value={sessions}
                  onChange={(event) => setSessions(Number(event.target.value))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Цена пакета, ₽</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price || ""}
                  onChange={(event) => setPrice(Number(event.target.value))}
                  required
                />
              </div>
            </div>

            {service && (
              <p className="text-muted-foreground text-xs">
                Поштучно: {formatMoney(fullPrice, currency)}
                {discount > 0 && <span className="text-primary"> · скидка {discount}%</span>}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="validityDays">Срок действия, дней</Label>
              <Input
                id="validityDays"
                name="validityDays"
                type="number"
                min={1}
                defaultValue={plan?.validityDays ?? 180}
                required
              />
              <p className="text-muted-foreground text-xs">
                По истечении оставшиеся сеансы сгорают
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={plan?.isActive ?? true}
                className="border-input accent-primary size-4 rounded"
              />
              В продаже
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
