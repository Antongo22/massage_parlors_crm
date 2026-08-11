"use client";

import { useActionState } from "react";
import { AlertCircle, LockKeyhole } from "lucide-react";
import {
  unlockSetup,
  type SetupUnlockState,
} from "@/app/setup/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetupPasswordGate() {
  const [state, action, pending] = useActionState<SetupUnlockState, FormData>(unlockSetup, {});

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-full">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </div>
          <CardTitle>Первоначальная настройка защищена</CardTitle>
          <CardDescription>
            Введите пароль установки, заданный владельцем в окружении сервера.
          </CardDescription>
        </CardHeader>

        <form action={action}>
          <CardContent className="space-y-4">
            {state.error && (
              <p
                className="text-destructive flex items-start gap-2 rounded-md border border-current/20 bg-current/5 p-3 text-sm"
                role="alert"
              >
                <AlertCircle className="mt-px size-4 shrink-0" />
                <span className="text-foreground">{state.error}</span>
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="setupPassword">Пароль установки</Label>
              <Input
                id="setupPassword"
                name="setupPassword"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
          </CardContent>

          <CardFooter className="mt-4 justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Проверяем…" : "Продолжить"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
