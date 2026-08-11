/** Общий набор каталога для wizard и безопасного наполнения production. */
export const DEMO_CATEGORIES = [
  { name: "Классический", slug: "classic", sortOrder: 1 },
  { name: "Спортивный", slug: "sport", sortOrder: 2 },
  { name: "SPA и релакс", slug: "spa", sortOrder: 3 },
] as const;

export const DEMO_SERVICES = [
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
] as const;

// Скидка ~10% за 5 сеансов и ~15% за 10 — типичная сетка частного салона.
export const DEMO_PLANS = [
  {
    serviceSlug: "classic-60",
    name: "Классический массаж, 5 сеансов",
    sessionsCount: 5,
    priceMinor: 1_575_000,
  },
  {
    serviceSlug: "classic-60",
    name: "Классический массаж, 10 сеансов",
    sessionsCount: 10,
    priceMinor: 2_975_000,
  },
  {
    serviceSlug: "back-neck-30",
    name: "Спина и шея, 10 сеансов",
    sessionsCount: 10,
    priceMinor: 1_700_000,
  },
] as const;
