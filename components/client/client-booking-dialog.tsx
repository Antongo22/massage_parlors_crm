"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  bookOwnAppointment,
  fetchClientSlots,
  fetchOwnSubscriptions,
  type ClientBookingState,
} from "@/app/(client)/my/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  description: string | null;
};

/**
 * Самозапись клиента.
 *
 * От администраторской формы отличается не только правами: здесь нет выбора
 * клиента и нет способа записаться раньше минимального запаса — слоты в этом
 * окне сервер просто не вернёт.
 */
export function ClientBookingDialog({
  services,
  masters,
  defaultDate,
  timezone,
  currency,
  minLeadTimeMinutes,
  trigger,
}: {
  services: Service[];
  masters: Array<{ id: string; displayName: string }>;
  defaultDate: string;
  timezone: string;
  currency: string;
  minLeadTimeMinutes: number;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [masterId] = useState(masters[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<Array<{ startsAt: string }>>([]);
  const [subscriptions, setSubscriptions] = useState<Array<{ id: string; label: string }>>([]);
  const [paymentMode, setPaymentMode] = useState<"CASH_OR_CARD" | "SUBSCRIPTION">("CASH_OR_CARD");
  const [loading, startLoading] = useTransition();

  // Закрытие делается в самом действии, а не эффектом на state.ok:
  // setState синхронно внутри эффекта вызывает лишний каскад рендеров.
  const [state, action, pending] = useActionState<ClientBookingState, FormData>(
    async (previous, formData) => {
      const result = await bookOwnAppointment(previous, formData);

      if (result.ok) {
        setOpen(false);
        setSelectedSlot(null);
      }

      return result;
    },
    {},
  );

  const service = services.find((item) => item.id === serviceId);

  useEffect(() => {
    if (!open || !serviceId || !masterId) return;

    startLoading(async () => {
      const next = await fetchClientSlots({ masterId, serviceId, date });

      // Ранее выбранное время могло исчезнуть из новой выдачи.
      setSelectedSlot(null);
      setSlots(next);
    });
  }, [open, serviceId, masterId, date]);

  useEffect(() => {
    if (!open || !serviceId) return;

    startLoading(async () => {
      const usable = await fetchOwnSubscriptions(serviceId);
      setSubscriptions(usable);
      setPaymentMode(usable.length > 0 ? "SUBSCRIPTION" : "CASH_OR_CARD");
    });
  }, [open, serviceId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />

      <DialogContent className="sm:max-w-lg">
        <form action={action}>
          <input type="hidden" name="masterId" value={masterId} />

          <DialogHeader>
            <DialogTitle>Записаться на сеанс</DialogTitle>
            <DialogDescription>
              Запись подтверждает администратор. Напоминание придёт на почту заранее.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
            {state.error && (
              <p className="text-destructive rounded-md border border-current/20 bg-current/5 p-3 text-sm" role="alert">
                <span className="text-foreground">{state.error}</span>
              </p>
            )}

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
              {service && (
                <p className="text-muted-foreground text-xs">
                  {formatDuration(service.durationMinutes)} ·{" "}
                  {formatMoney(service.priceMinor, currency)}
                  {service.description && ` · ${service.description}`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Дата</Label>
              <Input
                id="date"
                type="date"
                value={date}
                min={defaultDate}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Свободное время</Label>
              {loading ? (
                <p className="text-muted-foreground py-4 text-center text-sm">Ищем слоты…</p>
              ) : slots.length === 0 ? (
                <p className="text-muted-foreground bg-muted/40 rounded-md py-6 text-center text-sm">
                  На этот день свободного времени нет.
                  <br />
                  Записаться можно не позднее чем за{" "}
                  {Math.round(minLeadTimeMinutes / 60)} ч до сеанса.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => setSelectedSlot(slot.startsAt)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm tabular-nums transition-colors",
                        selectedSlot === slot.startsAt
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-muted",
                      )}
                    >
                      {new Date(slot.startsAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: timezone,
                      })}
                    </button>
                  ))}
                </div>
              )}
              <input type="hidden" name="startsAt" value={selectedSlot ?? ""} />
            </div>

            {subscriptions.length > 0 && (
              <div className="space-y-2">
                <Label>Оплата</Label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="paymentMode"
                    value="SUBSCRIPTION"
                    checked={paymentMode === "SUBSCRIPTION"}
                    onChange={() => setPaymentMode("SUBSCRIPTION")}
                    className="accent-primary size-4"
                  />
                  Списать с абонемента
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="paymentMode"
                    value="CASH_OR_CARD"
                    checked={paymentMode === "CASH_OR_CARD"}
                    onChange={() => setPaymentMode("CASH_OR_CARD")}
                    className="accent-primary size-4"
                  />
                  Оплатить на месте
                </label>

                {paymentMode === "SUBSCRIPTION" && (
                  <select
                    name="subscriptionId"
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    aria-label="Абонемент"
                  >
                    {subscriptions.map((subscription) => (
                      <option key={subscription.id} value={subscription.id}>
                        {subscription.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {subscriptions.length === 0 && (
              <input type="hidden" name="paymentMode" value="CASH_OR_CARD" />
            )}

            <div className="space-y-2">
              <Label htmlFor="clientComment">Пожелания</Label>
              <Textarea
                id="clientComment"
                name="clientComment"
                rows={2}
                placeholder="Побольше внимания пояснице"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending || !selectedSlot}>
              {pending ? "Записываем…" : "Записаться"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
