"use client";

import { useActionState, useState } from "react";
import { saveClient, type ClientActionState } from "@/app/(admin)/clients/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOURCE_LABELS } from "@/lib/domain/client";

type ClientValues = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  phone: string;
  email: string | null;
  birthDate: Date | null;
  source: string | null;
};

export function ClientDialog({
  client,
  trigger,
}: {
  client?: ClientValues;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  // Диалог закрывается прямо в действии, а не эффектом на state.ok.
  // setState синхронно внутри эффекта вызывает лишний каскад рендеров,
  // и правило react-hooks/set-state-in-effect ругается справедливо:
  // закрытие — следствие успешного действия, а не синхронизация с внешним миром.
  const [state, action, pending] = useActionState<ClientActionState, FormData>(
    async (previous, formData) => {
      const result = await saveClient(previous, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />

      <DialogContent className="sm:max-w-lg">
        <form action={action}>
          <DialogHeader>
            <DialogTitle>{client ? "Изменить карточку" : "Новый клиент"}</DialogTitle>
            <DialogDescription>
              Учётная запись не нужна: карточку можно вести по телефону, а вход в кабинет
              привяжется к ней по email при первом входе клиента.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {state.error && (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            )}

            {client && <input type="hidden" name="id" value={client.id} />}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lastName">Фамилия</Label>
                <Input id="lastName" name="lastName" defaultValue={client?.lastName} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">Имя</Label>
                <Input id="firstName" name="firstName" defaultValue={client?.firstName} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName">Отчество</Label>
              <Input id="middleName" name="middleName" defaultValue={client?.middleName ?? ""} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+7 999 123-45-67"
                  defaultValue={client?.phone}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
                <p className="text-muted-foreground text-xs">
                  Нужен для напоминаний и входа в кабинет
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="birthDate">Дата рождения</Label>
                <Input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  defaultValue={client?.birthDate?.toISOString().slice(0, 10) ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Откуда узнал</Label>
                <select
                  id="source"
                  name="source"
                  defaultValue={client?.source ?? ""}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">Не указано</option>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
