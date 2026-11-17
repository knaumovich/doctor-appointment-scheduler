import { consultationsService } from "./consultationsService";
import type { AvailabilityRule } from "./types";
import { useConsultationsDb } from "./useConsultationsDb";

export function useAvailabilityRules() {
  const { data, error } = useConsultationsDb();
  return {
    rules: data?.availabilityRules ?? [], error,
    addRule: (rule: AvailabilityRule) => consultationsService.addRule(rule),
    removeRule: (id: string, doctorId: string) => consultationsService.removeRule(id, doctorId),
    clearAll: (doctorId: string) => consultationsService.clearRules(doctorId),
  };
}
