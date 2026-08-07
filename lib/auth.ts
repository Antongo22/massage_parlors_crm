import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { prisma } from "@/lib/db";
import { createTransport, resolveMailSettings } from "@/lib/mail";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

/**
 * Вход только по magic link: паролей в системе нет вообще.
 *
 * Для салона это осознанный выбор, а не упрощение. Пароль, который клиент
 * заводит ради двух визитов в год, он гарантированно забудет — и восстановление
 * пароля всё равно сведётся к письму на почту. Убрав пароль, мы убираем
 * и его хранение, и утечку, и форму восстановления.
 *
 * Сессии — в базе, а не в JWT. Роль и признак блокировки проверяются на каждом
 * запросе: заблокированный администратор должен терять доступ немедленно,
 * а не когда истечёт срок его токена.
 */
/**
 * Адаптер, устойчивый к исчезнувшей сессии.
 *
 * Сценарий из жизни: разработчик выполняет `npm run db:seed`, тот очищает
 * базу, а в браузере остаётся cookie от удалённой сессии. Auth.js при
 * следующем входе пытается удалить старую строку, Prisma отвечает
 * «record not found», и человек не может войти вообще никак, пока не
 * почистит cookie вручную — при том что ошибка ни на что не указывает.
 *
 * Удаление того, чего нет, — это успех, а не ошибка.
 */
function resilientAdapter() {
  const adapter = PrismaAdapter(prisma);
  const ignoreMissing = async <T>(operation: Promise<T>): Promise<T | null> => {
    try {
      return await operation;
    } catch (error) {
      const code = (error as { code?: string }).code;

      if (code === "P2025") return null;
      throw error;
    }
  };

  return {
    ...adapter,
    // Возвращаем void: Auth.js результат удаления не использует, а сузить
    // тип проще, чем городить объединение с null в сигнатуре адаптера.
    deleteSession: async (sessionToken: string): Promise<void> => {
      await ignoreMissing(Promise.resolve(adapter.deleteSession!(sessionToken)));
    },
    updateSession: async (
      session: Parameters<NonNullable<typeof adapter.updateSession>>[0],
    ): Promise<null> => {
      await ignoreMissing(Promise.resolve(adapter.updateSession!(session)));
      return null;
    },
  } satisfies typeof adapter;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: resilientAdapter(),
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  providers: [
    Nodemailer({
      // Настройки читаются в момент отправки, а не при старте процесса:
      // на первом запуске почта ещё не настроена, а после wizard приложение
      // не должно требовать перезапуска, чтобы их подхватить.
      async sendVerificationRequest({ identifier, url }) {
        const settings = await resolveMailSettings();

        if (!settings) {
          throw new Error("Почта не настроена: письмо со ссылкой для входа отправить нечем");
        }

        await createTransport(settings).sendMail({
          from: settings.from,
          to: identifier,
          subject: "Вход в CRM массажного салона",
          text: `Ссылка для входа (действует 24 часа):\n\n${url}\n\nЕсли вы не запрашивали вход, письмо можно проигнорировать.`,
          html: loginEmailHtml(url),
        });
      },
      // Значения-заглушки: транспорт всё равно создаётся в sendVerificationRequest,
      // но провайдер не инициализируется без них.
      server: { host: "unused", port: 0 },
      from: "unused@localhost",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      // Заблокированный пользователь не должен войти даже по валидной ссылке
      // из письма, отправленного до блокировки.
      const existing = await prisma.user.findUnique({
        where: { email: user.email },
        select: { isActive: true },
      });

      return existing ? existing.isActive : true;
    },
    async session({ session, user }) {
      const full = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });

      session.user.id = user.id;
      session.user.role = full?.role ?? "CLIENT";

      return session;
    },
  },
});

function loginEmailHtml(url: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px">Вход в CRM</h1>
      <p style="color:#444;line-height:1.5;margin:0 0 24px">
        Нажмите кнопку, чтобы войти. Ссылка действует 24 часа.
      </p>
      <a href="${url}"
         style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;
                padding:12px 20px;border-radius:8px;font-weight:500">
        Войти
      </a>
      <p style="color:#888;font-size:13px;line-height:1.5;margin:24px 0 0">
        Если вы не запрашивали вход, письмо можно проигнорировать.
      </p>
    </div>
  `;
}
