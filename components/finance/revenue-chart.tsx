import { formatMoney, formatMoneyShort } from "@/lib/domain/money";
import type { Granularity, RevenuePoint } from "@/lib/services/analytics";

/**
 * График выручки — столбцы на CSS, без библиотеки.
 *
 * Recharts и подобные тянут за собой сотни килобайт и клиентский рантайм ради
 * одного графика на весь проект. Здесь достаточно серверного компонента:
 * данные не интерактивны, а подпись значения даёт title.
 */
export function RevenueChart({
  points,
  granularity,
  currency,
}: {
  points: RevenuePoint[];
  granularity: Granularity;
  currency: string;
}) {
  if (points.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        За выбранный период оплат не было
      </p>
    );
  }

  const max = Math.max(...points.map((point) => point.revenueMinor), 1);
  const total = points.reduce((sum, point) => sum + point.revenueMinor, 0);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Всего за период:{" "}
        <span className="text-foreground font-medium">{formatMoney(total, currency)}</span>
      </p>

      <div className="flex h-48 items-end gap-1 overflow-x-auto">
        {points.map((point) => {
          const height = Math.max(2, Math.round((point.revenueMinor / max) * 100));

          return (
            <div
              key={point.period}
              className="group flex min-w-6 flex-1 flex-col items-center gap-1"
              title={`${formatPeriod(point.period, granularity)}: ${formatMoney(point.revenueMinor, currency)}`}
            >
              <span className="text-muted-foreground text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                {formatMoneyShort(point.revenueMinor, currency)}
              </span>
              <div
                className="bg-primary/80 group-hover:bg-primary w-full rounded-t transition-colors"
                style={{ height: `${height}%` }}
              />
              <span className="text-muted-foreground truncate text-[10px] whitespace-nowrap">
                {formatPeriod(point.period, granularity)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatPeriod(iso: string, granularity: Granularity): string {
  const date = new Date(iso);

  if (granularity === "month") {
    return date.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
  }

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
