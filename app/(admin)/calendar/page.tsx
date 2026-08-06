import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { AppointmentActions } from "@/components/calendar/appointment-actions";
import { BookingDialog } from "@/components/calendar/booking-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/domain/money";
import {
  formatLocalTime,
  shiftLocalDate,
  todayLocalDate,
  WEEKDAY_NAMES,
  weekdayOf,
} from "@/lib/domain/time";
import { getAppointmentsForDay } from "@/lib/services/appointments";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; clientId?: string }>;
}) {
  await requireAdmin();

  const organization = await requireOrganization();
  const params = await searchParams;
  const today = todayLocalDate(organization.timezone);
  const date = params.date ?? today;

  const [appointments, services, clients, masters] = await Promise.all([
    getAppointmentsForDay(date, organization.timezone),
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, durationMinutes: true, priceMinor: true },
    }),
    prisma.client.findMany({
      where: { archivedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, lastName: true, firstName: true, phone: true },
    }),
    prisma.master.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true },
    }),
  ]);

  const bookingProps = {
    services,
    clients: clients.map((client) => ({
      id: client.id,
      label: `${client.lastName} ${client.firstName} · ${client.phone}`,
    })),
    masters,
    defaultDate: date,
    defaultClientId: params.clientId,
    timezone: organization.timezone,
    currency: organization.currency,
  };

  const weekday = WEEKDAY_NAMES[weekdayOf(date, organization.timezone)];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Календарь</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {weekday}, {new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            {date === today && " · сегодня"}
          </p>
        </div>

        <BookingDialog
          {...bookingProps}
          trigger={
            <Button>
              <CalendarPlus className="size-4" />
              Записать
            </Button>
          }
        />
      </header>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          render={<Link href={`/calendar?date=${shiftLocalDate(date, -1)}`} />}
          nativeButton={false}
          aria-label="Предыдущий день"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <Button variant="outline" size="sm" render={<Link href="/calendar" />} nativeButton={false}>
          Сегодня
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          render={<Link href={`/calendar?date=${shiftLocalDate(date, 1)}`} />}
          nativeButton={false}
          aria-label="Следующий день"
        >
          <ChevronRight className="size-4" />
        </Button>

        <div className="ml-2 flex gap-1 overflow-x-auto">
          {Array.from({ length: 7 }, (_, index) => shiftLocalDate(today, index)).map((day) => (
            <Button
              key={day}
              variant={day === date ? "default" : "ghost"}
              size="sm"
              render={<Link href={`/calendar?date=${day}`} />}
              nativeButton={false}
            >
              {new Date(day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
            </Button>
          ))}
        </div>
      </div>

      {appointments.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            На этот день записей нет
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {appointments.map((appointment) => (
                <li key={appointment.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="w-24 shrink-0">
                    <p className="font-medium tabular-nums">
                      {formatLocalTime(appointment.startsAt, organization.timezone)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      до {formatLocalTime(appointment.endsAt, organization.timezone)}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/clients/${appointment.clientId}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {appointment.client.lastName} {appointment.client.firstName}
                    </Link>
                    <p className="text-muted-foreground truncate text-sm">
                      {appointment.serviceNameSnapshot} · {appointment.master.displayName}
                    </p>
                    {appointment.internalNote && (
                      <p className="text-muted-foreground mt-0.5 truncate text-xs italic">
                        {appointment.internalNote}
                      </p>
                    )}
                  </div>

                  <span className="shrink-0 text-sm tabular-nums">
                    {appointment.usage
                      ? "абонемент"
                      : formatMoney(appointment.priceMinorSnapshot, organization.currency)}
                  </span>

                  <StatusBadge status={appointment.status} />

                  <AppointmentActions
                    appointmentId={appointment.id}
                    status={appointment.status}
                    priceMinor={appointment.priceMinorSnapshot}
                    paidBySubscription={Boolean(appointment.usage)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
