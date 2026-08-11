-- Формат абонемента из ТЗ защищён на уровне БД: только 5/10 сеансов,
-- положительная цена. Наличие скидки зависит от цены связанной услуги и
-- проверяется транзакцией savePlan — межтабличный CHECK PostgreSQL запрещает.
ALTER TABLE "SubscriptionPlan"
  ADD CONSTRAINT subscription_plan_package_rules CHECK (
    "sessionsCount" IN (5, 10) AND "priceMinor" > 0
  );
