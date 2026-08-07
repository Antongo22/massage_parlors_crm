import { Badge } from "@/components/ui/badge";
import { STATUS_SHORT_LABELS } from "@/lib/domain/appointment";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/generated/prisma/enums";

// Цвет несёт смысл: зелёный — деньги получены, красный — слот потерян,
// серый — отменено заранее и слот можно было продать.
const STYLES: Record<AppointmentStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  CONFIRMED: "bg-primary/10 text-primary",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  NO_SHOW: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <Badge variant="secondary" className={cn("shrink-0 border-transparent", STYLES[status])}>
      {STATUS_SHORT_LABELS[status]}
    </Badge>
  );
}
