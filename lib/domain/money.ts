/**
 * Деньги хранятся целыми копейками. Форматирование и разбор — здесь,
 * чтобы нигде не появилось `price / 100` с плавающей точкой.
 */

export function formatMoney(minor: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** Компактный вид для плиток дашборда: 1 234 ₽ вместо 1 234,00 ₽. */
export function formatMoneyShort(minor: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

/** «3500» или «3500,50» → копейки. Возвращает null, если разобрать не удалось. */
export function parseMoneyToMinor(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  // Округление после умножения: 35.7 * 100 в двоичной арифметике даёт 3569.99…
  return Math.round(Number(normalized) * 100);
}

export function minorToInput(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/**
 * Скидка абонемента относительно поштучной покупки.
 * Не хранится в базе: это производная от цены пакета и текущей цены услуги.
 */
export function discountPercent(
  packagePriceMinor: number,
  sessionsCount: number,
  servicePriceMinor: number,
): number {
  const fullPrice = sessionsCount * servicePriceMinor;

  if (fullPrice <= 0) return 0;

  return Math.round((1 - packagePriceMinor / fullPrice) * 100);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** Склонение: 1 сеанс, 2 сеанса, 5 сеансов. */
export function pluralize(count: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;

  if (mod100 > 10 && mod100 < 20) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];

  return forms[2];
}

export const SESSION_FORMS: [string, string, string] = ["сеанс", "сеанса", "сеансов"];
export const VISIT_FORMS: [string, string, string] = ["визит", "визита", "визитов"];
export const CLIENT_FORMS: [string, string, string] = ["клиент", "клиента", "клиентов"];
