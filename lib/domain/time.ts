import { addDays, format, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Работа со временем салона.
 *
 * Правило одно: в базе и в коде время — это UTC-момент (Date), а «десять утра
 * в понедельник» существует только в паре с таймзоной салона. Всё преобразование
 * собрано здесь, чтобы не расползлось по компонентам.
 *
 * Почему это не мелочь: график хранится минутами от полуночи локального дня.
 * В день перехода на летнее время между 10:00 и 11:00 локального времени
 * проходит не час, и наивное `startOfDayUtc + 600 минут` сдвинуло бы всё
 * расписание. Поэтому локальные минуты всегда переводятся в UTC через
 * конкретную дату и таймзону.
 */

export type LocalDate = string; // YYYY-MM-DD в таймзоне салона

/** Момент → календарная дата в таймзоне салона. */
export function toLocalDate(instant: Date, timezone: string): LocalDate {
  return format(toZonedTime(instant, timezone), "yyyy-MM-dd");
}

/** Локальная дата + минуты от полуночи → UTC-момент. */
export function localDateTimeToInstant(
  date: LocalDate,
  minutesFromMidnight: number,
  timezone: string,
): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const time = `${pad(hours)}:${pad(minutes)}:00`;

  // fromZonedTime разбирает строку как локальное время указанной зоны
  // и учитывает смещение, действующее именно в эту дату.
  return fromZonedTime(`${date}T${time}`, timezone);
}

/** День недели локальной даты в соглашении SQL: 0 — воскресенье. */
export function weekdayOf(date: LocalDate, timezone: string): number {
  // Полдень, а не полночь: в день перехода на летнее время полуночи
  // в локальной зоне может не существовать, полдень существует всегда.
  const noon = localDateTimeToInstant(date, 12 * 60, timezone);
  return toZonedTime(noon, timezone).getDay();
}

/** Форматирование момента в локальное время салона. */
export function formatInTimezone(instant: Date, timezone: string, pattern: string): string {
  return format(toZonedTime(instant, timezone), pattern);
}

export function formatLocalTime(instant: Date, timezone: string): string {
  return formatInTimezone(instant, timezone, "HH:mm");
}

export function formatLocalDate(instant: Date, timezone: string): string {
  return formatInTimezone(instant, timezone, "dd.MM.yyyy");
}

export function formatLocalDateTime(instant: Date, timezone: string): string {
  return formatInTimezone(instant, timezone, "dd.MM.yyyy HH:mm");
}

/** Границы локальных суток как UTC-моменты — для выборок «за день». */
export function localDayRange(date: LocalDate, timezone: string): { from: Date; to: Date } {
  return {
    from: localDateTimeToInstant(date, 0, timezone),
    to: localDateTimeToInstant(shiftLocalDate(date, 1), 0, timezone),
  };
}

export function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  // Арифметика по календарю, а не по миллисекундам: сутки не всегда 24 часа.
  const [year, month, day] = date.split("-").map(Number);
  const base = new Date(Date.UTC(year!, month! - 1, day!));

  return format(addDays(base, days), "yyyy-MM-dd");
}

export function todayLocalDate(timezone: string, now: Date = new Date()): LocalDate {
  return toLocalDate(now, timezone);
}

/** Начало недели (понедельник) для локальной даты. */
export function startOfLocalWeek(date: LocalDate): LocalDate {
  const [year, month, day] = date.split("-").map(Number);
  const base = new Date(Date.UTC(year!, month! - 1, day!));
  const weekday = base.getUTCDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;

  return format(addDays(base, shift), "yyyy-MM-dd");
}

export function minutesFromMidnight(instant: Date, timezone: string): number {
  const zoned = toZonedTime(instant, timezone);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** Разница между моментами в минутах, положительная если b позже a. */
export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function startOfUtcDay(instant: Date): Date {
  return startOfDay(instant);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export const WEEKDAY_NAMES = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
] as const;

export const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;
