-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CLIENT');

-- CreateEnum
CREATE TYPE "ClientSource" AS ENUM ('WALK_IN', 'REFERRAL', 'SOCIAL', 'SEARCH', 'OTHER');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('CONTRAINDICATION', 'PREFERENCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH_OR_CARD', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UsageState" AS ENUM ('RESERVED', 'CONSUMED', 'REVERTED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SALE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REMINDER_2H', 'BOOKING_CONFIRMED', 'CANCELLED', 'SUBSCRIPTION_EXPIRING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "slotStepMinutes" INTEGER NOT NULL DEFAULT 15,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "minLeadTimeMinutes" INTEGER NOT NULL DEFAULT 120,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 12,
    "reminderOffsetMinutes" INTEGER NOT NULL DEFAULT 120,
    "chargeSubscriptionOnNoShow" BOOLEAN NOT NULL DEFAULT true,
    "setupCompletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Master" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "specialization" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "startMinute" SMALLINT NOT NULL,
    "endMinute" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "birthDate" DATE,
    "source" "ClientSource",
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "type" "NoteType" NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "blockedUntil" TIMESTAMPTZ NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "serviceNameSnapshot" TEXT NOT NULL,
    "priceMinorSnapshot" INTEGER NOT NULL,
    "durationMinutesSnapshot" INTEGER NOT NULL,
    "bufferMinutesSnapshot" INTEGER NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "clientComment" TEXT,
    "internalNote" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMPTZ,
    "cancelledByUserId" TEXT,
    "completedAt" TIMESTAMPTZ,
    "noShowAt" TIMESTAMPTZ,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessionsCount" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 180,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceNameSnapshot" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "pricePaidMinor" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionUsage" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "state" "UsageState" NOT NULL,
    "reservedAt" TIMESTAMPTZ NOT NULL,
    "consumedAt" TIMESTAMPTZ,
    "revertedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "subscriptionId" TEXT,
    "refundedPaymentId" TEXT,
    "kind" "PaymentKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMPTZ NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT,
    "subscriptionId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "scheduledFor" TIMESTAMPTZ NOT NULL,
    "sentAt" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Master_userId_key" ON "Master"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHours_masterId_weekday_startMinute_key" ON "WorkingHours"("masterId", "weekday", "startMinute");

-- CreateIndex
CREATE INDEX "TimeOff_masterId_startsAt_endsAt_idx" ON "TimeOff"("masterId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_name_key" ON "ServiceCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_slug_key" ON "ServiceCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "Service_categoryId_isActive_idx" ON "Service"("categoryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_phone_key" ON "Client"("phone");

-- CreateIndex
CREATE INDEX "Client_lastName_firstName_idx" ON "Client"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Client_archivedAt_idx" ON "Client"("archivedAt");

-- CreateIndex
CREATE INDEX "ClientNote_clientId_type_idx" ON "ClientNote"("clientId", "type");

-- CreateIndex
CREATE INDEX "Appointment_masterId_startsAt_idx" ON "Appointment"("masterId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_clientId_startsAt_idx" ON "Appointment"("clientId", "startsAt" DESC);

-- CreateIndex
CREATE INDEX "Appointment_status_startsAt_idx" ON "Appointment"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Subscription_clientId_status_idx" ON "Subscription"("clientId", "status");

-- CreateIndex
CREATE INDEX "Subscription_status_expiresAt_idx" ON "Subscription"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionUsage_appointmentId_key" ON "SubscriptionUsage"("appointmentId");

-- CreateIndex
CREATE INDEX "SubscriptionUsage_subscriptionId_state_idx" ON "SubscriptionUsage"("subscriptionId", "state");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_clientId_paidAt_idx" ON "Payment"("clientId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_refundedPaymentId_idx" ON "Payment"("refundedPaymentId");

-- CreateIndex
CREATE INDEX "NotificationLog_status_scheduledFor_idx" ON "NotificationLog"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_clientId_key" ON "Conversation"("clientId");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Master" ADD CONSTRAINT "Master_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionUsage" ADD CONSTRAINT "SubscriptionUsage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionUsage" ADD CONSTRAINT "SubscriptionUsage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundedPaymentId_fkey" FOREIGN KEY ("refundedPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Сгенерировано из prisma/sql/0001_init_constraints.sql скриптом scripts/create-migration.sh
-- Не редактировать здесь: правки вносятся в исходный файл.
-- ============================================================

-- Ограничения, которые Prisma не умеет декларировать в schema.prisma.
--
-- Этот файл НЕ применяется вручную. Скрипт `pnpm db:migration <name>`
-- выполняет `prisma migrate dev --create-only` и дописывает соответствующий
-- файл из prisma/sql/ в конец сгенерированного migration.sql. Единственный
-- исполняемый артефакт — migration.sql; здесь исходник, который читают и ревьюят.
--
-- Ограничения проверяются двумя слоями тестов:
--   tests/db/constraints.structure.spec.ts — снимки pg_get_constraintdef()
--     и indexdef, а НЕ имена: подмена blockedUntil на endsAt внутри
--     appointment_no_overlap оставила бы имя прежним и прошла бы проверку;
--   tests/db/constraints.behavior.spec.ts — реальные конфликтующие операции.
-- Если схему изменят мимо процесса, CI упадёт.
--
-- Порядок именования: <имя_таблицы>_<что_проверяет>.

-- ---------------------------------------------------------------------------
-- 1. Невозможность двойной брони на уровне БД
--
-- Проверка «слот свободен» в коде — гонка: два параллельных запроса читают
-- состояние до того, как любой из них запишет. Констрейнт закрывает окно
-- физически; приложение ловит SQLSTATE 23P01 и возвращает «слот только что заняли».
--
-- Интервал берётся до blockedUntil, а не до endsAt: технический перерыв —
-- часть занятости ресурса. Иначе при bufferMinutes = 15 записи 10:00–11:00
-- и 11:00–12:00 не пересекались бы с точки зрения БД, и перерыв соблюдался бы
-- только доброй волей приложения.
--
-- Отменённые и несостоявшиеся визиты исключены: они не занимают время.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (
    "masterId" WITH =,
    tstzrange("startsAt", "blockedUntil", '[)') WITH &&
  ) WHERE (status IN ('PENDING', 'CONFIRMED'));

-- ---------------------------------------------------------------------------
-- 2. Интервал записи согласован со снимками
--
-- Инвариант «endsAt соответствует длительности» иначе остаётся только
-- на словах: endsAt > startsAt пропустил бы сеанс на 15 минут при
-- durationMinutesSnapshot = 90. Проверка endsAt > startsAt отдельно не нужна —
-- она следует из durationMinutesSnapshot > 0.
-- ---------------------------------------------------------------------------

-- make_interval, а не умножение на INTERVAL '1 minute': PostgreSQL приводит
-- integer * interval к double precision, то есть сравнивает метки времени
-- через арифметику с плавающей точкой. Для минутных значений результат точен,
-- но фиксировать такую форму в определении ограничения незачем.
ALTER TABLE "Appointment"
  ADD CONSTRAINT appointment_duration_consistent CHECK (
    "endsAt" = "startsAt" + make_interval(mins => "durationMinutesSnapshot")
    AND "blockedUntil" = "endsAt" + make_interval(mins => "bufferMinutesSnapshot")
  );

-- ---------------------------------------------------------------------------
-- 3. Метки времени соответствуют статусу записи
--
-- Без этого допустима строка status = COMPLETED при completedAt = NULL,
-- и финансовый отчёт, фильтрующий по дате завершения, молча потеряет визит.
-- ---------------------------------------------------------------------------

ALTER TABLE "Appointment"
  ADD CONSTRAINT appointment_status_fields_consistent CHECK (
    (status = 'COMPLETED' AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL AND "noShowAt" IS NULL)
    OR (status = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "completedAt" IS NULL AND "noShowAt" IS NULL)
    OR (status = 'NO_SHOW'  AND "noShowAt"    IS NOT NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
    OR (status IN ('PENDING', 'CONFIRMED') AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "noShowAt" IS NULL)
  );

-- ---------------------------------------------------------------------------
-- 4. Согласованность интервалов расписания
-- ---------------------------------------------------------------------------

ALTER TABLE "TimeOff"
  ADD CONSTRAINT timeoff_interval_valid CHECK ("endsAt" > "startsAt");

ALTER TABLE "WorkingHours"
  ADD CONSTRAINT workinghours_valid CHECK (
    "weekday" BETWEEN 0 AND 6
    AND "startMinute" BETWEEN 0 AND 1440
    AND "endMinute" BETWEEN 0 AND 1440
    AND "endMinute" > "startMinute"
  );

-- Смены одного мастера в один день не пересекаются.
-- UNIQUE (masterId, weekday, startMinute) защищает только от совпадающего
-- начала и пропустил бы пару 09:00–13:00 / 10:00–18:00 — генератор слотов
-- вернул бы часть времени дважды. Полуоткрытый диапазон оставляет
-- разрешёнными и две смены в день (09:00–13:00 + 15:00–19:00),
-- и смежные интервалы (09:00–13:00 + 13:00–18:00).
ALTER TABLE "WorkingHours"
  ADD CONSTRAINT workinghours_no_overlap
  EXCLUDE USING gist (
    "masterId" WITH =,
    "weekday"  WITH =,
    int4range("startMinute", "endMinute", '[)') WITH &&
  );

-- ---------------------------------------------------------------------------
-- 4b. Состояние списания абонемента согласовано с метками времени
--
-- Метки времени записи защищены пунктом 3 — журнал списаний защищается
-- по тому же принципу. У REVERTED поле consumedAt свободно: откатить можно
-- как резерв (consumedAt IS NULL), так и уже потреблённое списание при
-- отмене завершённого визита.
-- ---------------------------------------------------------------------------

ALTER TABLE "SubscriptionUsage"
  ADD CONSTRAINT subscription_usage_state_consistent CHECK (
    (state = 'RESERVED' AND "consumedAt" IS NULL AND "revertedAt" IS NULL)
    OR (state = 'CONSUMED' AND "consumedAt" IS NOT NULL AND "revertedAt" IS NULL)
    OR (state = 'REVERTED' AND "revertedAt" IS NOT NULL)
  );

ALTER TABLE "SubscriptionUsage"
  ADD CONSTRAINT subscription_usage_timeline_valid CHECK (
    ("consumedAt" IS NULL OR "consumedAt" >= "reservedAt")
    AND ("revertedAt" IS NULL OR "revertedAt" >= "reservedAt")
  );

-- ---------------------------------------------------------------------------
-- 5. Деньги и длительности не бывают отрицательными
-- ---------------------------------------------------------------------------

ALTER TABLE "Service"
  ADD CONSTRAINT service_positive CHECK ("durationMinutes" > 0 AND "priceMinor" >= 0);

ALTER TABLE "Appointment"
  ADD CONSTRAINT appointment_snapshot_positive CHECK (
    "durationMinutesSnapshot" > 0
    AND "priceMinorSnapshot" >= 0
    AND "bufferMinutesSnapshot" >= 0
  );

ALTER TABLE "SubscriptionPlan"
  ADD CONSTRAINT plan_positive CHECK (
    "sessionsCount" > 0 AND "priceMinor" >= 0 AND "validityDays" > 0
  );

ALTER TABLE "Subscription"
  ADD CONSTRAINT subscription_positive CHECK (
    "sessionsTotal" > 0 AND "pricePaidMinor" >= 0 AND "expiresAt" > "purchasedAt"
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT payment_amount_positive CHECK ("amountMinor" > 0);

ALTER TABLE "Organization"
  ADD CONSTRAINT organization_settings_valid CHECK (
    "slotStepMinutes" > 0
    AND "bufferMinutes" >= 0
    AND "minLeadTimeMinutes" >= 0
    AND "cancellationWindowHours" >= 0
    AND "reminderOffsetMinutes" > 0
  );

-- ---------------------------------------------------------------------------
-- 6. Платёж привязан РОВНО к одному субъекту (XOR, не OR)
--
-- OR разрешал бы строку, привязанную и к визиту, и к абонементу: такая строка
-- попала бы в отчёт «доход по услугам» дважды либо по неверной услуге.
-- Если бизнесу понадобится продать визит и абонемент одним платежом —
-- правильный ответ Order с позициями, а не две ссылки в одной строке.
-- ---------------------------------------------------------------------------

ALTER TABLE "Payment"
  ADD CONSTRAINT payment_has_exactly_one_subject CHECK (
    ("appointmentId" IS NOT NULL)::int + ("subscriptionId" IS NOT NULL)::int = 1
  );

-- Возврат всегда ссылается на продажу, продажа — ни на что.
-- Инвариант «сумма возвратов <= суммы продажи» требует агрегата по другим
-- строкам и в CHECK не выражается: он живёт в транзакции возврата
-- (блокировка исходного платежа) и покрыт тестом.
ALTER TABLE "Payment"
  ADD CONSTRAINT payment_refund_link CHECK (
    (kind = 'SALE' AND "refundedPaymentId" IS NULL)
    OR (kind = 'REFUND' AND "refundedPaymentId" IS NOT NULL)
  );

-- id — cuid, сгенерированный приложением ДО вставки, поэтому строка технически
-- может сослаться сама на себя, и внешний ключ этому не помешает.
ALTER TABLE "Payment"
  ADD CONSTRAINT payment_cannot_refund_itself CHECK (
    "refundedPaymentId" IS NULL OR "refundedPaymentId" <> id
  );

-- ---------------------------------------------------------------------------
-- 6b. Субъект уведомления соответствует его типу
--
-- Предупреждение о сгорающем абонементе относится к Subscription, а не к
-- визиту: при обязательном appointmentId этот тип было бы невозможно
-- использовать, не выдумывая фиктивную запись.
-- ---------------------------------------------------------------------------

ALTER TABLE "NotificationLog"
  ADD CONSTRAINT notification_subject_valid CHECK (
    (type IN ('REMINDER_2H', 'BOOKING_CONFIRMED', 'CANCELLED')
      AND "appointmentId" IS NOT NULL AND "subscriptionId" IS NULL)
    OR (type = 'SUBSCRIPTION_EXPIRING'
      AND "subscriptionId" IS NOT NULL AND "appointmentId" IS NULL)
  );

-- Идемпотентность — два частичных индекса, а не составной UNIQUE:
-- в PostgreSQL NULL <> NULL, поэтому UNIQUE ("appointmentId", type) не
-- ограничивал бы строки с пустым appointmentId, и защита от повторного
-- письма про абонемент исчезла бы молча.
CREATE UNIQUE INDEX notification_unique_per_appointment
  ON "NotificationLog" ("appointmentId", type)
  WHERE "appointmentId" IS NOT NULL;

CREATE UNIQUE INDEX notification_unique_per_subscription
  ON "NotificationLog" ("subscriptionId", type)
  WHERE "subscriptionId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Нормализация контактов
--
-- Обычный UNIQUE в PostgreSQL считает User@Example.com и user@example.com
-- разными строками — при magic-link-логине это две учётки на одного человека.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX user_email_normalized_unique
  ON "User" (lower(btrim("email")));

-- Email клиента уникален среди неархивированных карточек: он используется
-- для автоматической привязки карточки к User при первом входе, а связывание
-- по неоднозначному ключу дало бы клиенту доступ к чужой истории.
CREATE UNIQUE INDEX client_email_normalized_unique
  ON "Client" (lower(btrim("email")))
  WHERE "email" IS NOT NULL AND "archivedAt" IS NULL;

-- Телефон хранится в E.164: иначе «+7 999 123-45-67» и «89991234567»
-- создадут двух клиентов, и история посещений разъедется.
ALTER TABLE "Client"
  ADD CONSTRAINT client_phone_e164 CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');

-- ---------------------------------------------------------------------------
-- 8. Organization — не более одной строки
--
-- Именно «не более», а не «ровно одна»: наличие конфигурации обеспечивает
-- setup-процесс, а не БД. После миграций таблица пуста, пока не завершён
-- wizard, и приложение обязано корректно работать в этом состоянии
-- (редирект всех маршрутов на /setup).
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX organization_singleton ON "Organization" ((true));

-- ---------------------------------------------------------------------------
-- 9. Пустые сообщения в чате
-- ---------------------------------------------------------------------------

ALTER TABLE "Message"
  ADD CONSTRAINT message_body_not_empty CHECK (length(btrim("body")) > 0);
