"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { isDomainError } from "@/lib/domain/errors";
import { sellSubscription } from "@/lib/services/subscriptions";

export type SubscriptionActionState = { error?: string; ok?: boolean };

export async function sellSubscriptionAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const admin = await requireAdmin();

  const parsed = z
    .object({
      clientId: z.string().min(1),
      planId: z.string().min(1, "Выберите абонемент"),
      method: z.enum(["CASH", "CARD", "TRANSFER"]),
    })
    .safeParse({
      clientId: formData.get("clientId"),
      planId: formData.get("planId"),
      method: formData.get("method"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте форму" };
  }

  try {
    await sellSubscription({ ...parsed.data, actorUserId: admin.id });
  } catch (error) {
    if (isDomainError(error)) return { error: error.message };

    console.error("Не удалось продать абонемент", error);
    return { error: "Не удалось оформить абонемент" };
  }

  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath("/subscriptions");
  revalidatePath("/finance");

  return { ok: true };
}

const planSchema = z.object({
  id: z.string().optional(),
  serviceId: z.string().min(1, "Выберите услугу"),
  name: z.string().trim().min(2, "Укажите название").max(160),
  sessionsCount: z.number().int().min(2).max(100),
  priceMinor: z.number().int().min(0),
  validityDays: z.number().int().min(1).max(1095),
  isActive: z.boolean(),
});

export async function savePlan(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  await requireAdmin();

  const parsed = planSchema.safeParse({
    id: formData.get("id") || undefined,
    serviceId: formData.get("serviceId"),
    name: formData.get("name"),
    sessionsCount: Number(formData.get("sessionsCount")),
    priceMinor: Math.round(Number(formData.get("price")) * 100),
    validityDays: Number(formData.get("validityDays")),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте форму" };
  }

  const { id, ...data } = parsed.data;

  // Уже проданные абонементы не меняются: у них снимок количества сеансов
  // и уплаченной цены. Правка плана влияет только на будущие продажи.
  if (id) {
    await prisma.subscriptionPlan.update({ where: { id }, data });
  } else {
    await prisma.subscriptionPlan.create({ data });
  }

  revalidatePath("/subscriptions");
  return { ok: true };
}

/**
 * Возврат абонемента.
 *
 * Отдельная операция, а не удаление: деньги вернулись, и это движение должно
 * попасть в отчёт того дня, когда произошло. Активные резервы откатываются,
 * иначе клиент останется записанным по абонементу, которого уже нет.
 */
export async function refundSubscription(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const admin = await requireAdmin();

  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const amountMinor = Math.round(Number(formData.get("amount")) * 100);

  if (!subscriptionId || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { error: "Укажите сумму возврата" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        include: { payments: { where: { kind: "SALE" } } },
      });

      const sale = subscription.payments[0];

      if (!sale) {
        throw new Error("Не найдена исходная продажа абонемента");
      }

      const alreadyRefunded = await tx.payment.aggregate({
        where: { refundedPaymentId: sale.id, kind: "REFUND" },
        _sum: { amountMinor: true },
      });

      // Инвариант «сумма возвратов не больше продажи» агрегатный, поэтому
      // констрейнтом не выражается — держим его здесь, под блокировкой строки.
      if ((alreadyRefunded._sum.amountMinor ?? 0) + amountMinor > sale.amountMinor) {
        throw new Error("Сумма возвратов превышает сумму продажи");
      }

      await tx.payment.create({
        data: {
          clientId: subscription.clientId,
          subscriptionId: subscription.id,
          refundedPaymentId: sale.id,
          kind: "REFUND",
          amountMinor,
          method: sale.method,
          paidAt: new Date(),
        },
      });

      await tx.subscriptionUsage.updateMany({
        where: { subscriptionId: subscription.id, state: "RESERVED" },
        data: { state: "REVERTED", revertedAt: new Date() },
      });

      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "REFUNDED" },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          entity: "Subscription",
          entityId: subscription.id,
          action: "refund",
          diff: { amountMinor },
        },
      });
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Не удалось оформить возврат",
    };
  }

  revalidatePath("/subscriptions");
  revalidatePath("/finance");
  return { ok: true };
}
