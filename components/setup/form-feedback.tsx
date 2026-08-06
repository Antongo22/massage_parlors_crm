import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ActionState } from "@/app/setup/actions";

export function FieldError({ state, field }: { state: ActionState; field: string }) {
  const message = state.fieldErrors?.[field];

  if (!message) return null;

  return (
    <p className="text-destructive text-xs" role="alert">
      {message}
    </p>
  );
}

/** Ошибки и подтверждения уровня формы: сбой сохранения, результат отправки письма. */
export function FormAlert({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p
        className="text-destructive flex items-start gap-2 rounded-md border border-current/20 bg-current/5 p-3 text-sm"
        role="alert"
      >
        <AlertCircle className="mt-px size-4 shrink-0" />
        <span className="text-foreground">{state.error}</span>
      </p>
    );
  }

  if (state.notice) {
    return (
      <p className="text-primary flex items-start gap-2 rounded-md border border-current/20 bg-current/5 p-3 text-sm">
        <CheckCircle2 className="mt-px size-4 shrink-0" />
        <span className="text-foreground">{state.notice}</span>
      </p>
    );
  }

  return null;
}
