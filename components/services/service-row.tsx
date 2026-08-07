"use client";

import { useTransition } from "react";
import { Pencil } from "lucide-react";
import { toggleServiceActive } from "@/app/(admin)/services/actions";
import { ServiceDialog } from "@/components/services/service-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration, formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type ServiceValues = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  isActive: boolean;
  categoryId: string;
};

export function ServiceRow({
  service,
  currency,
  categories,
}: {
  service: ServiceValues;
  currency: string;
  categories: Array<{ id: string; name: string }>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className={cn("flex items-start gap-3 py-3", !service.isActive && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{service.name}</span>
          {!service.isActive && (
            <Badge variant="secondary" className="text-xs">
              Снята с продажи
            </Badge>
          )}
        </div>
        {service.description && (
          <p className="text-muted-foreground mt-0.5 text-sm">{service.description}</p>
        )}
        <p className="text-muted-foreground mt-1 text-xs">
          {formatDuration(service.durationMinutes)} · {formatMoney(service.priceMinor, currency)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void toggleServiceActive(service.id, !service.isActive);
            })
          }
        >
          {service.isActive ? "Снять" : "Вернуть"}
        </Button>

        <ServiceDialog
          categories={categories}
          service={service}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Изменить ${service.name}`}>
              <Pencil className="size-4" />
            </Button>
          }
        />
      </div>
    </li>
  );
}
