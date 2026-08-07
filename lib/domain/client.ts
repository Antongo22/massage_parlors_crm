import { z } from "zod";

/**
 * Чистая часть работы с клиентами: схема, нормализация телефона, подписи.
 *
 * Отдельный модуль от lib/services/clients.ts не ради красоты. Тот помечен
 * "server-only" и тянет за собой Prisma; когда клиентский компонент импортировал
 * оттуда одну константу с подписями, сборка падала целиком — и сообщение
 * указывало не на импорт, а на отсутствующий build-manifest страницы.
 *
 * Правило: всё, что может понадобиться в браузере, живёт здесь; всё,
 * что работает с базой, — в сервисе.
 */

export const clientSchema = z.object({
  id: z.string().optional(),
  lastName: z.string().trim().min(1, "Укажите фамилию").max(80),
  firstName: z.string().trim().min(1, "Укажите имя").max(80),
  middleName: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(1, "Укажите телефон"),
  email: z.string().trim().max(255).optional(),
  birthDate: z.string().trim().optional(),
  source: z.enum(["WALK_IN", "REFERRAL", "SOCIAL", "SEARCH", "OTHER"]).optional(),
});

export type ClientInput = z.infer<typeof clientSchema>;

/**
 * Приведение телефона к E.164.
 *
 * Российские номера пишут как угодно: 8..., +7..., со скобками и дефисами.
 * Ведущая восьмёрка заменяется на +7 — самая частая форма записи, и без этого
 * половина карточек не пройдёт проверку формата в базе, а «+7 999 123-45-67»
 * и «89991234567» станут двумя клиентами с разной историей посещений.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }

  const local = digits.replace(/^8/, "7");

  return /^7\d{10}$/.test(local) ? `+${local}` : null;
}

export const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: "Пришёл сам",
  REFERRAL: "По рекомендации",
  SOCIAL: "Соцсети",
  SEARCH: "Поиск",
  OTHER: "Другое",
};

export const NOTE_TYPE_LABELS: Record<string, string> = {
  CONTRAINDICATION: "Противопоказание",
  PREFERENCE: "Предпочтение",
  GENERAL: "Заметка",
};
