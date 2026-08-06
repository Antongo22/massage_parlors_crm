import "server-only";
import { prisma } from "@/lib/db";
import { assertTransition, occupiesSlot, timestampsForStatus } from "@/lib/domain/appointment";
import { DomainError, isSlotConflict } from "@/lib/domain/errors";
import { computeFreeSlots, isSlotAvailable, type Slot } from "@/lib/domain/slots";
import { addMinutes, localDayRange, toLocalDate, type LocalDate } from "@/lib/domain/time";
import {
  cancelReminder,
  enqueueReminder,
  notificationsDisabled,
  scheduleReminder,
} from "@/lib/services/notifications";
import { requireOrganization } from "@/lib/services/organization";
import { consumeSubscriptionSession, releaseSubscriptionSession, reserveSubscriptionSession } from "@/lib/services/subscriptions";
import type { AppointmentStatus, PaymentMode } from "@/generated/prisma/enums";

/**
 * Сценарии работы с записями.
 *
 * Здесь и только здесь запись меняет состояние. Побочные эффекты перехода
 * (списание абонемента, платёж, напоминание, счётчик неявок) собраны рядом
 * с самим переходом, иначе появится путь, на котором визит завершён,
 * а сеанс абонемента не списан.
 */

export type CreateAppointmentInput = {
  clientId: string;
  masterId: string;
  serviceId: string;
  startsAt: Date;
  paymentMode: PaymentMode;
  subscriptionId?: string | null;
  clientComment?: string | null;
  internalNote?: string | null;
  /** Записывает администратор: минимальный запас до сеанса на него не распространяется. */
  byAdmin: boolean;
  actorUserId: string | null;
};

export async function getFreeSlots(params: {
  masterId: string;
  serviceId: string;
  date: LocalDate;
  byAdmin: boolean;
  now?: Date;
}): Promise<Slot[]> {
  const now = params.now ?? new Date();
  const organization = await requireOrganization();

  const [service, workingHours, timeOff, busy] = await Promise.all([
    prisma.service.findUniqueOrThrow({
      where: { id: params.serviceId },
      select: { durationMinutes: true },
    }),
    prisma.workingHours.findMany({ where: { masterId: params.masterId } }),
    findTimeOffAround(params.masterId, params.date, organization.timezone),
    findBusyAround(params.masterId, params.date, organization.timezone),
  ]);

  return computeFreeSlots({
    date: params.date,
    timezone: organization.timezone,
    workingHours,
    timeOff,
    busy,
    serviceDurationMinutes: service.durationMinutes,
    bufferMinutes: organization.bufferMinutes,
    slotStepMinutes: organization.slotStepMinutes,
    now,
    minLeadTimeMinutes: params.byAdmin ? 0 : organization.minLeadTimeMinutes,
  });
}

export async function createAppointment(input: CreateAppointmentInput) {
  const now = new Date();
  const organization = await requireOrganization();

  const service = await prisma.service.findUniqueOrThrow({
    where: { id: input.serviceId },
    select: { id: true, name: true, priceMinor: true, durationMinutes: true, isActive: true },
  });

  if (!service.isActive) {
    throw new DomainError("NOT_FOUND", "Услуга снята с продажи");
  }

  const date = toLocalDate(input.startsAt, organization.timezone);

  const [workingHours, timeOff, busy] = await Promise.all([
    prisma.workingHours.findMany({ where: { masterId: input.masterId } }),
    findTimeOffAround(input.masterId, date, organization.timezone),
    findBusyAround(input.masterId, date, organization.timezone),
  ]);

  // Предварительная проверка — ради внятного сообщения. Окончательную даёт
  // EXCLUDE-констрейнт ниже: между этой проверкой и вставкой слот может уйти.
  const available = isSlotAvailable(input.startsAt, {
    date,
    timezone: organization.timezone,
    workingHours,
    timeOff,
    busy,
    serviceDurationMinutes: service.durationMinutes,
    bufferMinutes: organization.bufferMinutes,
    slotStepMinutes: organization.slotStepMinutes,
    now,
    minLeadTimeMinutes: input.byAdmin ? 0 : organization.minLeadTimeMinutes,
  });

  if (!available) {
    throw new DomainError("SLOT_TAKEN", "Это время недоступно: выберите другой слот");
  }

  const endsAt = addMinutes(input.startsAt, service.durationMinutes);
  const blockedUntil = addMinutes(endsAt, organization.bufferMinutes);

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          clientId: input.clientId,
          masterId: input.masterId,
          serviceId: service.id,
          startsAt: input.startsAt,
          endsAt,
          blockedUntil,
          status: input.byAdmin ? "CONFIRMED" : "PENDING",
          serviceNameSnapshot: service.name,
          priceMinorSnapshot: service.priceMinor,
          durationMinutesSnapshot: service.durationMinutes,
          bufferMinutesSnapshot: organization.bufferMinutes,
          paymentMode: input.paymentMode,
          clientComment: input.clientComment ?? null,
          internalNote: input.internalNote ?? null,
          createdByUserId: input.actorUserId,
        },
      });

      if (input.paymentMode === "SUBSCRIPTION") {
        if (!input.subscriptionId) {
          throw new DomainError("NOT_FOUND", "Не выбран абонемент для списания");
        }

        await reserveSubscriptionSession(tx, {
          subscriptionId: input.subscriptionId,
          appointmentId: created.id,
          clientId: input.clientId,
          serviceId: service.id,
          now,
        });
      }

      await scheduleReminder(tx, created, organization.reminderOffsetMinutes, now);

      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          entity: "Appointment",
          entityId: created.id,
          action: "create",
          diff: { status: created.status, startsAt: created.startsAt.toISOString() },
        },
      });

      return created;
    });

    if (!notificationsDisabled()) {
      // Вне транзакции: воркер не должен увидеть задачу раньше, чем запись
      // станет видимой другим соединениям.
      //
      // Ошибка постановки не отменяет запись: она уже создана и зафиксирована,
      // а недоступный Redis — не повод говорить администратору «не получилось»
      // и провоцировать повторную попытку, которая упрётся в занятый слот.
      // Напоминание при этом не потеряется совсем: NotificationLog помнит,
      // что оно запланировано, и воркер может добрать такие записи.
      try {
        await enqueueReminder(
          appointment.id,
          appointment.startsAt,
          organization.reminderOffsetMinutes,
          now,
        );
      } catch (error) {
        console.error(`Не удалось поставить напоминание по записи ${appointment.id}`, error);

        await prisma.notificationLog.updateMany({
          where: { appointmentId: appointment.id, type: "REMINDER_2H" },
          data: { status: "FAILED", lastError: String(error) },
        });
      }
    }

    return appointment;
  } catch (error) {
    if (isSlotConflict(error)) {
      throw new DomainError("SLOT_TAKEN", "Слот только что заняли. Выберите другое время");
    }

    throw error;
  }
}

