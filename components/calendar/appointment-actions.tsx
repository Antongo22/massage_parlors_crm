"use client";

import { useActionState, useState } from "react";
import { MoreVertical } from "lucide-react";
import { changeAppointmentStatus, type TransitionState } from "@/app/(admin)/calendar/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { allowedTransitions, STATUS_SHORT_LABELS } from "@/lib/domain/appointment";
import { minorToInput } from "@/lib/domain/money";
import type { AppointmentStatus } from "@/generated/prisma/enums";

/**
 * Действия над записью.
 *
 * Список пунктов берётся из машины состояний, а не задан здесь константой:
 * иначе интерфейс предложил бы переход, который сервер отвергнет, и разошёлся
 * бы с доменом при первом же изменении правил.
 */
export function AppointmentActions({
  appointmentId,
  status,
  priceMinor,
  paidBySubscription,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  priceMinor: number;
  paidBySubscription: boolean;
}) {
  const [dialogFor, setDialogFor] = useState<AppointmentStatus | null>(null);
  const [state, action, pending] = useActionState<TransitionState, FormData>(
    changeAppointmentStatus,
    {},
  );

  const transitions = allowedTransitions(status);

  if (transitions.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Действия над записью">
              <MoreVertical className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {transitions.map((next) => (
            <DropdownMenuItem
              key={next}
              onClick={() => setDialogFor(next)}
              variant={next === "CANCELLED" || next === "NO_SHOW" ? "destructive" : undefined}
            >
              {ACTION_LABELS[next]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogFor !== null} onOpenChange={(open) => !open && setDialogFor(null)}>
        <DialogContent className="sm:max-w-md">
          <form action={action}>
            <input type="hidden" name="appointmentId" value={appointmentId} />
            <input type="hidden" name="to" value={dialogFor ?? ""} />

            <DialogHeader>
              <DialogTitle>{dialogFor && ACTION_LABELS[dialogFor]}</DialogTitle>
              <DialogDescription>{dialogFor && DESCRIPTIONS[dialogFor]}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {state.error && (
                <p className="text-destructive text-sm" role="alert">
                  {state.error}
                </p>
              )}

              {dialogFor === "COMPLETED" && !paidBySubscription && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Сумма, ₽</Label>
                    <Input
                      id="amount"
                      name="amountMinorRub"
                      type="number"
                      step="0.01"
                      defaultValue={minorToInput(priceMinor)}
                      onChange={(event) => {
                        const hidden = event.currentTarget.form?.elements.namedItem(
                          "amountMinor",
                        ) as HTMLInputElement | null;

                        if (hidden) {
                          hidden.value = String(Math.round(Number(event.currentTarget.value) * 100));
                        }
                      }}
                    />
                    <input type="hidden" name="amountMinor" defaultValue={priceMinor} />
                    <p className="text-muted-foreground text-xs">
                      По умолчанию — цена на момент записи. Измените, если была скидка.
                    </p>
                  </div>

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
                </>
              )}

              {dialogFor === "COMPLETED" && paidBySubscription && (
                <p className="text-muted-foreground text-sm">
                  Визит оплачен абонементом — при завершении будет списан один сеанс.
                </p>
              )}

              {dialogFor === "CANCELLED" && (
                <div className="space-y-2">
                  <Label htmlFor="reason">Причина отмены</Label>
                  <Textarea id="reason" name="reason" rows={2} placeholder="Клиент перенёс" />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogFor(null)}>
                Отмена
              </Button>
              <Button
                type="submit"
                variant={dialogFor === "CANCELLED" || dialogFor === "NO_SHOW" ? "destructive" : "default"}
                disabled={pending}
              >
                {pending ? "Сохранение…" : "Подтвердить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ACTION_LABELS: Record<AppointmentStatus, string> = {
  ...STATUS_SHORT_LABELS,
  CONFIRMED: "Подтвердить запись",
  COMPLETED: "Визит состоялся",
  NO_SHOW: "Клиент не пришёл",
  CANCELLED: "Отменить запись",
};

const DESCRIPTIONS: Record<AppointmentStatus, string> = {
  PENDING: "",
  CONFIRMED: "Клиент подтвердил, что придёт.",
  COMPLETED: "Зафиксируем оплату и спишем сеанс абонемента, если он использован.",
  NO_SHOW: "Слот был занят и потерян. Неявка отразится в карточке клиента.",
  CANCELLED: "Слот освободится, напоминание будет снято, сеанс абонемента вернётся.",
};
