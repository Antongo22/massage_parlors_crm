"use client";

import { useActionState, useState } from "react";
import { sendTestEmail, submitStep3, type ActionState } from "@/app/setup/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FieldError, FormAlert } from "@/components/setup/form-feedback";

export function StepMail({
  adminEmail,
  catalogIsEmpty,
  fallbackMailMode,
}: {
  adminEmail: string | null;
  catalogIsEmpty: boolean;
  fallbackMailMode: "mailpit" | "environment" | null;
}) {
  const [useCustomSmtp, setUseCustomSmtp] = useState(!fallbackMailMode);

  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(submitStep3, {});
  const [testState, testAction, testing] = useActionState<ActionState, FormData>(sendTestEmail, {});

  // Обе кнопки живут в одной форме, чтобы тестовое письмо уходило теми
  // настройками, которые сейчас введены, а не сохранёнными ранее.
  return (
    <form>
      <Card>
        <CardContent className="space-y-6">
          <FormAlert state={saveState.error ? saveState : testState} />

          <div className="space-y-3">
            <Label>Как отправлять письма</Label>

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
                  ? "Тестовый режим — перехватывать письма в Mailpit"
                  : "Использовать SMTP из окружения"}
                <span className="text-muted-foreground block text-xs">
                  {fallbackMailMode === "mailpit"
                    ? "Письма не доставляются клиентам, а сохраняются в закрытом тестовом ящике. Переключиться на реальный SMTP можно в любой момент."
                    : fallbackMailMode === "environment"
                      ? "Используются SMTP_HOST и остальные почтовые переменные окружения."
                      : "Недоступно: резервный почтовый транспорт не настроен."}
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
                Указать свой SMTP
                <span className="text-muted-foreground block text-xs">
                  Настройки сохранятся в базе, пароль — в зашифрованном виде. Менять их
                  потом можно здесь же, без доступа к серверу.
                </span>
              </span>
            </label>
          </div>

          {useCustomSmtp && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="smtpHost">Сервер</Label>
                <Input id="smtpHost" name="smtpHost" placeholder="smtp.yandex.ru" />
                <FieldError state={saveState} field="smtpHost" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPort">Порт</Label>
                <Input id="smtpPort" name="smtpPort" type="number" defaultValue={465} />
                <FieldError state={saveState} field="smtpPort" />
              </div>

              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="smtpSecure"
                    defaultChecked
                    className="border-input accent-primary size-4 rounded"
                  />
                  SSL/TLS
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpUser">Логин</Label>
                <Input id="smtpUser" name="smtpUser" autoComplete="off" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPassword">Пароль</Label>
                <Input
                  id="smtpPassword"
                  name="smtpPassword"
                  type="password"
                  autoComplete="new-password"
                />
                <p className="text-muted-foreground text-xs">
                  Для Яндекса и Mail.ru нужен пароль приложения, а не основной.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mailFrom">Адрес отправителя</Label>
                <Input
                  id="mailFrom"
                  name="mailFrom"
                  placeholder="Массажный салон &lt;noreply@example.com&gt;"
                />
                <p className="text-muted-foreground text-xs">
                  Домен должен совпадать с тем, для которого настроены SPF и DKIM, иначе
                  напоминания уйдут в спам.
                </p>
                <FieldError state={saveState} field="mailFrom" />
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="testEmail">Проверить отправку</Label>
            <div className="flex gap-2">
              <Input
                id="testEmail"
                name="testEmail"
                type="email"
                defaultValue={adminEmail ?? ""}
                placeholder="anna@example.com"
              />
              <Button type="submit" variant="outline" formAction={testAction} disabled={testing}>
                {testing ? "Отправка…" : "Отправить письмо"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {useCustomSmtp
                ? "Проверьте почту до завершения настройки: иначе нерабочий SMTP обнаружится на первом напоминании клиенту."
                : "В тестовом режиме письмо появится в Mailpit и не будет доставлено на указанный адрес."}
            </p>
            <FieldError state={testState} field="testEmail" />
          </div>

          {catalogIsEmpty && (
            <>
              <Separator />
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="seedDemoData"
                  defaultChecked
                  className="border-input accent-primary mt-0.5 size-4 rounded"
                />
                <span>
                  Заполнить каталог демонстрационными услугами
                  <span className="text-muted-foreground block text-xs">
                    Три категории, шесть услуг и три абонемента с типичными ценами. Всё можно
                    отредактировать или удалить.
                  </span>
                </span>
              </label>
            </>
          )}
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit" formAction={saveAction} disabled={saving}>
            {saving ? "Завершение…" : "Завершить настройку"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
