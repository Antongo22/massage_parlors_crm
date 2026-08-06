-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "mailFrom" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPassword" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smtpUser" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "image" TEXT;

-- ============================================================
-- Сгенерировано из prisma/sql/0002_smtp_settings.sql скриптом scripts/create-migration.sh
-- Не редактировать здесь: правки вносятся в исходный файл.
-- ============================================================

-- Настройки почты в Organization: владелец салона меняет их через wizard,
-- а не правкой .env по SSH.

-- Порт должен быть портом. Опечатка в wizard иначе всплывёт только в момент,
-- когда клиенту не уйдёт напоминание за два часа до сеанса.
ALTER TABLE "Organization"
  ADD CONSTRAINT organization_smtp_port_valid CHECK (
    "smtpPort" IS NULL OR "smtpPort" BETWEEN 1 AND 65535
  );

-- Хост и пароль осмысленны только вместе с остальными полями: наполовину
-- заполненный SMTP молча не работает, что хуже явно пустого.
ALTER TABLE "Organization"
  ADD CONSTRAINT organization_smtp_complete CHECK (
    "smtpHost" IS NULL
    OR ("smtpPort" IS NOT NULL AND "mailFrom" IS NOT NULL)
  );
