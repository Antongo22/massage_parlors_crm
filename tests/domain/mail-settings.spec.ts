import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveFallbackMailSettings } from "@/lib/mail";

describe("резервные настройки почты", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("выбирает внутренний Mailpit независимо от старого SMTP_PORT", () => {
    vi.stubEnv("MAILPIT_SMTP_HOST", "mailpit");
    vi.stubEnv("MAILPIT_SMTP_PORT", "1025");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_PORT", "587");

    expect(resolveFallbackMailSettings()).toMatchObject({
      host: "mailpit",
      port: 1025,
      secure: false,
      source: "mailpit",
    });
  });

  it("сохраняет совместимость с SMTP окружения без Mailpit", () => {
    vi.stubEnv("MAILPIT_SMTP_HOST", "");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "owner@example.com");
    vi.stubEnv("SMTP_PASSWORD", "secret");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("MAIL_FROM", "Salon <owner@example.com>");

    expect(resolveFallbackMailSettings()).toEqual({
      host: "smtp.example.com",
      port: 465,
      user: "owner@example.com",
      password: "secret",
      secure: true,
      from: "Salon <owner@example.com>",
      source: "environment",
    });
  });

  it("отклоняет некорректный порт", () => {
    vi.stubEnv("MAILPIT_SMTP_HOST", "");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "not-a-number");

    expect(resolveFallbackMailSettings()).toBeNull();
  });
});
