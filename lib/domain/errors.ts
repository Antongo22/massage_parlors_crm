/**
 * Ошибки домена.
 *
 * Отдельный класс, а не Error со строкой: серверные действия должны отличать
 * «пользователь сделал недопустимое» от «что-то сломалось». Первое показывается
 * человеку как есть, второе — превращается в «попробуйте позже» и уходит в лог.
 */

export type DomainErrorCode =
  | "SLOT_TAKEN"
  | "SLOT_OUTSIDE_WORKING_HOURS"
  | "SLOT_IN_PAST"
  | "SLOT_TOO_SOON"
  | "INVALID_TRANSITION"
  | "SUBSCRIPTION_EXHAUSTED"
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_WRONG_SERVICE"
  | "SUBSCRIPTION_NOT_ACTIVE"
  | "REFUND_EXCEEDS_SALE"
  | "NOT_FOUND"
  | "FORBIDDEN";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Нарушение EXCLUDE-констрейнта на пересечение записей.
 *
 * Проверка занятости перед вставкой — для интерфейса; окончательная гарантия
 * даёт база. Гонку двух одновременных бронирований видно только здесь,
 * и превращать её нужно в понятное «слот только что заняли», а не в 500.
 */
export function isSlotConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23P01"
  );
}
