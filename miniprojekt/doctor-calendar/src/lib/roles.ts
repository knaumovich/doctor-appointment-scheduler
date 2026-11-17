import type { UserRole } from "./types";

export const ROLE_ORDER: UserRole[] = ["GUEST", "PATIENT", "DOCTOR", "ADMIN"];

export const rolePermissions = {
  GUEST: {
    viewDoctorsList: true,
    viewSchedules: false,
    bookAppointments: false,
    editSchedule: false,
    comment: false,
    reply: false,
    deleteComment: false,
    manageUsers: false,
    registerDoctors: false,
  },
  PATIENT: {
    viewDoctorsList: true,
    viewSchedules: true,
    bookAppointments: true,
    editSchedule: false,
    comment: true,
    reply: false,
    deleteComment: false,
    manageUsers: false,
    registerDoctors: false,
  },
  DOCTOR: {
    viewDoctorsList: false,
    viewSchedules: true,
    bookAppointments: false,
    editSchedule: true,
    comment: false,
    reply: true,
    deleteComment: false,
    manageUsers: false,
    registerDoctors: false,
  },
  ADMIN: {
    viewDoctorsList: true,
    viewSchedules: false,
    bookAppointments: false,
    editSchedule: false,
    comment: false,
    reply: false,
    deleteComment: true,
    manageUsers: true,
    registerDoctors: true,
  },
} satisfies Record<UserRole, Record<string, boolean>>;

export function can(role: UserRole, permission: keyof typeof rolePermissions.GUEST) {
  return rolePermissions[role][permission];
}

export function isRoleAllowed(role: UserRole, allowed: UserRole[]) {
  return allowed.includes(role);
}
