"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  saveSettings,
  sendSettingsTestMail,
  type SettingsState,
} from "@/app/(admin)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrganizationSettings = {
  name: string;
  timezone: string;
  slotStepMinutes: number;
  bufferMinutes: number;
  minLeadTimeMinutes: number;
  cancellationWindowHours: number;
  reminderOffsetMinutes: number;
  chargeSubscriptionOnNoShow: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  mailFrom: string | null;
  hasStoredPassword: boolean;
};

export function SettingsForm({
  organization,
  fallbackMailMode,
}: {
  organization: OrganizationSettings;
  fallbackMailMode: "mailpit" | "environment" | null;
}) {
  const [useCustomSmtp, setUseCustomSmtp] = useState(
    Boolean(organization.smtpHost) || !fallbackMailMode,
  );
  const [saveState, saveAction, saving] = useActionState<SettingsState, FormData>(saveSettings, {});
  const [testState, testAction, testing] = useActionState<SettingsState, FormData>(
    sendSettingsTestMail,
    {},
  );

  const feedback = saveState.error || saveState.notice ? saveState : testState;

  return (
    <form className="space-y-6">
      {(feedback.error || feedback.notice) && (
        <p
          className={
            feedback.error
              ? "text-destructive flex items-start gap-2 rounded-md border border-current/20 bg-current/5 p-3 text-sm"
              : "text-primary flex items-start gap-2 rounded-md border border-current/20 bg-current/5 p-3 text-sm"
          }
          role={feedback.error ? "alert" : undefined}
        >
          {feedback.error ? (
            <AlertCircle className="mt-px size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-px size-4 shrink-0" />
          )}
          <span className="text-foreground">{feedback.error ?? feedback.notice}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Салон</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" name="name" defaultValue={organization.name} required />
          </div>
          <p className="text-muted-foreground text-xs">
            Часовой пояс: {organization.timezone}. Смена пояса меняет трактовку всего расписания,
            поэтому делается через миграцию данных, а не переключателем.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Правила записи</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField
              name="slotStepMinutes"
              label="Шаг сетки, мин"
              defaultValue={organization.slotStepMinutes}
            />
            <NumberField
              name="bufferMinutes"
              label="Перерыв после сеанса, мин"
              defaultValue={organization.bufferMinutes}
              hint="Учитывается и в подборе слотов, и в защите от двойной брони"
            />
            <NumberField
              name="minLeadTimeMinutes"
              label="Мин. запас до сеанса, мин"
              defaultValue={organization.minLeadTimeMinutes}
              hint="Для самозаписи клиента; администратора не ограничивает"
            />
            <NumberField
              name="cancellationWindowHours"
              label="Окно отмены, ч"
              defaultValue={organization.cancellationWindowHours}
            />
            <NumberField
              name="reminderOffsetMinutes"
              label="Напоминание за, мин"
              defaultValue={organization.reminderOffsetMinutes}
              hint="Применяется к новым записям"
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="chargeSubscriptionOnNoShow"
              defaultChecked={organization.chargeSubscriptionOnNoShow}
              className="border-input accent-primary mt-0.5 size-4 rounded"
            />
            <span>
              Списывать сеанс абонемента при неявке
              <span className="text-muted-foreground block text-xs">
                Слот был занят и потерян для салона
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Почта</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="mailMode"
                value="mailpit"
                checked={!useCustomSmtp}
                onChange={() => setUseCustomSmtp(false)}
                disabled={!fallbackMailMode}
                className="accent-primary mt-0.5 size-4"
              />
              <span>
                {fallbackMailMode === "mailpit"
                  ? "Тестовый режим — Mailpit"
                  : "SMTP из окружения"}
                <span className="text-muted-foreground block text-xs">
                  {fallbackMailMode === "mailpit"
                    ? "Все письма перехватываются внутри сервера и не доходят до клиентов."
                    : fallbackMailMode === "environment"
                      ? "Используются почтовые переменные окружения сервера."
                      : "Резервный транспорт в окружении не настроен."}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="mailMode"
                value="smtp"
                checked={useCustomSmtp}
                onChange={() => setUseCustomSmtp(true)}
                className="accent-primary mt-0.5 size-4"
              />
              <span>
                Реальный SMTP
                <span className="text-muted-foreground block text-xs">
                  Письма доставляются клиентам, пароль хранится в зашифрованном виде.
                </span>
              </span>
            </label>
          </div>

          {useCustomSmtp && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="smtpHost">Сервер</Label>
                <Input id="smtpHost" name="smtpHost" defaultValue={organization.smtpHost ?? ""} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPort">Порт</Label>
                <Input
                  id="smtpPort"
                  name="smtpPort"
                  type="number"
                  defaultValue={organization.smtpPort ?? ""}
                />
              </div>

              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="smtpSecure"
                    defaultChecked={organization.smtpSecure}
                    className="border-input accent-primary size-4 rounded"
                  />
                  SSL/TLS
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpUser">Логин</Label>
                <Input id="smtpUser" name="smtpUser" defaultValue={organization.smtpUser ?? ""} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPassword">Пароль</Label>
                <Input
                  id="smtpPassword"
                  name="smtpPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={organization.hasStoredPassword ? "сохранён — оставьте пустым" : ""}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mailFrom">Адрес отправителя</Label>
                <Input id="mailFrom" name="mailFrom" defaultValue={organization.mailFrom ?? ""} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="testEmail">Проверить отправку</Label>
              <Input id="testEmail" name="testEmail" type="email" placeholder="ваш адрес" />
            </div>
            <Button type="submit" variant="outline" formAction={testAction} disabled={testing}>
              {testing ? "Отправка…" : "Отправить тестовое"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {useCustomSmtp
              ? "Тест должен прийти на указанный адрес."
              : "Письмо будет видно только в Mailpit; на указанный адрес оно не придёт."}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" formAction={saveAction} disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить настройки"}
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: number;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" min={0} defaultValue={defaultValue} required />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
