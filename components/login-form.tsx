"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { requestLoginLink, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLoginLink, {});
  const message = state.error ?? (error ? AUTH_ERRORS[error] ?? AUTH_ERRORS.Default : undefined);

  return (
    <form action={action} className="space-y-4">
      {message && (
        <p
          className="text-destructive flex items-start gap-2 rounded-md border border-current/20 bg-current/5 p-3 text-sm"
          role="alert"
        >
          <AlertCircle className="mt-px size-4 shrink-0" />
          <span className="text-foreground">{message}</span>
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="anna@example.com"
          autoComplete="email"
          autoFocus
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Отправляем…" : "Получить ссылку для входа"}
      </Button>
    </form>
  );
}

// Auth.js возвращает коды ошибок в query-параметре; показывать их клиенту как есть нельзя.
const AUTH_ERRORS: Record<string, string> = {
  Verification: "Ссылка устарела или уже использована. Запросите новую.",
  AccessDenied: "Доступ закрыт. Обратитесь к администратору салона.",
  EmailSignin: "Не удалось отправить письмо. Проверьте настройки почты.",
  Default: "Не получилось войти. Попробуйте ещё раз.",
};
