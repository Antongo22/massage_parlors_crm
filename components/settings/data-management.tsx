"use client";

import { useActionState, useState } from "react";
import { Database, RotateCcw, TriangleAlert } from "lucide-react";
import {
  applyDemoData,
  resetCrm,
  type DataManagementState,
} from "@/app/(admin)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { RESET_CONFIRMATION } from "@/lib/domain/data-management";

export function DataManagement() {
  const [demoState, demoAction, demoPending] = useActionState<DataManagementState, FormData>(
    applyDemoData,
    {},
  );
  const [resetState, resetAction, resetPending] = useActionState<DataManagementState, FormData>(
    resetCrm,
    {},
  );
  const [confirmation, setConfirmation] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Управление данными</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 font-medium">
              <Database className="text-primary size-4" />
              Тестовые данные
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Добавит недостающих клиентов, услуги, 30 записей, 5 абонементов,
              платежи и переписки. Настройки салона и существующие данные не удаляются;
              повторный запуск не создаёт дубли.
            </p>
          </div>

          <form action={demoAction} className="shrink-0">
            <Button type="submit" variant="outline" disabled={demoPending || resetPending}>
              <Database className="size-4" />
              {demoPending ? "Добавляем…" : "Применить тестовые данные"}
            </Button>
          </form>
        </section>

        {demoState.error && (
          <p className="text-destructive text-sm" role="alert">
            {demoState.error}
          </p>
        )}
        {demoState.notice && (
          <p className="text-primary text-sm" role="status">
            {demoState.notice}
          </p>
        )}

        <Separator />

        <section className="border-destructive/30 bg-destructive/5 rounded-lg border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <div className="text-destructive flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4" />
                Полный сброс CRM
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Удалит организацию, пользователей, клиентов, записи, платежи, чат и
                настройки почты. После сброса откроется wizard первоначальной настройки.
                Отменить операцию невозможно.
              </p>
            </div>

            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant="destructive"
                    className="shrink-0"
                    disabled={demoPending || resetPending}
                  >
                    <RotateCcw className="size-4" />
                    Сбросить и настроить заново
                  </Button>
                }
              />

              <DialogContent showCloseButton={!resetPending}>
                <form action={resetAction}>
                  <DialogHeader>
                    <DialogTitle>Удалить все данные CRM?</DialogTitle>
                    <DialogDescription>
                      Резервная копия автоматически не создаётся. Для подтверждения введите
                      фразу «{RESET_CONFIRMATION}».
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3 py-4">
                    {resetState.error && (
                      <p className="text-destructive text-sm" role="alert">
                        {resetState.error}
                      </p>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="reset-confirmation">Подтверждение</Label>
                      <Input
                        id="reset-confirmation"
                        name="confirmation"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        autoComplete="off"
                        disabled={resetPending}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="submit"
                      variant="destructive"
                      disabled={resetPending || confirmation.trim() !== RESET_CONFIRMATION}
                    >
                      <RotateCcw className="size-4" />
                      {resetPending ? "Удаляем…" : "Удалить всё"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
