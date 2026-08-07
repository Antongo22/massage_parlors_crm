import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { OrganizationModel } from "@/generated/prisma/models";

/**
 * Конфигурация салона. Строка единственная (organization_singleton), но её
 * может не быть вовсе: база после миграций пуста до завершения wizard.
 * Поэтому весь код обязан уметь работать со значением null, а не считать
 * настройки данностью.
 *
 * cache() из React дедуплицирует запрос в пределах одного рендера: настройки
 * нужны почти каждому серверному компоненту, и без этого один запрос страницы
 * приводил бы к десятку одинаковых SELECT.
 */
export const getOrganization = cache(async (): Promise<OrganizationModel | null> => {
  return prisma.organization.findFirst();
});

export async function isSetupCompleted(): Promise<boolean> {
  const organization = await getOrganization();
  return organization?.setupCompletedAt != null;
}

/**
 * Настройки для кода, который без них работать не может (движок слотов,
 * планировщик напоминаний). Явная ошибка лучше молчаливых значений
 * по умолчанию: расписание, посчитанное в чужой таймзоне, выглядит
 * правдоподобно и потому опаснее падения.
 */
export async function requireOrganization(): Promise<OrganizationModel> {
  const organization = await getOrganization();

  if (!organization) {
    throw new Error("Салон не настроен: пройдите первичную настройку на /setup");
  }

  return organization;
}
