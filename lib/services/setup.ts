import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { getOrganization } from "@/lib/services/organization";

/**
 * Первичная настройка салона.
 *
 * Шагов три, и текущий НЕ хранится отдельным полем — он выводится из данных:
 * есть организация → первый шаг пройден, есть мастер с графиком → второй.
 * Отдельный счётчик шагов пришлось бы синхронизировать с реальным состоянием
 * и чинить, когда они разойдутся (прерванная настройка, откат, ручная правка).
 */

export const SETUP_STEPS = 3;

export type SetupStep = 1 | 2 | 3;

export type SetupState = {
  step: SetupStep;
  completed: boolean;
  organizationName: string | null;
  adminName: string | null;
  adminEmail: string | null;
  masterName: string | null;
};

export async function getSetupState(): Promise<SetupState> {
  const organization = await getOrganization();

  if (!organization) {
    return {
      step: 1,
      completed: false,
      organizationName: null,
      adminName: null,
      adminEmail: null,
      masterName: null,
    };
  }

  const [admin, master] = await Promise.all([
    prisma.user.findFirst({ where: { role: "ADMIN" }, select: { name: true, email: true } }),
    prisma.master.findFirst({
      where: { workingHours: { some: {} } },
      select: { displayName: true },
    }),
  ]);

  return {
    step: master ? 3 : 2,
    completed: organization.setupCompletedAt != null,
    organizationName: organization.name,
    adminName: admin?.name ?? null,
    adminEmail: admin?.email ?? null,
    masterName: master?.displayName ?? null,
  };
}

// --- шаг 1: салон и администратор -------------------------------------------

export const step1Schema = z.object({
  organizationName: z.string().trim().min(2, "Укажите название салона").max(120),
  timezone: z.string().trim().min(1, "Выберите часовой пояс"),
  adminName: z.string().trim().min(2, "Укажите имя администратора").max(120),
  adminEmail: z.email("Некорректный адрес").transform((value) => value.trim().toLowerCase()),
});

export type Step1Input = z.infer<typeof step1Schema>;

export async function saveStep1(input: Step1Input) {
  // Транзакция: салон без администратора — состояние, из которого нельзя
  // ни войти, ни продолжить настройку.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.organization.findFirst({ select: { id: true } });

    if (existing) {
      await tx.organization.update({
        where: { id: existing.id },
        data: { name: input.organizationName, timezone: input.timezone },
      });
    } else {
      await tx.organization.create({
        data: { name: input.organizationName, timezone: input.timezone },
      });
    }

    // Email нормализован схемой: уникальный индекс построен по lower(btrim()),
    // и запись с другим регистром упала бы на нём, а не создала второго админа.
    await tx.user.upsert({
      where: { email: input.adminEmail },
      create: { email: input.adminEmail, name: input.adminName, role: "ADMIN" },
      update: { name: input.adminName, role: "ADMIN" },
    });
  });
}

// --- шаг 2: мастер, график и политики ----------------------------------------

const workingDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

export const step2Schema = z
  .object({
    masterName: z.string().trim().min(2, "Укажите имя мастера").max(120),
    specialization: z.string().trim().max(120).optional(),
    days: z.array(workingDaySchema).length(7),
    slotStepMinutes: z.number().int().min(5).max(120),
    bufferMinutes: z.number().int().min(0).max(120),
    minLeadTimeMinutes: z.number().int().min(0).max(10080),
    cancellationWindowHours: z.number().int().min(0).max(168),
    reminderOffsetMinutes: z.number().int().min(5).max(10080),
    chargeSubscriptionOnNoShow: z.boolean(),
  })
  .refine((data) => data.days.some((day) => day.enabled), {
    message: "Отметьте хотя бы один рабочий день",
    path: ["days"],
  })
  .refine((data) => data.days.every((day) => !day.enabled || day.endMinute > day.startMinute), {
    message: "Время окончания должно быть позже начала",
    path: ["days"],
  });

export type Step2Input = z.infer<typeof step2Schema>;

export async function saveStep2(input: Step2Input) {
  const organization = await prisma.organization.findFirst({ select: { id: true } });

  if (!organization) {
    throw new Error("Сначала нужно пройти первый шаг настройки");
  }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organization.id },
      data: {
        slotStepMinutes: input.slotStepMinutes,
        bufferMinutes: input.bufferMinutes,
        minLeadTimeMinutes: input.minLeadTimeMinutes,
        cancellationWindowHours: input.cancellationWindowHours,
        reminderOffsetMinutes: input.reminderOffsetMinutes,
        chargeSubscriptionOnNoShow: input.chargeSubscriptionOnNoShow,
      },
    });

    const admin = await tx.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    const existingMaster = await tx.master.findFirst({ select: { id: true } });

    const master = existingMaster
      ? await tx.master.update({
          where: { id: existingMaster.id },
          data: { displayName: input.masterName, specialization: input.specialization || null },
        })
      : await tx.master.create({
          data: {
            displayName: input.masterName,
            specialization: input.specialization || null,
            userId: admin?.id ?? null,
          },
        });

    // График переписывается целиком: строки WorkingHours неизменяемы,
    // а частичное обновление легко оставило бы смену от предыдущей версии
    // и упёрлось бы в workinghours_no_overlap.
    await tx.workingHours.deleteMany({ where: { masterId: master.id } });

    await tx.workingHours.createMany({
      data: input.days
        .filter((day) => day.enabled)
        .map((day) => ({
          masterId: master.id,
          weekday: day.weekday,
          startMinute: day.startMinute,
          endMinute: day.endMinute,
        })),
    });
  });
}

// --- шаг 3: почта и завершение ------------------------------------------------

export const step3Schema = z
  .object({
    smtpHost: z.string().trim().max(255).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpUser: z.string().trim().max(255).optional(),
    smtpPassword: z.string().max(255).optional(),
    smtpSecure: z.boolean(),
    mailFrom: z.string().trim().max(255).optional(),
    seedDemoData: z.boolean(),
  })
  .refine((data) => !data.smtpHost || (data.smtpPort != null && !!data.mailFrom), {
    message: "Для своего SMTP нужны и порт, и адрес отправителя",
    path: ["smtpHost"],
  });

export type Step3Input = z.infer<typeof step3Schema>;

export async function saveStep3(input: Step3Input) {
  const organization = await prisma.organization.findFirst({ select: { id: true } });

  if (!organization) {
    throw new Error("Сначала нужно пройти первый шаг настройки");
  }

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      smtpHost: input.smtpHost || null,
      smtpPort: input.smtpHost ? (input.smtpPort ?? null) : null,
      smtpUser: input.smtpHost ? input.smtpUser || null : null,
      // Пустое поле пароля означает «не менять»: форма не показывает
      // сохранённый пароль, и затирать его при правке хоста нельзя.
      smtpPassword: input.smtpPassword ? encryptSecret(input.smtpPassword) : undefined,
      smtpSecure: input.smtpSecure,
      mailFrom: input.smtpHost ? input.mailFrom || null : null,
      setupCompletedAt: new Date(),
    },
  });
}
