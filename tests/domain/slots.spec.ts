import { describe, expect, it } from "vitest";
import { computeFreeSlots, isSlotAvailable, type SlotQuery } from "@/lib/domain/slots";
import { formatLocalTime } from "@/lib/domain/time";

/**
 * Тесты движка слотов. База не нужна: функция чистая, всё влияющее на результат
 * приходит аргументами. Это и было целью — переход на летнее время и арифметику
 * буфера иначе пришлось бы проверять через поднятый Postgres и живое расписание.
 */

const TZ = "Europe/Moscow";

// 10:00–18:00 по понедельникам и вторникам
const WORKING_HOURS = [
  { weekday: 1, startMinute: 10 * 60, endMinute: 18 * 60 },
  { weekday: 2, startMinute: 10 * 60, endMinute: 18 * 60 },
];

function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    date: "2026-09-07", // понедельник
    timezone: TZ,
    workingHours: WORKING_HOURS,
    timeOff: [],
    busy: [],
    serviceDurationMinutes: 60,
    bufferMinutes: 0,
    slotStepMinutes: 60,
    now: new Date("2026-09-01T00:00:00Z"),
    minLeadTimeMinutes: 0,
    ...overrides,
  };
}

const times = (slots: { startsAt: Date }[]) => slots.map((s) => formatLocalTime(s.startsAt, TZ));

