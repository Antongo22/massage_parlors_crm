import { DomainError } from "@/lib/domain/errors";
import type { AppointmentStatus } from "@/generated/prisma/enums";

/**
 * Машина состояний записи.
 *
 * Единственное место, где решается, какой переход допустим. Разбросанные по
 * обработчикам проверки вида `if (status === 'CONFIRMED')` расходятся уже на
 * третьем экране, и появляется путь, которым запись попадает в COMPLETED,
 * минуя списание абонемента.
 *
 *   PENDING   → CONFIRMED | CANCELLED
 *   CONFIRMED → COMPLETED | NO_SHOW | CANCELLED
 *   остальные — конечные
 */

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "CANCELLED"],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export const ACTIVE_STATUSES: readonly AppointmentStatus[] = ["PENDING", "CONFIRMED"];

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Нельзя перевести запись из состояния «${STATUS_LABELS[from]}» в «${STATUS_LABELS[to]}»`,
    );
  }
}

export function allowedTransitions(from: AppointmentStatus): readonly AppointmentStatus[] {
  return TRANSITIONS[from];
}

/** Занимает ли запись время мастера. Совпадает с условием EXCLUDE-констрейнта. */
export function occupiesSlot(status: AppointmentStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Метки времени, которые обязаны сопровождать переход.
 * Констрейнт appointment_status_fields_consistent не даст сохранить запись
 * без них, поэтому источник значений один и тот же для всех вызовов.
 */
export function timestampsForStatus(status: AppointmentStatus, at: Date) {
  return {
    completedAt: status === "COMPLETED" ? at : null,
    cancelledAt: status === "CANCELLED" ? at : null,
    noShowAt: status === "NO_SHOW" ? at : null,
  };
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Ожидает подтверждения",
  CONFIRMED: "Подтверждена",
  COMPLETED: "Состоялась",
  NO_SHOW: "Клиент не пришёл",
  CANCELLED: "Отменена",
};

export const STATUS_SHORT_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждена",
  COMPLETED: "Состоялась",
  NO_SHOW: "Неявка",
  CANCELLED: "Отменена",
};

/**
 * Может ли клиент отменить запись сам.
 *
 * Позже окна отмены — только через администратора: слот уже нельзя продать
 * другому, и решение о том, прощать ли это, принимает салон, а не клиент.
 */
export function clientCanCancel(
  status: AppointmentStatus,
  startsAt: Date,
  cancellationWindowHours: number,
  now: Date,
): boolean {
  if (!occupiesSlot(status)) return false;

  const hoursLeft = (startsAt.getTime() - now.getTime()) / 3_600_000;
  return hoursLeft >= cancellationWindowHours;
}
