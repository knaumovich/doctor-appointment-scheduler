import { consultationsService } from "./consultationsService";
import type { Absence } from "./types";
import { useConsultationsDb } from "./useConsultationsDb";

export function useAbsences() {
  const { data, error } = useConsultationsDb();
  return {
    absences: data?.absences ?? [], error,
    addAbsence: (absence: Absence) => consultationsService.addAbsence(absence),
    removeAbsence: (id: string, doctorId: string) => consultationsService.removeAbsence(id, doctorId),
  };
}
