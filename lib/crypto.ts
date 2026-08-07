import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Шифрование секретов, которые вынужденно лежат в базе.
 *
 * Пока такой секрет один — пароль SMTP. Он попал в БД сознательно: смысл
 * wizard в том, что владелец салона настраивает почту сам, а не правит .env
 * по SSH. Но дамп базы (бэкап, доступ поддержки, утечка) не должен давать
 * доступ к почтовому ящику салона, поэтому в открытом виде пароль не хранится.
 *
 * AES-256-GCM: даёт не только шифрование, но и аутентификацию — подменённое
 * значение не расшифруется, а не расшифруется во что-то правдоподобное.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // рекомендованная длина nonce для GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Соль фиксированная, потому что ключ должен воспроизводиться между
// перезапусками и репликами. Роль случайности здесь играет IV, свой у каждого
// значения; фиксированная соль лишь привязывает ключ к этому приложению.
const KEY_SALT = "massage-crm.secret-encryption.v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET не задан или слишком короткий — им шифруются секреты в базе. " +
        "Сгенерируйте: openssl rand -base64 32",
    );
  }

  // scrypt намеренно медленный, поэтому результат кешируется на процесс.
  cachedKey = scryptSync(secret, KEY_SALT, KEY_LENGTH);
  return cachedKey;
}

/** Возвращает base64 от iv | authTag | ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");

  if (raw.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Зашифрованное значение повреждено: слишком короткое");
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Расшифровка для мест, где непригодное значение не должно ронять приложение.
 *
 * Реальный сценарий: администратор сменил AUTH_SECRET. Старый пароль SMTP
 * расшифровать нечем — но это повод показать «настройте почту заново»,
 * а не отдавать 500 на каждой странице.
 */
export function tryDecryptSecret(payload: string | null): string | null {
  if (!payload) return null;

  try {
    return decryptSecret(payload);
  } catch {
    return null;
  }
}