describe("computeFreeSlots", () => {
  it("раскладывает рабочий день по шагу сетки", () => {
    expect(times(computeFreeSlots(query()))).toEqual([
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ]);
  });

  it("не предлагает слот, который не помещается до конца смены", () => {
    // 90-минутная услуга при закрытии в 18:00: последний старт — 16:30
    const slots = computeFreeSlots(query({ serviceDurationMinutes: 90, slotStepMinutes: 30 }));

    expect(times(slots).at(-1)).toBe("16:30");
  });

  it("возвращает пусто в нерабочий день", () => {
    // 2026-09-09 — среда, смен нет
    expect(computeFreeSlots(query({ date: "2026-09-09" }))).toEqual([]);
  });

  it("исключает время, занятое записью", () => {
    const busy = [
      {
        startsAt: new Date("2026-09-07T09:00:00Z"), // 12:00 МСК
        blockedUntil: new Date("2026-09-07T10:00:00Z"), // 13:00 МСК
      },
    ];

    expect(times(computeFreeSlots(query({ busy })))).not.toContain("12:00");
  });

  it("учитывает технический перерыв предыдущей записи", () => {
    // Занято 12:00–13:00 плюс 15 минут перерыва → мастер свободен с 13:15,
    // поэтому слот 13:00 предлагать нельзя.
    const busy = [
      {
        startsAt: new Date("2026-09-07T09:00:00Z"),
        blockedUntil: new Date("2026-09-07T10:15:00Z"),
      },
    ];

    const slots = times(computeFreeSlots(query({ busy, slotStepMinutes: 15 })));

    expect(slots).not.toContain("13:00");
    expect(slots).toContain("13:15");
  });

  it("учитывает собственный перерыв слота перед следующей записью", () => {
    // Следующая запись в 14:00. Слот 13:00 с 15-минутным перерывом занял бы
    // мастера до 14:15 и наложился бы на неё.
    const busy = [
      {
        startsAt: new Date("2026-09-07T11:00:00Z"), // 14:00 МСК
        blockedUntil: new Date("2026-09-07T12:00:00Z"),
      },
    ];

    const slots = times(computeFreeSlots(query({ busy, bufferMinutes: 15, slotStepMinutes: 30 })));

    expect(slots).not.toContain("13:00");
    expect(slots).not.toContain("13:30");
    expect(slots).toContain("12:00");
  });

  it("исключает время отпуска", () => {
    const timeOff = [
      {
        startsAt: new Date("2026-09-07T11:00:00Z"), // 14:00 МСК
        endsAt: new Date("2026-09-07T13:00:00Z"), // 16:00 МСК
      },
    ];

    const slots = times(computeFreeSlots(query({ timeOff })));

    expect(slots).not.toContain("14:00");
    expect(slots).not.toContain("15:00");
    expect(slots).toContain("16:00");
  });

  it("не предлагает слоты раньше минимального запаса", () => {
    // Сейчас 11:30 МСК, запас 2 часа → первый доступный старт в 14:00
    const slots = times(
      computeFreeSlots(
        query({ now: new Date("2026-09-07T08:30:00Z"), minLeadTimeMinutes: 120 }),
      ),
    );

    expect(slots[0]).toBe("14:00");
  });

  it("склеивает несколько смен одного дня", () => {
    const workingHours = [
      { weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
      { weekday: 1, startMinute: 15 * 60, endMinute: 19 * 60 },
    ];

    const slots = times(computeFreeSlots(query({ workingHours, slotStepMinutes: 120 })));

    expect(slots).toEqual(["09:00", "11:00", "15:00", "17:00"]);
  });
});

describe("переход на летнее время", () => {
  // Салон в зоне с переводом часов: в ночь на 2026-03-29 Берлин переходит
  // на летнее время, сутки длятся 23 часа.
  const BERLIN = "Europe/Berlin";

  it("сохраняет локальное время начала смены", () => {
    const now = new Date("2026-03-01T00:00:00Z");

    const before = computeFreeSlots(
      query({
        date: "2026-03-28",
        timezone: BERLIN,
        now,
        workingHours: [{ weekday: 6, startMinute: 600, endMinute: 1080 }],
      }),
    );
    const after = computeFreeSlots(
      query({
        date: "2026-03-29",
        timezone: BERLIN,
        now,
        workingHours: [{ weekday: 0, startMinute: 600, endMinute: 1080 }],
      }),
    );

    // В обоих случаях смена начинается в 10:00 по местному времени,
    // хотя UTC-моменты отличаются на час.
    expect(formatLocalTime(before[0]!.startsAt, BERLIN)).toBe("10:00");
    expect(formatLocalTime(after[0]!.startsAt, BERLIN)).toBe("10:00");
    expect(before[0]!.startsAt.getUTCHours()).toBe(9);
    expect(after[0]!.startsAt.getUTCHours()).toBe(8);
  });

  it("не теряет слоты в день перевода часов", () => {
    const slots = computeFreeSlots(
      query({
        date: "2026-03-29",
        timezone: BERLIN,
        now: new Date("2026-03-01T00:00:00Z"),
        workingHours: [{ weekday: 0, startMinute: 600, endMinute: 1080 }],
      }),
    );

    // 10:00–18:00, часовой шаг, 60-минутная услуга → восемь слотов независимо
    // от того, что календарные сутки короче на час.
    expect(slots).toHaveLength(8);
  });
});

describe("isSlotAvailable", () => {
  const base = query();

  it("принимает время внутри смены", () => {
    expect(
      isSlotAvailable(new Date("2026-09-07T08:30:00Z"), base), // 11:30 МСК
    ).toBe(true);
  });

  it("отвергает время, выходящее за конец смены", () => {
    expect(
      isSlotAvailable(new Date("2026-09-07T14:30:00Z"), base), // 17:30 + 60 мин → за 18:00
    ).toBe(false);
  });

  it("отвергает время до открытия", () => {
    expect(isSlotAvailable(new Date("2026-09-07T06:00:00Z"), base)).toBe(false); // 09:00 МСК
  });

  it("отвергает пересечение с занятостью", () => {
    const busy = [
      {
        startsAt: new Date("2026-09-07T09:00:00Z"),
        blockedUntil: new Date("2026-09-07T10:00:00Z"),
      },
    ];

    expect(isSlotAvailable(new Date("2026-09-07T09:30:00Z"), { ...base, busy })).toBe(false);
  });

  it("разрешает запись встык, когда перерыв не задан", () => {
    const busy = [
      {
        startsAt: new Date("2026-09-07T09:00:00Z"),
        blockedUntil: new Date("2026-09-07T10:00:00Z"),
      },
    ];

    expect(isSlotAvailable(new Date("2026-09-07T10:00:00Z"), { ...base, busy })).toBe(true);
  });
});
