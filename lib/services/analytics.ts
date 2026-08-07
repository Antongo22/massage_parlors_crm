import "server-only";
import { prisma } from "@/lib/db";
import { localDayRange, type LocalDate } from "@/lib/domain/time";

/**
 * Аналитика.
 *
 * Выручка считается по журналу платежей, а не по стоимости записей. Причина
 * не в удобстве: абонемент оплачивается один раз, а визитов по нему десять —
 * подсчёт по записям либо удвоит выручку, либо потеряет её, и возвраты
 * положить будет некуда.
 *
 * Группировка по периодам делается в PostgreSQL через date_trunc с указанием
 * таймзоны салона. Считать это в JS означало бы вытащить все платежи
 * за год в память и получить неверные границы суток.
 */

export type Granularity = "day" | "week" | "month";

export type RevenuePoint = {
  period: string;
  revenueMinor: number;
  salesCount: number;
};

export async function getRevenueSeries(params: {
  from: Date;
  to: Date;
  granularity: Granularity;
  timezone: string;
}): Promise<RevenuePoint[]> {
  const rows = await prisma.$queryRaw<Array<{ period: Date; revenue: bigint; sales: bigint }>>`
    SELECT
      date_trunc(${params.granularity}, "paidAt" AT TIME ZONE ${params.timezone}) AS period,
      -- Возврат уменьшает выручку периода, в котором он оформлен:
      -- касса сходится по дню, а не задним числом.
      SUM(CASE WHEN kind = 'SALE' THEN "amountMinor" ELSE -"amountMinor" END) AS revenue,
      COUNT(*) FILTER (WHERE kind = 'SALE') AS sales
    FROM "Payment"
    WHERE "paidAt" >= ${params.from} AND "paidAt" < ${params.to}
    GROUP BY period
    ORDER BY period
  `;

  return rows.map((row) => ({
    period: row.period.toISOString(),
    revenueMinor: Number(row.revenue),
    salesCount: Number(row.sales),
  }));
}

export type ServiceRevenue = {
  serviceId: string;
  serviceName: string;
  revenueMinor: number;
  visits: number;
};

/**
 * Доход по услугам. Платёж связан либо с визитом, либо с абонементом —
 * услуга достаётся из соответствующей ветки, поэтому COALESCE, а не join
 * только по визитам.
 */
export async function getRevenueByService(params: {
  from: Date;
  to: Date;
}): Promise<ServiceRevenue[]> {
  const rows = await prisma.$queryRaw<
    Array<{ serviceId: string; serviceName: string; revenue: bigint; visits: bigint }>
  >`
    SELECT
      s.id AS "serviceId",
      s.name AS "serviceName",
      SUM(CASE WHEN p.kind = 'SALE' THEN p."amountMinor" ELSE -p."amountMinor" END) AS revenue,
      COUNT(*) FILTER (WHERE p."appointmentId" IS NOT NULL AND p.kind = 'SALE') AS visits
    FROM "Payment" p
    LEFT JOIN "Appointment" a ON a.id = p."appointmentId"
    LEFT JOIN "Subscription" sub ON sub.id = p."subscriptionId"
    JOIN "Service" s ON s.id = COALESCE(a."serviceId", sub."serviceId")
    WHERE p."paidAt" >= ${params.from} AND p."paidAt" < ${params.to}
    GROUP BY s.id, s.name
    ORDER BY revenue DESC
  `;

  return rows.map((row) => ({
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    revenueMinor: Number(row.revenue),
    visits: Number(row.visits),
  }));
}

export type PeriodSummary = {
  revenueMinor: number;
  refundsMinor: number;
  salesCount: number;
  completedVisits: number;
  /** Выручка / число продаж. Именно чек, а не выручка на визит. */
  averageSaleMinor: number;
  /** Выручка / число состоявшихся визитов. */
  averagePerVisitMinor: number;
  noShowCount: number;
  cancelledCount: number;
};

