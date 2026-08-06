"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { isDomainError } from "@/lib/domain/errors";
import { type LocalDate } from "@/lib/domain/time";
import { createAppointment, getFreeSlots, transitionAppointment } from "@/lib/services/appointments";
import { getUsableSubscriptions } from "@/lib/services/subscriptions";

export type BookingState = { error?: string; ok?: boolean };

const bookingSchema = z.object({
  clientId: z.string().min(1, "Выберите клиента"),
  masterId: z.string().min(1),
  serviceId: z.string().min(1, "Выберите услугу"),
  startsAt: z.string().min(1, "Выберите время"),
  paymentMode: z.enum(["CASH_OR_CARD", "SUBSCRIPTION"]),
  subscriptionId: z.string().optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

export async function bookAppointment(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const admin = await requireAdmin();

  const parsed = bookingSchema.safeParse({
    clientId: formData.get("clientId"),
    masterId: formData.get("masterId"),
    serviceId: formData.get("serviceId"),
    startsAt: formData.get("startsAt"),
    paymentMode: formData.get("paymentMode"),
    subscriptionId: formData.get("subscriptionId") || undefined,
    internalNote: formData.get("internalNote") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте заполнение формы" };
  }

  try {
    await createAppointment({
      clientId: parsed.data.clientId,
      masterId: parsed.data.masterId,
      serviceId: parsed.data.serviceId,
      startsAt: new Date(parsed.data.startsAt),
      paymentMode: parsed.data.paymentMode,
      subscriptionId: parsed.data.subscriptionId ?? null,
      internalNote: parsed.data.internalNote ?? null,
      byAdmin: true,
      actorUserId: admin.id,
    });
  } catch (error) {
    // Ошибки домена написаны для человека: «слот только что заняли»,
    // «в абонементе не осталось сеансов». Всё остальное — наша проблема.
    if (isDomainError(error)) return { error: error.message };

    console.error("Не удалось создать запись", error);
    return { error: "Не удалось создать запись. Попробуйте ещё раз" };
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type TransitionState = { error?: string; ok?: boolean };

export async function changeAppointmentStatus(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const admin = await requireAdmin();

  const appointmentId = String(formData.get("appointmentId") ?? "");
  const to = String(formData.get("to") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const method = String(formData.get("method") ?? "CASH");

  if (!["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"].includes(to)) {
    return { error: "Недопустимый статус" };
  }

  try {
    await transitionAppointment({
      appointmentId,
      to: to as "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED",
      actorUserId: admin.id,
      reason,
      payment:
        to === "COMPLETED" && ["CASH", "CARD", "TRANSFER"].includes(method)
          ? { amountMinor: Number(formData.get("amountMinor")) || 0, method: method as "CASH" }
          : null,
    });
  } catch (error) {
    if (isDomainError(error)) return { error: error.message };

    console.error("Не удалось изменить статус записи", error);
    return { error: "Не удалось изменить статус" };
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  return { ok: true };
}

/** Свободные слоты для формы записи. Вызывается из клиентского компонента. */
export async function fetchFreeSlots(params: {
  masterId: string;
  serviceId: string;
  date: LocalDate;
}): Promise<Array<{ startsAt: string; label: string }>> {
  await requireAdmin();

  const slots = await getFreeSlots({ ...params, byAdmin: true });

  return slots.map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    label: slot.startsAt.toISOString(),
  }));
}

export async function fetchUsableSubscriptions(clientId: string, serviceId: string) {
  await requireAdmin();

  const subscriptions = await getUsableSubscriptions(clientId, serviceId);

  return subscriptions.map((subscription) => ({
    id: subscription.id,
    label: `${subscription.serviceNameSnapshot} — осталось ${subscription.available} из ${subscription.sessionsTotal}`,
  }));
}
