import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import {
  localDateTimeToInstant,
  shiftLocalDate,
  todayLocalDate,
  weekdayOf,
  type LocalDate,
} from "../lib/domain/time";

/**
 * Демонстрационные данные.
 *
 * Объём по заданию: 10 клиентов, 6 услуг, 30 записей, 5 абонементов.
 * Сверх того — платежи, списания, неявки, чат и заметки: без них дашборд
 * и финансы показывают нули, и проверить их нечем.
 *
 * Данные детерминированы (фиксированный генератор случайных чисел), поэтому
 * повторный запуск даёт тот же результат, а не «примерно похожий».
 * Записи расставлены вокруг сегодняшней даты, чтобы дашборд «выручка сегодня»
 * и «записи на день» не оказались пустыми в любой день запуска.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Линейный конгруэнтный генератор: воспроизводимость важнее качества случайности.
let seed = 20260806;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;

const CLIENTS = [
  ["Иванова", "Ольга", "Петровна", "+79990000001", "olga@example.com", "REFERRAL"],
  ["Петров", "Сергей", "Иванович", "+79990000002", "sergey@example.com", "SEARCH"],
  ["Смирнова", "Анна", "Викторовна", "+79990000003", "anna.s@example.com", "SOCIAL"],
  ["Кузнецов", "Дмитрий", "Олегович", "+79990000004", "dmitry@example.com", "WALK_IN"],
  ["Соколова", "Мария", "Андреевна", "+79990000005", "maria@example.com", "REFERRAL"],
  ["Попов", "Алексей", "Николаевич", "+79990000006", "alexey@example.com", "SEARCH"],
  ["Лебедева", "Екатерина", "Сергеевна", "+79990000007", "kate@example.com", "SOCIAL"],
  ["Новиков", "Игорь", "Павлович", "+79990000008", "igor@example.com", "WALK_IN"],
  ["Морозова", "Татьяна", "Львовна", "+79990000009", "tatiana@example.com", "REFERRAL"],
  ["Волков", "Андрей", "Дмитриевич", "+79990000010", "andrey@example.com", "OTHER"],
] as const;

const NOTES = [
  ["CONTRAINDICATION", "Грыжа L4–L5, глубокое давление в пояснице противопоказано"],
  ["CONTRAINDICATION", "Аллергия на эфирные масла — работать только на базовом"],
  ["PREFERENCE", "Предпочитает среднее давление и тишину во время сеанса"],
  ["PREFERENCE", "Просит начинать с шейно-воротниковой зоны"],
  ["GENERAL", "Приходит с работы, часто задерживается на 5–10 минут"],
] as const;

async function main() {
  console.info("Сид: очистка данных");
  await truncate();

  const organization = await seedOrganization();
  const master = await seedMaster();
  const { services, plans } = await seedCatalog();
  const clients = await seedClients();

  console.info("Сид: записи и платежи");
  const appointments = await seedAppointments({
    clients,
    services,
    masterId: master.id,
    timezone: organization.timezone,
    bufferMinutes: organization.bufferMinutes,
  });

  await seedSubscriptions({ clients, plans, services, appointments });
  await seedChat(clients);

  const counts = await Promise.all([
    prisma.client.count(),
    prisma.service.count(),
    prisma.appointment.count(),
    prisma.subscription.count(),
    prisma.payment.count(),
  ]);

  console.info(
    `Готово: ${counts[0]} клиентов, ${counts[1]} услуг, ${counts[2]} записей, ` +
      `${counts[3]} абонементов, ${counts[4]} платежей`,
  );
  console.info("Вход администратора: admin@example.com");
  console.info("Вход клиента: olga@example.com, sergey@example.com, anna.s@example.com");
  console.info("Ссылки для входа придут в Mailpit: http://localhost:8025");
}

async function truncate() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "Message", "Conversation", "NotificationLog", "Payment",
      "SubscriptionUsage", "Subscription", "SubscriptionPlan", "Appointment",
      "ClientNote", "Client", "Service", "ServiceCategory", "TimeOff",
      "WorkingHours", "Master", "Session", "Account", "User", "Organization"
    RESTART IDENTITY CASCADE
  `);
}

async function seedOrganization() {
  return prisma.organization.create({
    data: {
      name: "Массажный кабинет «Тишина»",
      timezone: "Europe/Moscow",
      slotStepMinutes: 15,
      bufferMinutes: 15,
      minLeadTimeMinutes: 120,
      cancellationWindowHours: 12,
      reminderOffsetMinutes: 120,
      chargeSubscriptionOnNoShow: true,
      setupCompletedAt: new Date(),
    },
  });
}

async function seedMaster() {
  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "Анна Смирнова",
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  const master = await prisma.master.create({
    data: {
      userId: admin.id,
      displayName: "Анна Смирнова",
      specialization: "Классический и спортивный массаж",
      color: "#0f766e",
    },
  });

  // Пн–пт 10:00–20:00, суббота короче. Воскресенье выходной.
  await prisma.workingHours.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        masterId: master.id,
        weekday,
        startMinute: 10 * 60,
        endMinute: 20 * 60,
      })),
      { masterId: master.id, weekday: 6, startMinute: 11 * 60, endMinute: 16 * 60 },
    ],
  });

  return master;
}

async function seedCatalog() {
  const categories = await Promise.all(
    [
      { name: "Классический", slug: "classic", sortOrder: 1 },
      { name: "Спортивный", slug: "sport", sortOrder: 2 },
      { name: "SPA и релакс", slug: "spa", sortOrder: 3 },
    ].map((data) => prisma.serviceCategory.create({ data })),
  );

  const services = await Promise.all(
    [
      ["classic", "Классический массаж, 60 мин", "classic-60", 60, 350_000,
        "Общий массаж тела: снимает напряжение, улучшает кровообращение."],
      ["classic", "Массаж спины и шеи, 30 мин", "back-neck-30", 30, 200_000,
        "Точечная работа с зоной, которая страдает от сидячей работы."],
      ["sport", "Спортивный массаж, 90 мин", "sport-90", 90, 520_000,
        "Глубокая проработка мышц, ускоряет восстановление."],
      ["sport", "Восстановительный массаж, 60 мин", "recovery-60", 60, 400_000,
        "Мягкая техника после соревнований и тяжёлых тренировок."],
      ["spa", "Расслабляющий массаж с маслами, 90 мин", "relax-oil-90", 90, 480_000,
        "Медленный ритм, тёплые масла, работа с общим напряжением."],
      ["spa", "Массаж стоп, 45 мин", "foot-45", 45, 250_000,
        "Рефлексотерапия стоп: снимает усталость, помогает при отёках."],
    ].map(([categorySlug, name, slug, duration, price, description]) =>
      prisma.service.create({
        data: {
          categoryId: categories.find((c) => c.slug === categorySlug)!.id,
          name: name as string,
          slug: slug as string,
          durationMinutes: duration as number,
          priceMinor: price as number,
          description: description as string,
        },
      }),
    ),
  );

  const plans = await Promise.all(
    [
      ["classic-60", "Классический массаж, 5 сеансов", 5, 1_575_000],
      ["classic-60", "Классический массаж, 10 сеансов", 10, 2_975_000],
      ["back-neck-30", "Спина и шея, 10 сеансов", 10, 1_700_000],
      ["sport-90", "Спортивный массаж, 5 сеансов", 5, 2_340_000],
    ].map(([serviceSlug, name, sessions, price]) =>
      prisma.subscriptionPlan.create({
        data: {
          serviceId: services.find((s) => s.slug === serviceSlug)!.id,
          name: name as string,
          sessionsCount: sessions as number,
          priceMinor: price as number,
          validityDays: 180,
        },
      }),
    ),
  );

  return { services, plans };
}

async function seedClients() {
  const clients = [];

  for (const [index, [lastName, firstName, middleName, phone, email, source]] of CLIENTS.entries()) {
    const client = await prisma.client.create({
      data: {
        lastName,
        firstName,
        middleName,
        phone,
        email,
        source: source as "REFERRAL",
        birthDate: new Date(1985 + index, index % 12, 1 + (index % 27)),
      },
    });

    // Учётные записи — только первым трём. Так и в жизни: большинство
    // клиентов салона никогда не зайдут в систему, и интерфейс должен
    // одинаково работать с карточкой и без учётки, и с ней.
    // Эти трое нужны, чтобы кабинет клиента было чем посмотреть.
    if (index < 3) {
      const user = await prisma.user.create({
        data: { email, name: `${firstName} ${lastName}`, role: "CLIENT", emailVerified: new Date() },
      });

      await prisma.client.update({ where: { id: client.id }, data: { userId: user.id } });
    }

    // Заметки не у всех: карточка без заметок — нормальное состояние,
    // и интерфейс должен выглядеть прилично в обоих случаях.
    if (index < 5) {
      const [type, body] = NOTES[index]!;
      await prisma.clientNote.create({
        data: {
          clientId: client.id,
          type: type as "GENERAL",
          body,
          isPinned: type === "CONTRAINDICATION",
        },
      });
    }

    clients.push(client);
  }

  return clients;
}

type SeededService = Awaited<ReturnType<typeof seedCatalog>>["services"][number];
type SeededClient = Awaited<ReturnType<typeof seedClients>>[number];

async function seedAppointments(params: {
  clients: SeededClient[];
  services: SeededService[];
  masterId: string;
  timezone: string;
  bufferMinutes: number;
}) {
  const created = [];
  const now = new Date();

  /**
   * Раскладка по сетке, а не случайными часами.
   *
   * Три слота в день (10:00, 13:00, 16:00) с запасом больше самой длинной
   * услуги с буфером — 90 + 15 минут. Пересечься они не могут, поэтому
   * EXCLUDE-констрейнт ни одну запись не отклонит и в базе окажется ровно
   * столько записей, сколько обещано.
   *
   * Выходные пропускаются: запись в день, когда мастер не работает,
   * противоречила бы графику и сломала бы вид календаря.
   */
  const SLOT_HOURS = [10, 13, 16];
  const PAST_COUNT = 22;
  const FUTURE_COUNT = 8;

  const today = todayLocalDate(params.timezone, now);
  const workingDay = (offset: number): LocalDate => shiftLocalDate(today, offset);
  const isWorkingDay = (date: LocalDate) => {
    const weekday = weekdayOf(date, params.timezone);
    return weekday !== 0 && weekday !== 6;
  };

  const plan: Array<{ date: LocalDate; hour: number; status: string }> = [];

  // Прошлое: идём назад по дням, набирая по три визита.
  for (let offset = -1; plan.length < PAST_COUNT; offset -= 1) {
    const day = workingDay(offset);
    if (!isWorkingDay(day)) continue;

    for (const hour of SLOT_HOURS) {
      if (plan.length >= PAST_COUNT) break;

      const index = plan.length;
      plan.push({
        date: day,
        hour,
        // Каждая седьмая — неявка, каждая девятая — отмена: они должны быть
        // заметны в статистике, но не доминировать над нормальными визитами.
        status: index % 7 === 3 ? "NO_SHOW" : index % 9 === 5 ? "CANCELLED" : "COMPLETED",
      });
    }
  }

  // Будущее: ближайшие рабочие дни, включая сегодня.
  for (let offset = 0; plan.length < PAST_COUNT + FUTURE_COUNT; offset += 1) {
    const day = workingDay(offset);
    if (!isWorkingDay(day)) continue;

    for (const hour of SLOT_HOURS) {
      if (plan.length >= PAST_COUNT + FUTURE_COUNT) break;

      plan.push({
        date: day,
        hour,
        status: plan.length % 4 === 0 ? "PENDING" : "CONFIRMED",
      });
    }
  }

  for (const [index, item] of plan.entries()) {
    const service = params.services[index % params.services.length]!;
    const client = params.clients[index % params.clients.length]!;

    const startsAt = localDateTimeToInstant(item.date, item.hour * 60, params.timezone);

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const blockedUntil = new Date(endsAt.getTime() + params.bufferMinutes * 60_000);

    const appointment = await prisma.appointment.create({
      data: {
        clientId: client.id,
        masterId: params.masterId,
        serviceId: service.id,
        startsAt,
        endsAt,
        blockedUntil,
        status: item.status as "COMPLETED",
        serviceNameSnapshot: service.name,
        priceMinorSnapshot: service.priceMinor,
        durationMinutesSnapshot: service.durationMinutes,
        bufferMinutesSnapshot: params.bufferMinutes,
        paymentMode: "CASH_OR_CARD",
        completedAt: item.status === "COMPLETED" ? endsAt : null,
        noShowAt: item.status === "NO_SHOW" ? endsAt : null,
        cancelledAt: item.status === "CANCELLED" ? startsAt : null,
        cancelReason: item.status === "CANCELLED" ? "Клиент перенёс" : null,
      },
    });

    if (item.status === "COMPLETED") {
      await prisma.payment.create({
        data: {
          clientId: client.id,
          appointmentId: appointment.id,
          kind: "SALE",
          amountMinor: service.priceMinor,
          method: pick(["CARD", "CASH", "TRANSFER"] as const),
          paidAt: endsAt,
        },
      });
    }

    if (item.status === "NO_SHOW") {
      await prisma.client.update({
        where: { id: client.id },
        data: { noShowCount: { increment: 1 } },
      });
    }

    created.push(appointment);
  }

  return created;
}

