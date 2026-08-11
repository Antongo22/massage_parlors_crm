import { describe, expect, it } from "vitest";
import { resolveSetupStep } from "@/lib/domain/setup";

describe("навигация первичной настройки", () => {
  it("разрешает вернуться только на уже доступный шаг", () => {
    expect(resolveSetupStep("1", 3)).toBe(1);
    expect(resolveSetupStep("2", 3)).toBe(2);
    expect(resolveSetupStep("3", 3)).toBe(3);
  });

  it("не позволяет URL открыть будущий или некорректный шаг", () => {
    expect(resolveSetupStep("3", 2)).toBe(2);
    expect(resolveSetupStep("0", 2)).toBe(2);
    expect(resolveSetupStep("abc", 2)).toBe(2);
    expect(resolveSetupStep(undefined, 2)).toBe(2);
  });
});
