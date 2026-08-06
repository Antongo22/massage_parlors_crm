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
