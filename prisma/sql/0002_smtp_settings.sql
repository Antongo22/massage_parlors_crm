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
