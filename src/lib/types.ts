export type ConsultType =
  | "FIRST_VISIT"
  | "FOLLOW_UP"
  | "CHRONIC"
  | "PRESCRIPTION"
  | "ONLINE"
  | "DOCUMENTS";

export type PatientGender = "F" | "M" | "OTHER";

export type Patient = {
  id: string;
  name: string;
  gender?: PatientGender;
  age?: number;
};

export type DoctorProfile = { id: string; name: string; specialization: string };

export type CalendarPayload = {
  doctors?: DoctorProfile[];
  doctor?: DoctorProfile;
  appointments: Appointment[];
};

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=ndz, 1=pon...

export type TimeRange = {
  startMin: number; // np. 8:00 -> 480
  endMin: number;   // np. 12:30 -> 750 (koniec nie wchodzi)
};

export type AvailabilityRule =
  | {
      id: string;
      doctorId: string;
      kind: "CYCLIC";
      fromDate: string; // "2025-02-01"
      toDate: string;   // "2025-03-12"
      daysMask: Weekday[];  // np. [1,2,4,6] pon,wt,czw,sob
      ranges: TimeRange[];  // np. [{8:00-12:30},{16:00-21:30}]
    }
  | {
      id: string;
      doctorId: string;
      kind: "ONE_TIME";
      date: string;     // "2025-02-10"
      ranges: TimeRange[];
    };

export type AppointmentStatus = "FREE" | "BOOKED" | "CANCELED";

export type Appointment = {
  __key?: string; // Firebase key for legacy records whose key differs from id
  id: string;
  doctorId: string;
  start: string;
  end: string;
  type: ConsultType;
  status: AppointmentStatus;
  patient?: Patient;
  patientUserId?: string;
  patientEmail?: string | null;
  notes?: string; // informacje dla lekarza
  documents?: string[];
  cancelReason?: string;
  paid?: boolean;
  paidAt?: string;

};

export type Absence = {
  id: string;
  doctorId: string;
  fromDate: string; // "YYYY-MM-DD"
  toDate: string;   // "YYYY-MM-DD"
  reason?: string;
};

export type PatientNotification = {
  id: string;
  patientId: string;
  createdAt: string; // ISO
  type: "APPOINTMENT_CANCELED";
  title: string;
  message: string;
  appointmentId: string;
};

export type UserRole = "GUEST" | "PATIENT" | "DOCTOR" | "ADMIN";

export type AppUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
};

export type UserProfile = AppUser & {
  role: UserRole;
  banned: boolean;
  doctorId?: string | null;
};

export type CommentReply = {
  text: string;
  createdAt: string;
  authorUid: string;
  authorName: string;
};

export type DoctorComment = {
  id: string;
  doctorId: string;
  authorUid: string;
  authorName: string;
  authorEmail?: string | null;
  rating: number;
  text: string;
  createdAt: string;
  reply?: CommentReply;
};

export type BroadcastMessage = {
  id: string;
  doctorId: string;
  authorUid: string;
  authorName: string;
  message: string;
  createdAt: string;
};
