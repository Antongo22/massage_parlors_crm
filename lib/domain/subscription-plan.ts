import { DomainError } from "@/lib/domain/errors";

/** Пакеты из ТЗ: другие размеры нельзя случайно выставить через API. */
export const SUBSCRIPTION_SESSION_COUNTS = [5, 10] as const;

export function validateSubscriptionPlan(input: {
  sessionsCount: number;
  priceMinor: number;
  servicePriceMinor: number;
}): void {
  if (!SUBSCRIPTION_SESSION_COUNTS.includes(input.sessionsCount as 5 | 10)) {
    throw new DomainError(
      "INVALID_SUBSCRIPTION_PLAN",
      "Абонемент должен содержать 5 или 10 сеансов",
    );
  }

  if (input.priceMinor <= 0) {
    throw new DomainError("INVALID_SUBSCRIPTION_PLAN", "Цена абонемента должна быть больше нуля");
  }

  const regularPriceMinor = input.sessionsCount * input.servicePriceMinor;

  if (input.priceMinor >= regularPriceMinor) {
    throw new DomainError(
      "INVALID_SUBSCRIPTION_PLAN",
      "Цена абонемента должна быть ниже стоимости отдельных сеансов",
    );
  }
}
