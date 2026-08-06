"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { postMessage, type ChatState } from "@/app/(admin)/chat/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  body: string;
  senderRole: "ADMIN" | "CLIENT";
  createdAt: string;
};

export function ChatThread({
  conversationId,
  initialMessages,
  viewerRole,
  emptyHint,
}: {
  conversationId: string;
  initialMessages: ChatMessage[];
  viewerRole: "ADMIN" | "CLIENT";
  emptyHint: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [state, action, pending] = useActionState<ChatState, FormData>(postMessage, {});
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Поток новых сообщений. since — момент последнего известного сообщения,
  // чтобы после переподключения не получить всю переписку заново.
  useEffect(() => {
    const since = messages.at(-1)?.createdAt;
    const url = `/api/chat/${conversationId}/stream?since=${since ? new Date(since).getTime() : Date.now()}`;
    const source = new EventSource(url);

    source.addEventListener("messages", (event) => {
      const incoming = JSON.parse((event as MessageEvent).data) as ChatMessage[];

      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        const fresh = incoming.filter((message) => !known.has(message.id));

        return fresh.length > 0 ? [...current, ...fresh] : current;
      });
    });

    return () => source.close();
    // Пересоздавать поток на каждое сообщение не нужно: since берётся
    // из состояния на момент подключения, дальше поток сам движется вперёд.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-1">
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{emptyHint}</p>
        ) : (
          messages.map((message) => {
            const own = message.senderRole === viewerRole;

            return (
              <div key={message.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2",
                    own
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm",
                  )}
                >
                  <p className="text-sm break-words whitespace-pre-wrap">{message.body}</p>
                  <p className={cn("mt-1 text-[11px]", own ? "opacity-70" : "text-muted-foreground")}>
                    {new Date(message.createdAt).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form ref={formRef} action={action} className="border-border mt-3 border-t pt-3">
        <input type="hidden" name="conversationId" value={conversationId} />

        {state.error && (
          <p className="text-destructive mb-2 text-sm" role="alert">
            {state.error}
          </p>
        )}

        <div className="flex gap-2">
          <Textarea
            name="body"
            rows={2}
            placeholder="Сообщение…"
            className="resize-none"
            required
            onKeyDown={(event) => {
              // Enter отправляет, Shift+Enter — перенос строки: привычка
              // из любого мессенджера.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" size="icon-lg" disabled={pending} aria-label="Отправить">
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
