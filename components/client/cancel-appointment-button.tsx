"use client";

import { useActionState } from "react";
import { cancelOwnAppointment, type ClientBookingState } from "@/app/(client)/my/actions";
import { Button } from "@/components/ui/button";

export function CancelAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const [state, action, pending] = useActionState<ClientBookingState, FormData>(
    cancelOwnAppointment,
    {},
  );

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Отменяем…" : "Отменить"}
      </Button>
      {state.error && (
        <p className="text-destructive mt-1 max-w-48 text-xs" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
