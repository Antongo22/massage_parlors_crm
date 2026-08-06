"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOwnsAppointment, requireClientProfile } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { clientCanCancel } from "@/lib/domain/appointment";
import { DomainError, isDomainError } from "@/lib/domain/errors";
import { type LocalDate } from "@/lib/domain/time";
import { createAppointment, getFreeSlots, transitionAppointment } from "@/lib/services/appointments";
import { requireOrganization } from "@/lib/services/organization";
import { getUsableSubscriptions } from "@/lib/services/subscriptions";

export type ClientBookingState = { error?: string; ok?: boolean };

/**
 * Самозапись клиента.
 *
 * Отличается от администраторской не формой, а правами: клиент записывается
 * только на себя (clientId берётся из сессии, а не из формы), не может обойти
 * минимальный запас до сеанса и создаёт запись в статусе PENDING —
 * подтверждает её салон.
 */
export async function bookOwnAppointment(
  _prev: ClientBookingState,
  formData: FormData,
): Promise<ClientBookingState> {
  const { user, client } = await requireClientProfile();

  const parsed = z
    .object({
      serviceId: z.string().min(1, "Выберите услугу"),
      masterId: z.string().min(1),
      startsAt: z.string().min(1, "Выберите время"),
      paymentMode: z.enum(["CASH_OR_CARD", "SUBSCRIPTION"]),
      subscriptionId: z.string().optional(),
      clientComment: z.string().trim().max(500).optional(),
    })
    .safeParse({
      serviceId: formData.get("serviceId"),
      masterId: formData.get("masterId"),
      startsAt: formData.get("startsAt"),
      paymentMode: formData.get("paymentMode"),
      subscriptionId: formData.get("subscriptionId") || undefined,
      clientComment: formData.get("clientComment") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте форму" };
  }

  try {
    await createAppointment({
      clientId: client.id,
      masterId: parsed.data.masterId,
      serviceId: parsed.data.serviceId,
      startsAt: new Date(parsed.data.startsAt),
      paymentMode: parsed.data.paymentMode,
      subscriptionId: parsed.data.subscriptionId ?? null,
      clientComment: parsed.data.clientComment ?? null,
      byAdmin: false,
      actorUserId: user.id,
    });
  } catch (error) {
    if (isDomainError(error)) return { error: error.message };

    console.error("Клиент не смог записаться", error);
    return { error: "Не удалось записаться. Попробуйте другое время" };
  }

  revalidatePath("/my");
  return { ok: true };
}

export async function cancelOwnAppointment(
  _prev: ClientBookingState,
  formData: FormData,
): Promise<ClientBookingState> {
  const { user } = await requireClientProfile();
  const appointmentId = String(formData.get("appointmentId") ?? "");

  try {
    await assertOwnsAppointment(appointmentId);

    const organization = await requireOrganization();
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { status: true, startsAt: true },
    });

    // Позже окна отмены слот уже не продать, и решение о том, прощать ли это,
    // принимает салон. Клиенту показываем телефон, а не молча отказываем.
    if (
      !clientCanCancel(
        appointment.status,
        appointment.startsAt,
        organization.cancellationWindowHours,
        new Date(),
      )
    ) {
      throw new DomainError(
        "FORBIDDEN",
        `Отменить самостоятельно можно не позже чем за ${organization.cancellationWindowHours} ч до сеанса. Позвоните администратору`,
      );
    }

    await transitionAppointment({
      appointmentId,
      to: "CANCELLED",
      actorUserId: user.id,
      reason: "Отменено клиентом",
    });
  } catch (error) {
    if (isDomainError(error)) return { error: error.message };

    console.error("Не удалось отменить запись", error);
    return { error: "Не удалось отменить запись" };
  }

  revalidatePath("/my");
  return { ok: true };
}

export async function fetchClientSlots(params: {
  masterId: string;
  serviceId: string;
  date: LocalDate;
}) {
  await requireClientProfile();

  const slots = await getFreeSlots({ ...params, byAdmin: false });

  return slots.map((slot) => ({ startsAt: slot.startsAt.toISOString() }));
}

export async function fetchOwnSubscriptions(serviceId: string) {
  const { client } = await requireClientProfile();

  const subscriptions = await getUsableSubscriptions(client.id, serviceId);

  return subscriptions.map((subscription) => ({
    id: subscription.id,
    label: `${subscription.serviceNameSnapshot} — осталось ${subscription.available} из ${subscription.sessionsTotal}`,
  }));
}
