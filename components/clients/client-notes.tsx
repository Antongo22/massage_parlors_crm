"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Pin, Trash2 } from "lucide-react";
import {
  addClientNote,
  deleteClientNote,
  type ClientActionState,
} from "@/app/(admin)/clients/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_TYPE_LABELS } from "@/lib/domain/client";
import { cn } from "@/lib/utils";

type Note = {
  id: string;
  type: string;
  body: string;
  isPinned: boolean;
  createdAt: Date;
};

export function ClientNotes({ clientId, notes }: { clientId: string; notes: Note[] }) {
  const [state, action, pending] = useActionState<ClientActionState, FormData>(addClientNote, {});
  const [deleting, startDelete] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Заметки</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <form ref={formRef} action={action} className="space-y-2">
          <input type="hidden" name="clientId" value={clientId} />

          <select
            name="type"
            defaultValue="GENERAL"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            aria-label="Тип заметки"
          >
            {Object.entries(NOTE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <Textarea
            name="body"
            rows={3}
            placeholder="Не переносит эфирные масла; предпочитает среднее давление…"
            required
          />

          {state.error && (
            <p className="text-destructive text-xs" role="alert">
              {state.error}
            </p>
          )}

          <Button type="submit" size="sm" className="w-full" disabled={pending}>
            {pending ? "Сохранение…" : "Добавить заметку"}
          </Button>
        </form>

        {notes.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Заметок пока нет</p>
        ) : (
          <ul className="divide-border divide-y">
            {notes.map((note) => (
              <li key={note.id} className="group flex gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        note.type === "CONTRAINDICATION" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {NOTE_TYPE_LABELS[note.type]}
                    </span>
                    {note.isPinned && <Pin className="text-muted-foreground size-3" />}
                  </div>
                  <p className="mt-0.5 text-sm break-words">{note.body}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {note.createdAt.toLocaleDateString("ru-RU")}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={deleting}
                  aria-label="Удалить заметку"
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() =>
                    startDelete(() => {
                      void deleteClientNote(note.id, clientId);
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
