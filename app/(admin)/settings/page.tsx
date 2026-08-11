import { SettingsForm } from "@/components/settings/settings-form";
import { DataManagement } from "@/components/settings/data-management";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { WEEKDAY_NAMES } from "@/lib/domain/time";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();

  const organization = await requireOrganization();
  const master = await prisma.master.findFirst({
    include: { workingHours: { orderBy: { weekday: "asc" } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Меняются на лету: перезапуск приложения не нужен.
        </p>
      </header>

      <SettingsForm
        fallbackMailMode={
          process.env.MAILPIT_SMTP_HOST
            ? "mailpit"
            : process.env.SMTP_HOST
              ? "environment"
              : null
        }
        organization={{
          name: organization.name,
          timezone: organization.timezone,
          slotStepMinutes: organization.slotStepMinutes,
          bufferMinutes: organization.bufferMinutes,
          minLeadTimeMinutes: organization.minLeadTimeMinutes,
          cancellationWindowHours: organization.cancellationWindowHours,
          reminderOffsetMinutes: organization.reminderOffsetMinutes,
          chargeSubscriptionOnNoShow: organization.chargeSubscriptionOnNoShow,
          smtpHost: organization.smtpHost,
          smtpPort: organization.smtpPort,
          smtpUser: organization.smtpUser,
          smtpSecure: organization.smtpSecure,
          mailFrom: organization.mailFrom,
          hasStoredPassword: Boolean(organization.smtpPassword),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>График работы</CardTitle>
        </CardHeader>
        <CardContent>
          {!master || master.workingHours.length === 0 ? (
            <p className="text-muted-foreground text-sm">График не задан</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {master.workingHours.map((interval) => (
                <li key={interval.id} className="flex gap-4">
                  <span className="w-32">{WEEKDAY_NAMES[interval.weekday]}</span>
                  <span className="tabular-nums">
                    {formatMinutes(interval.startMinute)} — {formatMinutes(interval.endMinute)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Буфер после сеанса ({organization.bufferMinutes} мин) вычитается из доступного
            времени автоматически и защищён ограничением базы от гонок при одновременной записи.
          </p>
        </CardContent>
      </Card>

      <DataManagement />
    </div>
  );
}

function formatMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
