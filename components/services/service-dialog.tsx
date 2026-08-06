"use client";

import { useActionState, useState } from "react";
import { saveService, type ServiceActionState } from "@/app/(admin)/services/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { minorToInput } from "@/lib/domain/money";

type ServiceValues = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  isActive: boolean;
  categoryId: string;
};

export function ServiceDialog({
  categories,
  service,
  trigger,
}: {
  categories: Array<{ id: string; name: string }>;
  service?: ServiceValues;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(service?.categoryId ?? categories[0]?.id ?? "__new__");
  // Диалог закрывается прямо в действии, а не эффектом на state.ok.
  // setState синхронно внутри эффекта вызывает лишний каскад рендеров,
  // и правило react-hooks/set-state-in-effect ругается справедливо:
  // закрытие — следствие успешного действия, а не синхронизация с внешним миром.
  const [state, action, pending] = useActionState<ServiceActionState, FormData>(
    async (previous, formData) => {
      const result = await saveService(previous, formData);
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
            <DialogTitle>{service ? "Изменить услугу" : "Новая услуга"}</DialogTitle>
            <DialogDescription>
              Изменение цены не затрагивает уже созданные записи — в них сохранён снимок.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {state.error && (
              <p className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
            )}

            {service && <input type="hidden" name="id" value={service.id} />}

            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input id="name" name="name" defaultValue={service?.name} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoryId">Категория</Label>
              <select
                id="categoryId"
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value="__new__">+ Новая категория</option>
              </select>
            </div>

            {categoryId === "__new__" && (
              <div className="space-y-2">
                <Label htmlFor="newCategoryName">Название категории</Label>
                <Input id="newCategoryName" name="newCategoryName" required />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Длительность, мин</Label>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min={5}
                  step={5}
                  defaultValue={service?.durationMinutes ?? 60}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Цена, ₽</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={service ? minorToInput(service.priceMinor) : ""}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" name="description" rows={3} defaultValue={service?.description ?? ""} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={service?.isActive ?? true}
                className="border-input accent-primary size-4 rounded"
              />
              Доступна для записи
            </label>
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
