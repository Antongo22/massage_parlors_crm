import { requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Поток новых сообщений через SSE.
 *
 * Реализация — опрос базы раз в две секунды внутри соединения, а не LISTEN/NOTIFY
 * и не WebSocket. Причина: для чата двух сторон это даёт задержку, которую никто
 * не заметит, и не требует ни второго процесса, ни выделенного соединения
 * к Postgres на каждого читателя. Когда переписка станет нагруженной,
 * менять придётся только этот файл — клиент останется прежним.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await requireUser();
  const { conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, clientId: true },
  });

  if (!conversation) {
    return new Response("Not found", { status: 404 });
  }

  if (user.role === "CLIENT") {
    const client = await prisma.client.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!client || client.id !== conversation.clientId) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const url = new URL(request.url);
  let since = new Date(Number(url.searchParams.get("since")) || Date.now());

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        const messages = await prisma.message.findMany({
          where: { conversationId, createdAt: { gt: since } },
          orderBy: { createdAt: "asc" },
        });

        if (messages.length > 0) {
          since = messages.at(-1)!.createdAt;
          send("messages", messages);
        }
      };

      const interval = setInterval(() => {
        void poll().catch(() => clearInterval(interval));
      }, 2000);

      // Комментарий-пинг: прокси и браузеры закрывают простаивающее соединение,
      // а полезных сообщений может не быть часами.
      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        clearInterval(ping);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Отключает буферизацию в nginx: без этого сообщения копятся
      // в прокси и приходят пачками.
      "X-Accel-Buffering": "no",
    },
  });
}
