import "server-only";
import { prisma } from "@/lib/db";
import { DEMO_CATEGORIES, DEMO_PLANS, DEMO_SERVICES } from "@/prisma/demo-catalog-data";

/**
 * Демонстрационный каталог: три категории, шесть услуг, три абонемента.
 *
 * Предлагается в wizard, потому что пустой каталог — плохая первая встреча
 * с системой: не на чем посмотреть ни запись, ни абонементы. Цены и
 * длительности взяты близкими к реальным для частного салона.
 *
 * Это именно каталог, а не полные демо-данные: клиенты, записи и платежи
 * создаются сидом (npm run db:seed), потому что им нужны доменные сервисы
 * с их инвариантами, а не прямые вставки.
 */

export async function seedDemoCatalog(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const category of DEMO_CATEGORIES) {
      await tx.serviceCategory.upsert({
        where: { slug: category.slug },
        create: category,
        update: {},
      });
    }

    for (const service of DEMO_SERVICES) {
      const { categorySlug, ...rest } = service;
      const category = await tx.serviceCategory.findUniqueOrThrow({
        where: { slug: categorySlug },
        select: { id: true },
      });

      // upsert по slug: повторный запуск wizard не должен плодить дубли услуг
      // и тем более менять цены — на них ссылается финансовая история.
      await tx.service.upsert({
        where: { slug: rest.slug },
        create: { ...rest, categoryId: category.id },
        update: {},
      });
    }

    for (const plan of DEMO_PLANS) {
      const { serviceSlug, ...rest } = plan;
      const service = await tx.service.findUniqueOrThrow({
        where: { slug: serviceSlug },
        select: { id: true },
      });

      const exists = await tx.subscriptionPlan.findFirst({
        where: { serviceId: service.id, sessionsCount: rest.sessionsCount },
        select: { id: true },
      });

      if (!exists) {
        await tx.subscriptionPlan.create({ data: { ...rest, serviceId: service.id } });
      }
    }
  });
}

export async function catalogIsEmpty(): Promise<boolean> {
  return (await prisma.service.count()) === 0;
}
