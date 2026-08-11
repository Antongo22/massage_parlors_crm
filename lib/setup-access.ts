import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SETUP_ACCESS_COOKIE = "crm-setup-access";
const SETUP_ACCESS_MAX_AGE_SECONDS = 60 * 60;

function configuredPassword(): string {
  return process.env.SETUP_ACCESS_PASSWORD ?? "";
}

/** Пустое значение оставляет локальную разработку без лишнего шага. */
export function isSetupPasswordConfigured(): boolean {
  return configuredPassword().length > 0;
}

/**
 * Сравниваем хеши одинаковой длины, чтобы не выдавать длину или общий префикс
 * секрета разным временем ответа.
 */
export function isSetupPasswordValid(candidate: string): boolean {
  const password = configuredPassword();

  if (!password) return true;

  const candidateHash = createHash("sha256").update(candidate).digest();
  const passwordHash = createHash("sha256").update(password).digest();
  return timingSafeEqual(candidateHash, passwordHash);
}

function accessToken(password: string): string {
  const authSecret = process.env.AUTH_SECRET;

  if (!authSecret) {
    throw new Error("Для защиты первичной настройки требуется AUTH_SECRET");
  }

  // Токен меняется вместе с SETUP_ACCESS_PASSWORD и AUTH_SECRET. Сам пароль в cookie
  // не попадает и не может быть восстановлен из её значения.
  return createHmac("sha256", authSecret)
    .update("crm-setup-access:v1\0")
    .update(password)
    .digest("base64url");
}

function safeTokenEqual(actual: string, expected: string): boolean {
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export async function hasSetupAccess(): Promise<boolean> {
  const password = configuredPassword();

  if (!password) return true;

  const cookieValue = (await cookies()).get(SETUP_ACCESS_COOKIE)?.value ?? "";
  return safeTokenEqual(cookieValue, accessToken(password));
}

export async function grantSetupAccess(): Promise<void> {
  const password = configuredPassword();

  if (!password) return;

  (await cookies()).set(SETUP_ACCESS_COOKIE, accessToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/setup",
    maxAge: SETUP_ACCESS_MAX_AGE_SECONDS,
  });
}
