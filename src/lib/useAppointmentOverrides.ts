import type { Appointment } from "./types";
import { consultationsService } from "./consultationsService";
import { useConsultationsDb } from "./useConsultationsDb";

export function useAppointmentOverrides(currentUserId?: string | null) {
  const { data, error } = useConsultationsDb();
  const overrides = data?.appointmentsOverrides ?? [];
  const booked = data?.bookedAppointments ?? [];
  const bookedMine = booked.filter(a => a.patientUserId === currentUserId);
  const applyOverridesOnly = (list: Appointment[]) => list.map(a => {
    const override = overrides.find(o => o.id === a.id);
    return override ? { ...a, status: override.status, cancelReason: override.cancelReason } : a;
  });
  return {
    error, overrides, booked, bookedMine,
    notifications: data?.notifications ?? [],
    applyOverrides: (base: Appointment[]) => applyOverridesOnly(
      Array.from(new Map([...(data?.appointments ?? base), ...booked].map(a => [a.id, a])).values()),
    ),
    getBookedResolved: () => applyOverridesOnly(bookedMine),
    addBookedAppointment: (appointment: Appointment) => consultationsService.addBookedAppointment(appointment),
    cancelBookedAppointment: (id: string, reason: string) => consultationsService.cancelBookedAppointment(id, reason),
    removeBookedAppointment: (id: string) => consultationsService.cancelBookedAppointment(id, "Removed from cart"),
    markAppointmentsPaid: (ids: string[]) => consultationsService.markAppointmentsPaid(ids),
  };
}
