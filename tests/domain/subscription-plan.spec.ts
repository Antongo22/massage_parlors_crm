import { describe, expect, it } from "vitest";
import { validateSubscriptionPlan } from "@/lib/domain/subscription-plan";

describe("правила плана абонемента", () => {
  it.each([5, 10])("разрешает пакет на %i сеансов со скидкой", (sessionsCount) => {
    expect(() =>
      validateSubscriptionPlan({
        sessionsCount,
        priceMinor: sessionsCount * 350_000 - 1,
        servicePriceMinor: 350_000,
      }),
    ).not.toThrow();
  });

  it("отвергает пакет с другим числом сеансов", () => {
    expect(() =>
      validateSubscriptionPlan({
        sessionsCount: 6,
        priceMinor: 1_900_000,
        servicePriceMinor: 350_000,
      }),
    ).toThrow("5 или 10");
  });

  it("отвергает пакет без скидки", () => {
    expect(() =>
      validateSubscriptionPlan({
        sessionsCount: 5,
        priceMinor: 1_750_000,
        servicePriceMinor: 350_000,
      }),
    ).toThrow("ниже стоимости отдельных сеансов");
  });

  it("отвергает бесплатный пакет", () => {
    expect(() =>
      validateSubscriptionPlan({ sessionsCount: 5, priceMinor: 0, servicePriceMinor: 350_000 }),
    ).toThrow("больше нуля");
  });
});
