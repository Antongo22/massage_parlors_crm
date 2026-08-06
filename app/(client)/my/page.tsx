import { CalendarPlus } from "lucide-react";
import { ClientBookingDialog } from "@/components/client/client-booking-dialog";
import { CancelAppointmentButton } from "@/components/client/cancel-appointment-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireClientProfile } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { clientCanCancel } from "@/lib/domain/appointment";
import { formatMoney } from "@/lib/domain/money";
import { formatLocalDateTime, todayLocalDate } from "@/lib/domain/time";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function MyAppointmentsPage() {
  const { client } = await requireClientProfile();
  const organization = await requireOrganization();
  const now = new Date();

  const [appointments, services, masters] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: client.id },
      orderBy: { startsAt: "desc" },
      include: { usage: { select: { state: true } } },
    }),
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, durationMinutes: true, priceMinor: true, description: true },
    }),
    prisma.master.findMany({ where: { isActive: true }, select: { id: true, displayName: true } }),
  ]);

  const upcoming = appointments.filter(
    (appointment) =>
      appointment.startsAt >= now &&
      (appointment.status === "PENDING" || appointment.status === "CONFIRMED"),
  );
  const past = appointments.filter((appointment) => !upcoming.includes(appointment));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Мои записи</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {client.firstName}, здесь ваши визиты в «{organization.name}»
          </p>
        </div>

        <ClientBookingDialog
          services={services}
          masters={masters}
          defaultDate={todayLocalDate(organization.timezone)}
          timezone={organization.timezone}
          currency={organization.currency}
          minLeadTimeMinutes={organization.minLeadTimeMinutes}
          trigger={
            <Button>
              <CalendarPlus className="size-4" />
              Записаться
            </Button>
          }
        />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Предстоящие</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Записей нет. Выберите удобное время — свободные слоты видны сразу.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {upcoming.map((appointment) => (
                <li key={appointment.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{appointment.serviceNameSnapshot}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatLocalDateTime(appointment.startsAt, organization.timezone)}
                    </p>
                    {appointment.clientComment && (
                      <p className="text-muted-foreground mt-0.5 text-xs italic">
                        Ваш комментарий: {appointment.clientComment}
                      </p>
                    )}
                  </div>

                  <span className="shrink-0 text-sm tabular-nums">
                    {appointment.usage
                      ? "по абонементу"
                      : formatMoney(appointment.priceMinorSnapshot, organization.currency)}
                  </span>

                  <StatusBadge status={appointment.status} />

                  {clientCanCancel(
                    appointment.status,
                    appointment.startsAt,
                    organization.cancellationWindowHours,
                    now,
                  ) && <CancelAppointmentButton appointmentId={appointment.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История</CardTitle>
        </CardHeader>
        <CardContent>
          {past.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Пока пусто</p>
          ) : (
            <ul className="divide-border divide-y">
              {past.map((appointment) => (
                <li key={appointment.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {appointment.serviceNameSnapshot}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatLocalDateTime(appointment.startsAt, organization.timezone)}
                    </p>
                  </div>
                  <StatusBadge status={appointment.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