export type TransitionInput = {
  appointmentId: string;
  to: AppointmentStatus;
  actorUserId: string | null;
  reason?: string | null;
  /** Оплата разового визита при завершении. */
  payment?: { amountMinor: number; method: "CASH" | "CARD" | "TRANSFER" } | null;
};

export async function transitionAppointment(input: TransitionInput) {
  const now = new Date();
  const organization = await requireOrganization();

  const updated = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
      include: { usage: true },
    });

    if (!appointment) {
      throw new DomainError("NOT_FOUND", "Запись не найдена");
    }

    assertTransition(appointment.status, input.to);

    if (input.to === "COMPLETED") {
      if (appointment.usage) {
        await consumeSubscriptionSession(tx, appointment.usage.id, now);
      } else {
        // Разовый визит: фиксируем поступление. Сумма по умолчанию — снимок
        // цены, но администратор может указать другую (скидка, доплата).
        await tx.payment.create({
          data: {
            clientId: appointment.clientId,
            appointmentId: appointment.id,
            kind: "SALE",
            amountMinor: input.payment?.amountMinor ?? appointment.priceMinorSnapshot,
            method: input.payment?.method ?? "CASH",
            paidAt: now,
          },
        });
      }
    }

    if (input.to === "NO_SHOW") {
      await tx.client.update({
        where: { id: appointment.clientId },
        data: { noShowCount: { increment: 1 } },
      });

      // Политика салона: по умолчанию сеанс сгорает — слот был занят и потерян.
      if (appointment.usage) {
        if (organization.chargeSubscriptionOnNoShow) {
          await consumeSubscriptionSession(tx, appointment.usage.id, now);
        } else {
          await releaseSubscriptionSession(tx, appointment.usage.id, now);
        }
      }
    }

    if (input.to === "CANCELLED" && appointment.usage) {
      await releaseSubscriptionSession(tx, appointment.usage.id, now);
    }

    const result = await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: input.to,
        ...timestampsForStatus(input.to, now),
        cancelReason: input.to === "CANCELLED" ? (input.reason ?? null) : appointment.cancelReason,
        cancelledByUserId: input.to === "CANCELLED" ? input.actorUserId : null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entity: "Appointment",
        entityId: appointment.id,
        action: "status_change",
        diff: { from: appointment.status, to: input.to, reason: input.reason ?? null },
      },
    });

    return result;
  });

  // Слот освободился — напоминание больше не нужно.
  if (!occupiesSlot(input.to) && !notificationsDisabled()) {
    await cancelReminder(input.appointmentId);
  }

  return updated;
}

/**
 * Записи одного локального дня. Границы суток считаются через таймзону салона,
 * а не через UTC-полночь: иначе вечерние записи уезжали бы в соседний день.
 */
export async function getAppointmentsForDay(date: LocalDate, timezone: string) {
  const { from, to } = localDayRange(date, timezone);

  return prisma.appointment.findMany({
    where: { startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, phone: true } },
      service: { select: { id: true, name: true } },
      master: { select: { id: true, displayName: true, color: true } },
      usage: { select: { id: true, state: true } },
    },
  });
}

/** Занятость с запасом в сутки по краям: сеанс может начаться вечером и т.п. */
async function findBusyAround(masterId: string, date: LocalDate, timezone: string) {
  const { from, to } = localDayRange(date, timezone);

  return prisma.appointment.findMany({
    where: {
      masterId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: addMinutes(from, -24 * 60) },
      blockedUntil: { lte: addMinutes(to, 24 * 60) },
    },
    select: { startsAt: true, blockedUntil: true },
  });
}

async function findTimeOffAround(masterId: string, date: LocalDate, timezone: string) {
  const { from, to } = localDayRange(date, timezone);

  return prisma.timeOff.findMany({
    where: { masterId, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { startsAt: true, endsAt: true },
  });
}
