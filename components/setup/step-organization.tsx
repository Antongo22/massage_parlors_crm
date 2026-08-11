"use client";

import { useActionState } from "react";
import { submitStep1, type ActionState } from "@/app/setup/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormAlert } from "@/components/setup/form-feedback";

// Короткий список вместо всех зон IANA: салон работает в одном городе,
// а полтысячи вариантов в выпадающем списке — это не выбор, а поиск.
const TIMEZONES = [
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow", label: "Москва, Санкт-Петербург (UTC+3)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Almaty", label: "Алматы (UTC+5)" },
  { value: "Asia/Tbilisi", label: "Тбилиси (UTC+4)" },
];

export function StepOrganization({
  organizationName,
  timezone,
  adminName,
  adminEmail,
}: {
  organizationName: string | null;
  timezone: string;
  adminName: string | null;
  adminEmail: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitStep1, {});

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-5">
          <FormAlert state={state} />

          <div className="space-y-2">
            <Label htmlFor="organizationName">Название салона</Label>
            <Input
              id="organizationName"
              name="organizationName"
              placeholder="Массажный кабинет «Тишина»"
              defaultValue={organizationName ?? ""}
              autoFocus
              required
            />
            <FieldError state={state} field="organizationName" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Часовой пояс</Label>
            {/* Нативный select, а не компонент на Radix: он работает в форме
                без скрытого поля и без клиентского состояния. */}
            <select
              id="timezone"
              name="timezone"
              defaultValue={timezone}
              className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              required
            >
              {TIMEZONES.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              По нему считается расписание и время в письмах клиентам. В базе всё хранится в UTC.
            </p>
            <FieldError state={state} field="timezone" />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adminName">Имя администратора</Label>
              <Input
                id="adminName"
                name="adminName"
                defaultValue={adminName ?? ""}
                placeholder="Анна Смирнова"
                required
              />
              <FieldError state={state} field="adminName" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminEmail">Email администратора</Label>
              <Input
                id="adminEmail"
                name="adminEmail"
                type="email"
                defaultValue={adminEmail ?? ""}
                placeholder="anna@example.com"
                required
              />
              <FieldError state={state} field="adminEmail" />
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Пароля не будет: вход в систему по ссылке из письма. Это и есть учётная запись
            с полным доступом.
          </p>
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : "Далее"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
