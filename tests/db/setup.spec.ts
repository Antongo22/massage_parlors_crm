import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { saveStep1, saveStep2 } from "@/lib/services/setup";
import { pool, truncateAll } from "./helpers";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("возврат по шагам первичной настройки", () => {
  it("обновляет исходного администратора при повторном сохранении первого шага", async () => {
    await saveStep1({
      organizationName: "Первое название",
      timezone: "Europe/Moscow",
      adminName: "Анна",
      adminEmail: "old@example.com",
    });
    await saveStep1({
      organizationName: "Новое название",
      timezone: "Asia/Yekaterinburg",
      adminName: "Мария",
      adminEmail: "new@example.com",
    });

    const users = await pool.query<{ email: string; name: string }>(
      `SELECT email, name FROM "User" WHERE role = 'ADMIN'`,
    );
    const organization = await pool.query<{ name: string; timezone: string }>(
      `SELECT name, timezone FROM "Organization"`,
    );

    expect(users.rows).toEqual([{ email: "new@example.com", name: "Мария" }]);
    expect(organization.rows).toEqual([
      { name: "Новое название", timezone: "Asia/Yekaterinburg" },
    ]);
  });

  it("перезаписывает график без создания второго мастера", async () => {
    await saveStep1({
      organizationName: "Салон",
      timezone: "Europe/Moscow",
      adminName: "Анна",
      adminEmail: "admin@example.com",
    });

    const base = {
      specialization: "Массаж",
      slotStepMinutes: 15,
      bufferMinutes: 15,
      minLeadTimeMinutes: 120,
      cancellationWindowHours: 12,
      reminderOffsetMinutes: 120,
      chargeSubscriptionOnNoShow: true,
    };

    await saveStep2({
      ...base,
      masterName: "Анна",
      days: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        enabled: weekday === 1,
        startMinute: 600,
        endMinute: 1200,
      })),
    });
    await saveStep2({
      ...base,
      masterName: "Анна Петрова",
      days: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        enabled: weekday === 2,
        startMinute: 660,
        endMinute: 1080,
      })),
    });

    const masters = await pool.query<{ count: string; name: string }>(
      `SELECT count(*)::text AS count, max("displayName") AS name FROM "Master"`,
    );
    const hours = await pool.query<{ weekday: number; startMinute: number; endMinute: number }>(
      `SELECT weekday, "startMinute", "endMinute" FROM "WorkingHours"`,
    );

    expect(masters.rows[0]).toEqual({ count: "1", name: "Анна Петрова" });
    expect(hours.rows).toEqual([{ weekday: 2, startMinute: 660, endMinute: 1080 }]);
  });
});
