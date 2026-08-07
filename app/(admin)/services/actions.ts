"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

export type ServiceActionState = { error?: string; ok?: boolean };

const serviceSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Укажите название").max(160),
  categoryId: z.string().min(1),
  newCategoryName: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.number().int().min(5).max(600),
  priceMinor: z.number().int().min(0),
  isActive: z.boolean(),
});

export async function saveService(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireAdmin();

  const parsed = serviceSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    newCategoryName: formData.get("newCategoryName") || undefined,
    description: formData.get("description") || undefined,
    durationMinutes: Number(formData.get("durationMinutes")),
    priceMinor: Math.round(Number(formData.get("price")) * 100),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте заполнение формы" };
  }

  const input = parsed.data;

  try {
    const categoryId =
      input.categoryId === "__new__"
        ? await createCategory(input.newCategoryName ?? "")
        : input.categoryId;

    if (input.id) {
      await prisma.service.update({
        where: { id: input.id },
        data: {
          name: input.name,
          categoryId,
          description: input.description ?? null,
          durationMinutes: input.durationMinutes,
          priceMinor: input.priceMinor,
          isActive: input.isActive,
        },
      });
    } else {
      await prisma.service.create({
        data: {
          name: input.name,
          slug: await uniqueSlug(input.name),
          categoryId,
          description: input.description ?? null,
          durationMinutes: input.durationMinutes,
          priceMinor: input.priceMinor,
          isActive: input.isActive,
        },
      });
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось сохранить услугу" };
  }

  revalidatePath("/services");
  return { ok: true };
}

/**
 * Услуга не удаляется, а снимается с продажи: на неё ссылаются завершённые
 * визиты и финансовая история. Физическое удаление сломало бы отчёты
 * за прошлые периоды.
 */
export async function toggleServiceActive(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();

  await prisma.service.update({ where: { id }, data: { isActive } });
  revalidatePath("/services");
}

async function createCategory(name: string): Promise<string> {
  if (name.length < 2) {
    throw new Error("Укажите название новой категории");
  }

  const category = await prisma.serviceCategory.create({
    data: { name, slug: await uniqueSlug(name, "category"), sortOrder: 99 },
  });

  return category.id;
}

/**
 * Slug строится транслитерацией: латиница в URL читаемее процентного
 * кодирования кириллицы. Уникальность обеспечивается суффиксом, потому что
 * «Массаж спины» и «Массаж Спины» дают один и тот же slug.
 */
async function uniqueSlug(name: string, kind: "service" | "category" = "service"): Promise<string> {
  const base = transliterate(name) || kind;
  let candidate = base;
  let counter = 1;

  const exists = async (slug: string) =>
    kind === "service"
      ? (await prisma.service.count({ where: { slug } })) > 0
      : (await prisma.serviceCategory.count({ where: { slug } })) > 0;

  while (await exists(candidate)) {
    candidate = `${base}-${++counter}`;
  }

  return candidate;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
