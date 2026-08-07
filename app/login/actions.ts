"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type LoginState = { error?: string };

/**
 * Запрос ссылки для входа.
 *
 * Ответ намеренно одинаков и для существующего адреса, и для несуществующего:
 * иначе форма входа превращается в способ проверить, обслуживается ли человек
 * в этом салоне. Клиентская база — персональные данные, и подтверждать
 * принадлежность к ней анонимному запросу нельзя.
 */
export async function requestLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());

  if (!parsed.success) {
    return { error: "Введите корректный адрес электронной почты" };
  }

  const email = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { isActive: true },
  });

  if (user?.isActive) {
    try {
      // redirect: false — переход выполняем сами, ниже и одинаково для всех
      // веток, чтобы ответ не выдавал наличие учётной записи.
      await signIn("nodemailer", { email, redirect: false });
    } catch {
      // Сбой SMTP — единственное, о чём говорим честно: иначе человек будет
      // бесконечно ждать письмо, которого не будет.
      return { error: "Не удалось отправить письмо. Проверьте настройки почты салона." };
    }
  }

  // redirect бросает управляющее исключение, поэтому вызывается вне try.
  redirect(`/login/check-email?email=${encodeURIComponent(email)}`);
}
