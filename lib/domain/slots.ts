import { addMinutes, localDateTimeToInstant, weekdayOf, type LocalDate } from "@/lib/domain/time";

/**
 * Движок свободных слотов.
 *
 * Функция чистая: ни базы, ни текущего времени изнутри. Всё, что влияет на
 * результат, приходит аргументами — поэтому её можно покрыть тестами на
 * переход через летнее время, на буфер и на границы рабочего дня, не поднимая
 * ни Postgres, ни приложение.
 *
 * Слоты нигде не хранятся. Это принципиально: таблица свободных слотов —
 * второй источник правды, который надо генерировать на горизонт и
 * перегенерировать при каждом изменении графика, отпуска или записи.
 */

export type WorkingInterval = { startMinute: number; endMinute: number };

/** Занятость мастера: интервал включает технический перерыв после сеанса. */
export type BusyInterval = { startsAt: Date; blockedUntil: Date };

export type SlotQuery = {
  date: LocalDate;
  timezone: string;
  /** Все смены мастера; фильтрация по дню недели — внутри. */
  workingHours: Array<WorkingInterval & { weekday: number }>;
  timeOff: Array<{ startsAt: Date; endsAt: Date }>;
  busy: BusyInterval[];
  serviceDurationMinutes: number;
  bufferMinutes: number;
  slotStepMinutes: number;
  now: Date;
  /** Минимальный запас до сеанса; 0 для администратора, который пишет вручную. */
  minLeadTimeMinutes: number;
};

export type Slot = {
  startsAt: Date;
  endsAt: Date;
};

export function computeFreeSlots(query: SlotQuery): Slot[] {
  const {
    date,
    timezone,
    workingHours,
    timeOff,
    busy,
    serviceDurationMinutes,
    bufferMinutes,
    slotStepMinutes,
    now,
    minLeadTimeMinutes,
  } = query;

  if (serviceDurationMinutes <= 0 || slotStepMinutes <= 0) return [];

  const weekday = weekdayOf(date, timezone);
  const shifts = workingHours.filter((interval) => interval.weekday === weekday);
  const earliestStart = addMinutes(now, minLeadTimeMinutes);

  const slots: Slot[] = [];

  for (const shift of shifts) {
    for (
      let minute = shift.startMinute;
      minute + serviceDurationMinutes <= shift.endMinute;
      minute += slotStepMinutes
    ) {
      const startsAt = localDateTimeToInstant(date, minute, timezone);
      const endsAt = addMinutes(startsAt, serviceDurationMinutes);
      // Перерыв — часть занятости ресурса, поэтому проверяется вместе с сеансом.
      const blockedUntil = addMinutes(endsAt, bufferMinutes);

      if (startsAt < earliestStart) continue;
      if (timeOff.some((off) => overlaps(startsAt, endsAt, off.startsAt, off.endsAt))) continue;
      if (busy.some((slot) => overlaps(startsAt, blockedUntil, slot.startsAt, slot.blockedUntil))) {
        continue;
      }

      slots.push({ startsAt, endsAt });
    }
  }

  // Смен в дне может быть несколько (утро и вечер) — порядок восстанавливаем.
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Пересечение полуоткрытых интервалов [aStart, aEnd) и [bStart, bEnd).
 * Смежные интервалы (конец одного равен началу другого) не пересекаются —
 * то же соглашение, что у EXCLUDE-констрейнта в базе.
 */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Проверка одного конкретного времени — для формы записи, где время задано
 * администратором вручную и в сетку шага может не попадать.
 */
export function isSlotAvailable(
  startsAt: Date,
  query: Omit<SlotQuery, "date"> & { date: LocalDate },
): boolean {
  const endsAt = addMinutes(startsAt, query.serviceDurationMinutes);
  const blockedUntil = addMinutes(endsAt, query.bufferMinutes);
  const weekday = weekdayOf(query.date, query.timezone);

  const insideShift = query.workingHours
    .filter((interval) => interval.weekday === weekday)
    .some((shift) => {
      const shiftStart = localDateTimeToInstant(query.date, shift.startMinute, query.timezone);
      const shiftEnd = localDateTimeToInstant(query.date, shift.endMinute, query.timezone);

      return startsAt >= shiftStart && endsAt <= shiftEnd;
    });

  if (!insideShift) return false;
  if (startsAt < addMinutes(query.now, query.minLeadTimeMinutes)) return false;
  if (query.timeOff.some((off) => overlaps(startsAt, endsAt, off.startsAt, off.endsAt))) {
    return false;
  }

  return !query.busy.some((slot) => overlaps(startsAt, blockedUntil, slot.startsAt, slot.blockedUntil));
}
