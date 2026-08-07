import "server-only";
import { prisma } from "@/lib/db";

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

const CATEGORIES = [
  { name: "Классический", slug: "classic", sortOrder: 1 },
  { name: "Спортивный", slug: "sport", sortOrder: 2 },
  { name: "SPA и релакс", slug: "spa", sortOrder: 3 },
];

const SERVICES = [
  {
    categorySlug: "classic",
    name: "Классический массаж, 60 мин",
    slug: "classic-60",
    description: "Общий массаж тела: снимает мышечное напряжение, улучшает кровообращение.",
    durationMinutes: 60,
    priceMinor: 350_000,
  },
  {
    categorySlug: "classic",
    name: "Массаж спины и шеи, 30 мин",
    slug: "back-neck-30",
    description: "Точечная работа с зоной, которая страдает от сидячей работы.",
    durationMinutes: 30,
    priceMinor: 200_000,
  },
  {
    categorySlug: "sport",
    name: "Спортивный массаж, 90 мин",
    slug: "sport-90",
    description: "Глубокая проработка мышц до или после нагрузки, ускоряет восстановление.",
    durationMinutes: 90,
    priceMinor: 520_000,
  },
  {
    categorySlug: "sport",
    name: "Восстановительный массаж, 60 мин",
    slug: "recovery-60",
    description: "Мягкая техника для восстановления после соревнований и тяжёлых тренировок.",
    durationMinutes: 60,
    priceMinor: 400_000,
  },
  {
    categorySlug: "spa",
    name: "Расслабляющий массаж с маслами, 90 мин",
    slug: "relax-oil-90",
    description: "Медленный ритм, тёплые масла, работа с общим напряжением.",
    durationMinutes: 90,
    priceMinor: 480_000,
  },
  {
    categorySlug: "spa",
    name: "Массаж стоп, 45 мин",
    slug: "foot-45",
    description: "Рефлексотерапия стоп: снимает усталость, помогает при отёках.",
    durationMinutes: 45,
    priceMinor: 250_000,
  },
];

// Скидка ~10% за 5 сеансов и ~15% за 10 — типичная сетка для частного салона.
const PLANS = [
  { serviceSlug: "classic-60", name: "Классический массаж, 5 сеансов", sessionsCount: 5, priceMinor: 1_575_000 },
  { serviceSlug: "classic-60", name: "Классический массаж, 10 сеансов", sessionsCount: 10, priceMinor: 2_975_000 },
  { serviceSlug: "back-neck-30", name: "Спина и шея, 10 сеансов", sessionsCount: 10, priceMinor: 1_700_000 },
];

export async function seedDemoCatalog(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const category of CATEGORIES) {
      await tx.serviceCategory.upsert({
        where: { slug: category.slug },
        create: category,
        update: {},
      });
    }

    for (const service of SERVICES) {
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

    for (const plan of PLANS) {
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