async function seedSubscriptions(params: {
  clients: SeededClient[];
  plans: Awaited<ReturnType<typeof seedCatalog>>["plans"];
  services: SeededService[];
  appointments: Array<{ id: string; clientId: string; serviceId: string; status: string; startsAt: Date }>;
}) {
  const now = new Date();

  for (let index = 0; index < 5; index += 1) {
    const plan = params.plans[index % params.plans.length]!;
    const client = params.clients[index]!;
    const purchasedAt = new Date(now.getTime() - (30 + index * 12) * 864e5);

    const subscription = await prisma.subscription.create({
      data: {
        clientId: client.id,
        planId: plan.id,
        serviceId: plan.serviceId,
        serviceNameSnapshot: params.services.find((s) => s.id === plan.serviceId)!.name,
        sessionsTotal: plan.sessionsCount,
        pricePaidMinor: plan.priceMinor,
        purchasedAt,
        expiresAt: new Date(purchasedAt.getTime() + plan.validityDays * 864e5),
        status: "ACTIVE",
      },
    });

    await prisma.payment.create({
      data: {
        clientId: client.id,
        subscriptionId: subscription.id,
        kind: "SALE",
        amountMinor: plan.priceMinor,
        method: "CARD",
        paidAt: purchasedAt,
      },
    });

    // Привязываем списания к реальным завершённым визитам того же клиента
    // на ту же услугу — иначе журнал списаний противоречил бы истории.
    const eligible = params.appointments.filter(
      (appointment) =>
        appointment.clientId === client.id &&
        appointment.serviceId === plan.serviceId &&
        appointment.status === "COMPLETED",
    );

    for (const appointment of eligible.slice(0, Math.min(2, plan.sessionsCount - 1))) {
      const alreadyUsed = await prisma.subscriptionUsage.findUnique({
        where: { appointmentId: appointment.id },
      });

      if (alreadyUsed) continue;

      await prisma.subscriptionUsage.create({
        data: {
          subscriptionId: subscription.id,
          appointmentId: appointment.id,
          state: "CONSUMED",
          reservedAt: new Date(appointment.startsAt.getTime() - 864e5),
          consumedAt: appointment.startsAt,
        },
      });

      // Визит оплачен абонементом — отдельный платёж за него не нужен,
      // иначе выручка задвоится.
      await prisma.payment.deleteMany({ where: { appointmentId: appointment.id } });
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { paymentMode: "SUBSCRIPTION" },
      });
    }
  }
}

async function seedChat(clients: SeededClient[]) {
  for (const client of clients.slice(0, 3)) {
    const conversation = await prisma.conversation.create({
      data: { clientId: client.id },
    });

    const messages = [
      { senderRole: "CLIENT" as const, body: "Здравствуйте! Можно перенести запись на час позже?" },
      { senderRole: "ADMIN" as const, body: "Добрый день! Да, конечно — перенесла, всё в силе." },
      { senderRole: "CLIENT" as const, body: "Спасибо большое!" },
    ];

    let last = new Date(Date.now() - 3 * 864e5);

    for (const message of messages) {
      last = new Date(last.getTime() + 3_600_000);

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderRole: message.senderRole,
          body: message.body,
          createdAt: last,
          // Последнее сообщение клиента оставляем непрочитанным,
          // чтобы счётчик в интерфейсе был не нулевым.
          readAt: message.senderRole === "ADMIN" ? last : null,
        },
      });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: last },
    });
  }
}

main()
  .catch((error) => {
    console.error("Сид упал:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
