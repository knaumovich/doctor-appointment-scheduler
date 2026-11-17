const messages: Record<string, string> = {
  time_zone_mismatch: "Your browser time zone differs from the clinic time zone. Use the clinic time zone to manage or book appointments.",
  appointment_conflict: "This time slot was just booked. Refresh the schedule and choose another time.",
  outside_availability: "This time is no longer available. Please choose another slot.",
  doctor_absent: "The doctor is unavailable on this date.",
  appointment_started: "An appointment cannot be canceled after it has started.",
  appointment_canceled: "This appointment has already been canceled.",
  absence_overlap: "These dates overlap an existing absence.",
  forbidden: "You do not have permission to perform this action.",
  schedule_not_initialized: "The schedule has not been set up yet. Please contact the administrator.",
  invalid_appointment_time: "Choose a future appointment in consecutive 30-minute slots.",
  invalid_patient_age: "Enter a whole-number age between 1 and 130.",
  invalid_schedule_input: "Please check the entered details and try again.",
};
export function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return messages[code] ?? "Unable to save changes. Check your connection and try again.";
}