export async function getPeriodSummary(params: { from: Date; to: Date }): Promise<PeriodSummary> {
  const [payments, appointments] = await Promise.all([
    prisma.payment.groupBy({
      by: ["kind"],
      where: { paidAt: { gte: params.from, lt: params.to } },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { startsAt: { gte: params.from, lt: params.to } },
      _count: true,
    }),
  ]);

  const sales = payments.find((row) => row.kind === "SALE");
  const refunds = payments.find((row) => row.kind === "REFUND");

  const salesMinor = sales?._sum.amountMinor ?? 0;
  const refundsMinor = refunds?._sum.amountMinor ?? 0;
  const revenueMinor = salesMinor - refundsMinor;
  const salesCount = sales?._count ?? 0;

  const completedVisits =
    appointments.find((row) => row.status === "COMPLETED")?._count ?? 0;

  return {
    revenueMinor,
    refundsMinor,
    salesCount,
    completedVisits,
    // Две разные метрики, которые часто путают. Клиент купил абонемент
    // за 40 000 и сходил дважды: средний чек 40 000, выручка на визит 20 000.
    averageSaleMinor: salesCount > 0 ? Math.round(revenueMinor / salesCount) : 0,
    averagePerVisitMinor: completedVisits > 0 ? Math.round(revenueMinor / completedVisits) : 0,
    noShowCount: appointments.find((row) => row.status === "NO_SHOW")?._count ?? 0,
    cancelledCount: appointments.find((row) => row.status === "CANCELLED")?._count ?? 0,
  };
}

export type RetentionStats = {
  totalClients: number;
  returningClients: number;
  returnRate: number;
  /** Пришли повторно в течение 60 дней после первого визита. */
  retention60: number;
  /** Не были больше 45 дней — кандидаты на «отвал». */
  dormantClients: number;
};

/**
 * Возвратность.
 *
 * Не просто «сколько клиентов»: салон живёт на повторных визитах, и вопрос,
 * на который отвечает эта метрика, — «сколько людей вернулось после первого
 * раза и кого мы теряем прямо сейчас».
 */
export async function getRetentionStats(now = new Date()): Promise<RetentionStats> {
  const rows = await prisma.$queryRaw<
    Array<{
      total: bigint;
      returning: bigint;
      retained60: bigint;
      dormant: bigint;
    }>
  >`
    WITH visits AS (
      SELECT
        "clientId",
        MIN("startsAt") AS first_visit,
        MAX("startsAt") AS last_visit,
        COUNT(*) AS visit_count
      FROM "Appointment"
      WHERE status = 'COMPLETED'
      GROUP BY "clientId"
    ),
    second_visit AS (
      SELECT a."clientId", MIN(a."startsAt") AS second_at
      FROM "Appointment" a
      JOIN visits v ON v."clientId" = a."clientId"
      WHERE a.status = 'COMPLETED' AND a."startsAt" > v.first_visit
      GROUP BY a."clientId"
    )
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE v.visit_count > 1) AS returning,
      COUNT(*) FILTER (
        WHERE s.second_at IS NOT NULL
          AND s.second_at <= v.first_visit + INTERVAL '60 days'
      ) AS retained60,
      COUNT(*) FILTER (WHERE v.last_visit < ${now}::timestamptz - INTERVAL '45 days') AS dormant
    FROM visits v
    LEFT JOIN second_visit s ON s."clientId" = v."clientId"
  `;

  const row = rows[0];
  const total = Number(row?.total ?? 0);
  const returning = Number(row?.returning ?? 0);

  return {
    totalClients: total,
    returningClients: returning,
    returnRate: total > 0 ? Math.round((returning / total) * 100) : 0,
    retention60: Number(row?.retained60 ?? 0),
    dormantClients: Number(row?.dormant ?? 0),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getDashboardData(today: LocalDate, timezone: string) {
  const { from, to } = localDayRange(today, timezone);
  const monthAgo = new Date(from.getTime() - 30 * 864e5);

  const [todaySummary, appointments, topServices, activeSubscriptions, retention, unreadMessages] =
    await Promise.all([
      getPeriodSummary({ from, to }),
      prisma.appointment.findMany({
        where: { startsAt: { gte: from, lt: to } },
        orderBy: { startsAt: "asc" },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, phone: true } },
          usage: { select: { state: true } },
        },
      }),
      getRevenueByService({ from: monthAgo, to }),
      prisma.subscription.findMany({
        where: { status: "ACTIVE" },
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          usages: { select: { state: true } },
        },
        orderBy: { expiresAt: "asc" },
      }),
      getRetentionStats(),
      prisma.message.count({ where: { senderRole: "CLIENT", readAt: null } }),
    ]);

  return {
    todaySummary,
    appointments,
    topServices: topServices.slice(0, 5),
    activeSubscriptions: activeSubscriptions.map((subscription) => ({
      ...subscription,
      available:
        subscription.sessionsTotal -
        subscription.usages.filter((u) => u.state !== "REVERTED").length,
    })),
    retention,
    unreadMessages,
  };
}
