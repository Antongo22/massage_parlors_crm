import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Queue } from "bullmq";
import { fromZonedTime } from "date-fns-tz";
import IORedis from "ioredis";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { DEMO_CATEGORIES, DEMO_PLANS, DEMO_SERVICES } from "./demo-catalog-data";

/**
 * Недеструктивное наполнение стенда для сдачи.
 *
 * В отличие от seed.ts этот сценарий НИЧЕГО не удаляет и не меняет настройки
 * салона. Созданные строки имеют устойчивые маркеры, поэтому повторный запуск
 * дополняет недостающее, а не плодит дубли.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_CLIENTS = [
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

const DEMO_NOTES = [
  ["CONTRAINDICATION", "Грыжа L4–L5, глубокое давление в пояснице противопоказано"],
  ["CONTRAINDICATION", "Аллергия на эфирные масла — работать только на базовом"],
  ["PREFERENCE", "Предпочитает среднее давление и тишину во время сеанса"],
  ["PREFERENCE", "Просит начинать с шейно-воротниковой зоны"],
  ["GENERAL", "Часто приезжает после работы, возможна задержка на 5–10 минут"],
] as const;

const APPOINTMENT_MARKER = "demo-fill:v1:appointment:";
const TOTAL_APPOINTMENTS = 30;
const PAST_APPOINTMENTS = 22;

type BusyInterval = { startsAt: Date; blockedUntil: Date };
type Candidate = { startsAt: Date; endsAt: Date; blockedUntil: Date };

export type DemoFillResult = {
  clientCount: number;
  serviceCount: number;
  appointmentCount: number;
  subscriptionCount: number;
  messageCount: number;
};

export async function fillDemoData(): Promise<DemoFillResult> {
  const organization = await prisma.organization.findFirst();
  const master = await prisma.master.findFirst({
    where: { isActive: true, workingHours: { some: {} } },
    include: { workingHours: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } },
  });

  if (!organization?.setupCompletedAt || !master) {
    throw new Error("Сначала завершите wizard: нужны организация, мастер и рабочий график");
  }

  await ensureCatalog();
  const clients = await ensureClients();
  const services = await prisma.service.findMany({
    where: { slug: { in: DEMO_SERVICES.map((service) => service.slug) } },
    orderBy: { slug: "asc" },
  });

  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true, sessionsCount: { in: [5, 10] } },
    include: { service: true },
    orderBy: [{ sessionsCount: "asc" }, { name: "asc" }],
  });

  if (services.length < 6 || plans.length === 0) {
    throw new Error("Не удалось подготовить демонстрационный каталог");
  }

  await ensureAppointments({
    clients,
    services,
    master,
    organization,
  });
  await ensureSubscriptions(clients, plans);
  await ensureChat(clients);
  await ensureReminderJobs();

  const [clientCount, serviceCount, appointmentCount, subscriptionCount, messageCount] =
    await Promise.all([
      prisma.client.count(),
      prisma.service.count(),
      prisma.appointment.count(),
      prisma.subscription.count(),
      prisma.message.count(),
    ]);

  console.info(
    `Готово без удаления данных: ${clientCount} клиентов, ${serviceCount} услуг, ` +
      `${appointmentCount} записей, ${subscriptionCount} абонементов, ${messageCount} сообщений`,
  );

  return { clientCount, serviceCount, appointmentCount, subscriptionCount, messageCount };
}

async function ensureCatalog() {
  await prisma.$transaction(async (tx) => {
    for (const category of DEMO_CATEGORIES) {
      await tx.serviceCategory.upsert({
        where: { slug: category.slug },
        create: category,
        update: {},
      });
    }

    for (const service of DEMO_SERVICES) {
      const { categorySlug, ...data } = service;
      const category = await tx.serviceCategory.findUniqueOrThrow({
        where: { slug: categorySlug },
        select: { id: true },
      });

      await tx.service.upsert({
        where: { slug: data.slug },
        create: { ...data, categoryId: category.id },
        update: {},
      });
    }

    for (const plan of DEMO_PLANS) {
      const service = await tx.service.findUniqueOrThrow({
        where: { slug: plan.serviceSlug },
        select: { id: true },
      });
      const exists = await tx.subscriptionPlan.findFirst({
        where: { serviceId: service.id, sessionsCount: plan.sessionsCount },
        select: { id: true },
      });

      if (!exists) {
        const { serviceSlug: _serviceSlug, ...data } = plan;
        await tx.subscriptionPlan.create({ data: { ...data, serviceId: service.id } });
      }
    }
  });
}

async function ensureClients() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  const clients = [];

  for (const [index, [lastName, firstName, middleName, phone, email, source]] of DEMO_CLIENTS.entries()) {
    const client = await prisma.client.upsert({
      where: { phone },
      create: {
        lastName,
        firstName,
        middleName,
        phone,
        email,
        source,
        birthDate: new Date(Date.UTC(1985 + index, index % 12, 1 + (index % 27))),
      },
      update: {},
    });

    if (index < 3 && !client.userId) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      const user =
        existingUser ??
        (await prisma.user.create({
          data: { email, name: `${firstName} ${lastName}`, role: "CLIENT", emailVerified: new Date() },
        }));

      if (user.role === "CLIENT") {
        await prisma.client.update({ where: { id: client.id }, data: { userId: user.id } });
      }
    }

    if (index < DEMO_NOTES.length) {
      const [type, body] = DEMO_NOTES[index]!;
      const note = await prisma.clientNote.findFirst({ where: { clientId: client.id, body } });

      if (!note) {
        await prisma.clientNote.create({
          data: {
            clientId: client.id,
            authorUserId: admin?.id,
            type,
            body,
            isPinned: type === "CONTRAINDICATION",
          },
        });
      }
    }

    clients.push(await prisma.client.findUniqueOrThrow({ where: { id: client.id } }));
  }

  return clients;
}

async function ensureAppointments(params: {
  clients: Awaited<ReturnType<typeof ensureClients>>;
  services: Awaited<ReturnType<typeof prisma.service.findMany>>;
  master: NonNullable<Awaited<ReturnType<typeof prisma.master.findFirst>>> & {
    workingHours: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  };
  organization: NonNullable<Awaited<ReturnType<typeof prisma.organization.findFirst>>>;
}) {
  const now = new Date();
  const rangeFrom = new Date(now.getTime() - 70 * 86_400_000);
  const rangeTo = new Date(now.getTime() + 70 * 86_400_000);
  const existing = await prisma.appointment.findMany({
    where: { masterId: params.master.id, startsAt: { lt: rangeTo }, blockedUntil: { gt: rangeFrom } },
    select: { startsAt: true, blockedUntil: true, internalNote: true },
  });
  const timeOff = await prisma.timeOff.findMany({
    where: { masterId: params.master.id, startsAt: { lt: rangeTo }, endsAt: { gt: rangeFrom } },
    select: { startsAt: true, endsAt: true },
  });
  const markers = new Set(existing.map((item) => item.internalNote).filter(Boolean));
  const busy: BusyInterval[] = existing;
  const localToday = localDateParts(now, params.organization.timezone);
  const offsets = {
    past: Array.from({ length: 61 }, (_, index) => -index),
    future: Array.from({ length: 61 }, (_, index) => index),
  };

  for (let index = 0; index < TOTAL_APPOINTMENTS; index += 1) {
    const marker = `${APPOINTMENT_MARKER}${String(index + 1).padStart(2, "0")}`;
    if (markers.has(marker)) continue;

    const period = index < PAST_APPOINTMENTS ? "past" : "future";
    const service = params.services[index % params.services.length]!;
    const candidate = nextCandidate({
      period,
      offsets: offsets[period],
      localToday,
      timezone: params.organization.timezone,
      workingHours: params.master.workingHours,
      durationMinutes: service.durationMinutes,
      bufferMinutes: params.organization.bufferMinutes,
      minLeadTimeMinutes: params.organization.minLeadTimeMinutes,
      now,
      busy,
      timeOff,
    });

    const client = params.clients[index % params.clients.length]!;
    const status =
      period === "future"
        ? index % 2 === 0
          ? "CONFIRMED"
          : "PENDING"
        : index % 7 === 3
          ? "NO_SHOW"
          : index % 9 === 5
            ? "CANCELLED"
            : "COMPLETED";

    await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          clientId: client.id,
          masterId: params.master.id,
          serviceId: service.id,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          blockedUntil: candidate.blockedUntil,
          status,
          serviceNameSnapshot: service.name,
          priceMinorSnapshot: service.priceMinor,
          durationMinutesSnapshot: service.durationMinutes,
          bufferMinutesSnapshot: params.organization.bufferMinutes,
          paymentMode: "CASH_OR_CARD",
          clientComment: index % 4 === 0 ? "Предпочтительно среднее давление" : null,
          internalNote: marker,
          completedAt: status === "COMPLETED" ? candidate.endsAt : null,
          noShowAt: status === "NO_SHOW" ? candidate.endsAt : null,
          cancelledAt: status === "CANCELLED" ? candidate.startsAt : null,
          cancelReason: status === "CANCELLED" ? "Клиент перенёс визит" : null,
        },
      });

      if (status === "COMPLETED") {
        await tx.payment.create({
          data: {
            clientId: client.id,
            appointmentId: appointment.id,
            kind: "SALE",
            amountMinor: service.priceMinor,
            method: index % 3 === 0 ? "CASH" : index % 3 === 1 ? "CARD" : "TRANSFER",
            paidAt: candidate.endsAt,
            comment: "Демонстрационная оплата",
          },
        });
      }

      if (status === "NO_SHOW") {
        await tx.client.update({ where: { id: client.id }, data: { noShowCount: { increment: 1 } } });
      }

      if (period === "future") {
        await tx.notificationLog.create({
          data: {
            appointmentId: appointment.id,
            type: "REMINDER_2H",
            channel: "EMAIL",
            status: "SCHEDULED",
            scheduledFor: new Date(
              candidate.startsAt.getTime() - params.organization.reminderOffsetMinutes * 60_000,
            ),
            jobId: `reminder-${appointment.id}`,
          },
        });
      }
    });

    busy.push(candidate);
  }
}

function nextCandidate(params: {
  period: "past" | "future";
  offsets: number[];
  localToday: { year: number; month: number; day: number };
  timezone: string;
  workingHours: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  durationMinutes: number;
  bufferMinutes: number;
  minLeadTimeMinutes: number;
  now: Date;
  busy: BusyInterval[];
  timeOff: Array<{ startsAt: Date; endsAt: Date }>;
}): Candidate {
  for (const offset of params.offsets) {
    const date = shiftDate(params.localToday, offset);
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();

    for (const shift of params.workingHours.filter((item) => item.weekday === weekday)) {
      for (
        let startMinute = shift.startMinute;
        startMinute + params.durationMinutes + params.bufferMinutes <= shift.endMinute;
        startMinute += Math.max(120, params.durationMinutes + params.bufferMinutes)
      ) {
        const startsAt = zonedInstant(date, startMinute, params.timezone);
        const endsAt = new Date(startsAt.getTime() + params.durationMinutes * 60_000);
        const blockedUntil = new Date(endsAt.getTime() + params.bufferMinutes * 60_000);
        const leadBoundary = new Date(params.now.getTime() + params.minLeadTimeMinutes * 60_000);

        if (params.period === "past" && blockedUntil >= params.now) continue;
        if (params.period === "future" && startsAt <= leadBoundary) continue;
        if (overlapsAny({ startsAt, blockedUntil }, params.busy)) continue;
        if (
          params.timeOff.some(
            (item) => startsAt < item.endsAt && blockedUntil > item.startsAt,
          )
        ) {
          continue;
        }

        return { startsAt, endsAt, blockedUntil };
      }
    }
  }

  throw new Error(`Не найден свободный ${params.period === "past" ? "прошлый" : "будущий"} слот`);
}

function overlapsAny(candidate: BusyInterval, busy: BusyInterval[]) {
  return busy.some(
    (item) => candidate.startsAt < item.blockedUntil && candidate.blockedUntil > item.startsAt,
  );
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: value("year"), month: value("month"), day: value("day") };
}

function shiftDate(date: { year: number; month: number; day: number }, offset: number) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + offset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function zonedInstant(
  date: { year: number; month: number; day: number },
  minute: number,
  timezone: string,
) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return fromZonedTime(
    `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:00`,
    timezone,
  );
}

async function ensureSubscriptions(
  clients: Awaited<ReturnType<typeof ensureClients>>,
  plans: Array<{
    id: string;
    serviceId: string;
    sessionsCount: number;
    priceMinor: number;
    validityDays: number;
    service: { name: string };
  }>,
) {
  const now = new Date();

  for (let index = 0; index < 5; index += 1) {
    const client = clients[index]!;
    const plan = plans[index % plans.length]!;
    const existing = await prisma.subscription.findFirst({ where: { clientId: client.id } });
    if (existing) continue;

    const purchasedAt = new Date(now.getTime() - (20 + index * 4) * 86_400_000);
    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          clientId: client.id,
          planId: plan.id,
          serviceId: plan.serviceId,
          serviceNameSnapshot: plan.service.name,
          sessionsTotal: plan.sessionsCount,
          pricePaidMinor: plan.priceMinor,
          purchasedAt,
          expiresAt: new Date(purchasedAt.getTime() + plan.validityDays * 86_400_000),
          status: "ACTIVE",
        },
      });

      await tx.payment.create({
        data: {
          clientId: client.id,
          subscriptionId: subscription.id,
          kind: "SALE",
          amountMinor: plan.priceMinor,
          method: "CARD",
          paidAt: purchasedAt,
          comment: "Демонстрационная продажа абонемента",
        },
      });
    });
  }
}

async function ensureChat(clients: Awaited<ReturnType<typeof ensureClients>>) {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });

  for (const client of clients.slice(0, 3)) {
    const conversation = await prisma.conversation.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id },
      update: {},
      include: { _count: { select: { messages: true } } },
    });
    if (conversation._count.messages > 0) continue;

    const clientMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderUserId: client.userId,
        senderRole: "CLIENT",
        body: "Здравствуйте! Подскажите, пожалуйста, что лучше выбрать для спины?",
      },
    });
    const adminMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderUserId: admin?.id,
        senderRole: "ADMIN",
        body: "Здравствуйте! Начните с массажа спины и шеи на 30 минут — мастер уточнит ощущения перед сеансом.",
        readAt: new Date(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: adminMessage.createdAt ?? clientMessage.createdAt },
    });
  }
}

async function ensureReminderJobs() {
  const reminders = await prisma.notificationLog.findMany({
    where: {
      type: "REMINDER_2H",
      status: "SCHEDULED",
      appointment: { internalNote: { startsWith: APPOINTMENT_MARKER } },
    },
    select: { appointmentId: true, scheduledFor: true, jobId: true },
  });
  if (reminders.length === 0) return;

  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue("reminders", { connection });
  const now = Date.now();

  try {
    for (const reminder of reminders) {
      if (!reminder.appointmentId) continue;
      const jobId = reminder.jobId ?? `reminder-${reminder.appointmentId}`;
      const existingJob = await queue.getJob(jobId);
      if (existingJob) continue;

      await queue.add(
        "reminder",
        { appointmentId: reminder.appointmentId },
        {
          jobId,
          delay: Math.max(0, reminder.scheduledFor.getTime() - now),
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
        },
      );
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
}

const launchedFromCli = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (launchedFromCli) {
  fillDemoData()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
