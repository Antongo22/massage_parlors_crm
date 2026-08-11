import { Check } from "lucide-react";
import { SETUP_STEPS, type SetupStep } from "@/lib/domain/setup";
import { cn } from "@/lib/utils";

const STEP_TITLES: Record<SetupStep, string> = {
  1: "Салон",
  2: "Расписание",
  3: "Почта",
};

export function WizardShell({
  step,
  title,
  description,
  children,
}: {
  step: SetupStep;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <header className="mb-8">
        <p className="text-muted-foreground text-sm font-medium">Первичная настройка</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </header>

      <ol className="mb-8 flex items-center gap-2" aria-label="Шаги настройки">
        {([1, 2, 3] as const).map((current) => {
          const done = current < step;
          const active = current === step;

          return (
            <li key={current} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  done && "bg-primary border-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-4" /> : current}
              </span>
              <span
                className={cn(
                  "truncate text-sm",
                  active ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {STEP_TITLES[current]}
              </span>
              {current < SETUP_STEPS && <span className="bg-border h-px flex-1" />}
            </li>
          );
        })}
      </ol>

      {children}
    </div>
  );
}
