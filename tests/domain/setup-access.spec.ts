import { afterEach, describe, expect, it } from "vitest";
import {
  isSetupPasswordConfigured,
  isSetupPasswordValid,
} from "@/lib/setup-access";

const originalSetupPassword = process.env.SETUP_ACCESS_PASSWORD;

afterEach(() => {
  if (originalSetupPassword == null) {
    delete process.env.SETUP_ACCESS_PASSWORD;
  } else {
    process.env.SETUP_ACCESS_PASSWORD = originalSetupPassword;
  }
});

describe("защита первоначальной настройки", () => {
  it("не требует пароль, если он не задан в окружении", () => {
    delete process.env.SETUP_ACCESS_PASSWORD;

    expect(isSetupPasswordConfigured()).toBe(false);
    expect(isSetupPasswordValid("любое значение")).toBe(true);
  });

  it("принимает только точное значение SETUP_ACCESS_PASSWORD", () => {
    process.env.SETUP_ACCESS_PASSWORD = "setup-secret-123";

    expect(isSetupPasswordConfigured()).toBe(true);
    expect(isSetupPasswordValid("setup-secret-123")).toBe(true);
    expect(isSetupPasswordValid("setup-secret-124")).toBe(false);
    expect(isSetupPasswordValid(" setup-secret-123 ")).toBe(false);
  });
});
