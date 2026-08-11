"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { submitStep2, type ActionState } from "@/app/setup/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FieldError, FormAlert } from "@/components/setup/form-feedback";

// Порядок дней недели человеческий (с понедельника), но weekday хранится
// по соглашению SQL: 0 — воскресенье.
const WEEKDAYS = [
  { weekday: 1, label: "Понедельник", workingByDefault: true },
  { weekday: 2, label: "Вторник", workingByDefault: true },
  { weekday: 3, label: "Среда", workingByDefault: true },
  { weekday: 4, label: "Четверг", workingByDefault: true },
  { weekday: 5, label: "Пятница", workingByDefault: true },
  { weekday: 6, label: "Суббота", workingByDefault: false },
  { weekday: 0, label: "Воскресенье", workingByDefault: false },
];

export type ScheduleDefaults = {
  configured: boolean;
  masterName: string;
  specialization: string;
  workingHours: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  slotStepMinutes: number;
  bufferMinutes: number;
  minLeadTimeMinutes: number;
  cancellationWindowHours: number;
  reminderOffsetMinutes: number;
  chargeSubscriptionOnNoShow: boolean;
};

export function StepSchedule({ defaults }: { defaults: ScheduleDefaults }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitStep2, {});
  const hoursByWeekday = new Map(defaults.workingHours.map((hours) => [hours.weekday, hours]));

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-6">
          <FormAlert state={state} />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="masterName">Имя мастера</Label>
              <Input
                id="masterName"
                name="masterName"
                defaultValue={defaults.masterName}
                placeholder="Анна Смирнова"
                required
              />
              <FieldError state={state} field="masterName" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialization">Специализация</Label>
              <Input
                id="specialization"
                name="specialization"
                defaultValue={defaults.specialization}
                placeholder="Классический и спортивный массаж"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Рабочие часы</Label>
              <p className="text-muted-foreground mt-1 text-xs">
                Время локальное. Свободные слоты система считает сама — вычитая отпуска,
                занятость и перерыв между сеансами.
              </p>
            </div>

            <div className="space-y-2">
              {WEEKDAYS.map((day) => {
                const savedHours = hoursByWeekday.get(day.weekday);

                return (
                  <div key={day.weekday} className="flex items-center gap-3">
                    <label className="flex w-40 shrink-0 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`day-${day.weekday}-enabled`}
                        defaultChecked={
                          defaults.configured ? Boolean(savedHours) : day.workingByDefault
                        }
                        className="border-input accent-primary size-4 rounded"
                      />
                      {day.label}
                    </label>

                    <Input
                      type="time"
                      name={`day-${day.weekday}-start`}
                      defaultValue={formatMinute(savedHours?.startMinute ?? 600)}
                      step={900}
                      className="w-32"
                      aria-label={`${day.label}: начало`}
                    />
                    <span className="text-muted-foreground text-sm">—</span>
                    <Input
                      type="time"
                      name={`day-${day.weekday}-end`}
                      defaultValue={formatMinute(savedHours?.endMinute ?? 1200)}
                      step={900}
                      className="w-32"
                      aria-label={`${day.label}: окончание`}
                    />
                  </div>
                );
              })}
            </div>
            <FieldError state={state} field="days" />
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label>Правила записи</Label>
              <p className="text-muted-foreground mt-1 text-xs">
                Всё это можно изменить позже в настройках — перезапуск не потребуется.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="slotStepMinutes"
                label="Шаг сетки, мин"
                hint="С какой частотой предлагать время начала"
                defaultValue={defaults.slotStepMinutes}
                state={state}
              />
              <NumberField
                name="bufferMinutes"
                label="Перерыв после сеанса, мин"
                hint="Проветривание и уборка. Учитывается при поиске слотов"
                defaultValue={defaults.bufferMinutes}
                state={state}
              />
              <NumberField
                name="minLeadTimeMinutes"
                label="Мин. запас до сеанса, мин"
                hint="Насколько заранее клиент может записаться сам"
                defaultValue={defaults.minLeadTimeMinutes}
                state={state}
              />
              <NumberField
                name="cancellationWindowHours"
                label="Окно отмены, ч"
                hint="За сколько часов отмена считается своевременной"
                defaultValue={defaults.cancellationWindowHours}
                state={state}
              />
              <NumberField
                name="reminderOffsetMinutes"
                label="Напоминание за, мин"
                hint="За сколько до сеанса уходит письмо клиенту"
                defaultValue={defaults.reminderOffsetMinutes}
                state={state}
              />
            </div>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="chargeSubscriptionOnNoShow"
                defaultChecked={defaults.chargeSubscriptionOnNoShow}
                className="border-input accent-primary mt-0.5 size-4 rounded"
              />
              <span>
                Списывать сеанс абонемента при неявке
                <span className="text-muted-foreground block text-xs">
                  Слот был занят и потерян для салона. Снимите галочку, если для постоянных
                  клиентов принято прощать неявку.
                </span>
              </span>
            </label>
          </div>
        </CardContent>

        <CardFooter className="justify-between">
          <Button
            variant="outline"
            render={<Link href="/setup?step=1" />}
            nativeButton={false}
          >
            <ArrowLeft className="size-4" />
            Назад
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : "Далее"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function formatMinute(value: number): string {
  const hours = String(Math.floor(value / 60)).padStart(2, "0");
  const minutes = String(value % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function NumberField({
  name,
  label,
  hint,
  defaultValue,
  state,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
  state: ActionState;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" defaultValue={defaultValue} min={0} required />
      <p className="text-muted-foreground text-xs">{hint}</p>
      <FieldError state={state} field={name} />
    </div>
  );
}
