"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  bookAppointment,
  fetchFreeSlots,
  fetchUsableSubscriptions,
  type BookingState,
} from "@/app/(admin)/calendar/actions";
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

type Service = { id: string; name: string; durationMinutes: number; priceMinor: number };

/**
 * Форма записи: услуга → дата → свободный слот → клиент.
 *
 * Слоты подгружаются серверным действием, а не считаются на клиенте: занятость
 * и график живут в базе, и дублировать логику подбора во фронтенде означало бы
 * иметь две разные версии правила о техническом перерыве.
 */
export function BookingDialog({
  services,
  clients,
  masters,
  defaultDate,
  defaultClientId,
  timezone,
  currency,
  trigger,
}: {
  services: Service[];
  clients: Array<{ id: string; label: string; contraindications: string[] }>;
  masters: Array<{ id: string; displayName: string }>;
  defaultDate: string;
  defaultClientId?: string;
  timezone: string;
  currency: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(Boolean(defaultClientId));
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [masterId, setMasterId] = useState(masters[0]?.id ?? "");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [date, setDate] = useState(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<Array<{ startsAt: string }>>([]);
  const [subscriptions, setSubscriptions] = useState<Array<{ id: string; label: string }>>([]);
  const [paymentMode, setPaymentMode] = useState<"CASH_OR_CARD" | "SUBSCRIPTION">("CASH_OR_CARD");
  const [loading, startLoading] = useTransition();

  // Закрытие — следствие успешного действия, поэтому делается в самом
  // действии, а не эффектом на state.ok: setState синхронно внутри эффекта
  // вызывает лишний каскад рендеров.
  const [state, action, pending] = useActionState<BookingState, FormData>(
    async (previous, formData) => {
      const result = await bookAppointment(previous, formData);

      if (result.ok) {
        setOpen(false);
        setSelectedSlot(null);
      }

      return result;
    },
    {},
  );

  const service = services.find((item) => item.id === serviceId);
  const selectedClient = clients.find((item) => item.id === clientId);

  // Слоты зависят от услуги (её длительности), мастера и даты — пересчитываем
  // при изменении любого из трёх. Сброс выбранного слота идёт внутри перехода,
  // а не синхронно в теле эффекта: иначе форма перерисовывается дважды.
  useEffect(() => {
    if (!open || !serviceId || !masterId || !date) return;

    startLoading(async () => {
      const next = await fetchFreeSlots({ masterId, serviceId, date });

      // Ранее выбранное время могло исчезнуть из новой выдачи —
      // безопаснее заставить выбрать заново, чем отправить неактуальный слот.
      setSelectedSlot(null);
      setSlots(next);
    });
  }, [open, serviceId, masterId, date]);

  // Абонементы зависят от пары клиент+услуга: пакет действует на одну услугу.
  useEffect(() => {
    if (!open) return;

    startLoading(async () => {
      const usable =
        clientId && serviceId ? await fetchUsableSubscriptions(clientId, serviceId) : [];

      setSubscriptions(usable);

      // Есть подходящий абонемент — предлагаем его по умолчанию: иначе
      // администратор возьмёт деньги за визит, который уже оплачен пакетом.
      setPaymentMode(usable.length > 0 ? "SUBSCRIPTION" : "CASH_OR_CARD");
    });
  }, [open, clientId, serviceId]);

  const formatSlot = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />

      <DialogContent className="sm:max-w-xl">
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Новая запись</DialogTitle>
            <DialogDescription>
              Свободные слоты рассчитываются по графику мастера с учётом занятости
              и технического перерыва.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
            {state.error && (
              <p className="text-destructive rounded-md border border-current/20 bg-current/5 p-3 text-sm" role="alert">
                <span className="text-foreground">{state.error}</span>
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="clientId">Клиент</Label>
              <select
                id="clientId"
                name="clientId"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                required
              >
                <option value="">Выберите клиента</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.label}
                  </option>
                ))}
              </select>
              {selectedClient && selectedClient.contraindications.length > 0 && (
                <div className="border-destructive/30 bg-destructive/5 rounded-md border p-3">
                  <p className="text-destructive text-xs font-medium">Противопоказания</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {selectedClient.contraindications.map((body) => (
                      <li key={body}>{body}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Дата</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
            </div>

            {masters.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="masterId">Мастер</Label>
                <select
                  id="masterId"
                  name="masterId"
                  value={masterId}
                  onChange={(event) => setMasterId(event.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  {masters.map((master) => (
                    <option key={master.id} value={master.id}>
                      {master.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {masters.length <= 1 && <input type="hidden" name="masterId" value={masterId} />}

            <div className="space-y-2">
              <Label>Свободное время</Label>
              {loading ? (
                <p className="text-muted-foreground py-4 text-center text-sm">Считаем слоты…</p>
              ) : slots.length === 0 ? (
                <p className="text-muted-foreground bg-muted/40 rounded-md py-6 text-center text-sm">
                  На эту дату свободных слотов нет.
                  <br />
                  Выберите другой день или услугу покороче.
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
                      {formatSlot(slot.startsAt)}
                    </button>
                  ))}
                </div>
              )}
              <input type="hidden" name="startsAt" value={selectedSlot ?? ""} />
            </div>

            <div className="space-y-2">
              <Label>Оплата</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="paymentMode"
                    value="CASH_OR_CARD"
                    checked={paymentMode === "CASH_OR_CARD"}
                    onChange={() => setPaymentMode("CASH_OR_CARD")}
                    className="accent-primary size-4"
                  />
                  Наличные или карта
                </label>

                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    subscriptions.length === 0 && "text-muted-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="paymentMode"
                    value="SUBSCRIPTION"
                    checked={paymentMode === "SUBSCRIPTION"}
                    onChange={() => setPaymentMode("SUBSCRIPTION")}
                    disabled={subscriptions.length === 0}
                    className="accent-primary size-4"
                  />
                  По абонементу
                  {subscriptions.length === 0 && clientId && " — подходящего нет"}
                </label>
              </div>

              {paymentMode === "SUBSCRIPTION" && subscriptions.length > 0 && (
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

            <div className="space-y-2">
              <Label htmlFor="internalNote">Заметка для салона</Label>
              <Textarea id="internalNote" name="internalNote" rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending || !selectedSlot || !clientId}>
              {pending ? "Записываем…" : "Записать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
