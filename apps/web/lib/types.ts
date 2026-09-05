export type UserRole = "ADMIN" | "GENERAL";
export type Species = "DOG" | "CAT" | "OTHER";
export type Sex = "MALE" | "FEMALE" | "UNKNOWN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  householdId: string | null;
  needsPet: boolean;
  inSharedHousehold?: boolean;
}

export interface Pet {
  id: string;
  name: string;
  species: Species;
  sortOrder: number;
  photoPath?: string | null;
}

export interface PetDetail extends Pet {
  breed: string | null;
  sex: Sex | null;
  neutered: boolean;
  birthDate: string | null;
  adoptionDate: string | null;
  registrationNo: string | null;
  microchipNo: string | null;
  color: string | null;
}

export interface Preset {
  id: string;
  petId: string | null;
  label: string;
  isStarter: boolean;
  sortOrder: number;
  eventType?: { key: string; scaleType: string | null; category?: string };
}

export interface PresetDetail extends Omit<Preset, "eventType"> {
  eventTypeId: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  hiddenAt: string | null;
  eventType: { key: string; label: string; scaleType?: string | null };
}

export interface EventTypeAliasesRow {
  key: string;
  label: string;
  aliases: string[];
  systemAliases: string[];
  hasCustomAliases: boolean;
}

export interface EventAttachment {
  id: string;
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  /** 영상 대표 프레임. 없으면(구 첨부·ffmpeg 없는 서버) 목록이 <video>로 되돌아간다 */
  posterPath?: string | null;
  /** 영상 백그라운드 변환. pending/processing이고 포스터가 없으면 목록은 자리표시자 */
  transcodeStatus?: string | null;
}

export interface CreatedEvent {
  id: string;
  petId: string;
  presetId: string | null;
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  scaleValue?: number | null;
  productName: string | null;
  costKrw: number | null;
  note: string | null;
  createdBy?: { id: string; name: string } | null;
  updatedBy?: { id: string; name: string } | null;
  contact?: {
    id: string;
    name: string;
    address: string | null;
    latitude?: number | null;
    longitude?: number | null;
    placeUrl?: string | null;
  } | null;
  course?: { id: string; name: string } | null;
  preset: { id: string; label: string } | null;
  eventType: { key: string; label: string; icon: string | null; scaleType?: string | null; category?: string | null };
  attachments?: EventAttachment[];
}

export interface TodaySummaryRow {
  eventTypeKey: string;
  label: string;
  count: number;
}

export interface MedicationCourseProgress {
  id: string;
  name: string;
  dosesPerDay: number;
  doseTimes: string[];
  totalDoses: number | null;
  startDate: string;
  endDate: string | null;
  note: string | null;
  dosesGivenTotal: number;
  dosesGivenToday: number;
  dosesRemaining: number | null;
  todayComplete: boolean;
  daysOnCourse: number;
  canUndoToday: boolean;
  dosesToday: { id: string; occurredAt: string; doseSlotIndex: number | null }[];
  doseSlotsToday: DoseSlotToday[];
}

export interface DoseSlotToday {
  index: number;
  time: string;
  eventId: string | null;
  occurredAt: string | null;
}

export interface MedicationCourseRow {
  id: string;
  petId: string;
  name: string;
  dosesPerDay: number;
  doseTimes: string[];
  totalDoses: number | null;
  startDate: string;
  endDate: string | null;
  note: string | null;
  archivedAt: string | null;
}

export interface CareReminder {
  id: string;
  label: string;
  nextDueAt: string;
  ruleType: string;
  eventTypeKey: string;
  eventTypeLabel: string;
  overdue: boolean;
}

export type { JournalStats } from "@kibble/shared";

export interface TimelineEvent {
  id: string;
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  scaleValue: number | null;
  productName: string | null;
  costKrw: number | null;
  note: string | null;
  createdBy?: { id: string; name: string } | null;
  updatedBy?: { id: string; name: string } | null;
  contact?: {
    id: string;
    name: string;
    address: string | null;
    latitude?: number | null;
    longitude?: number | null;
    placeUrl?: string | null;
  } | null;
  course?: { id: string; name: string } | null;
  preset: { id: string; label: string } | null;
  eventType: { key: string; label: string; icon: string | null; scaleType?: string | null; category?: string | null };
  attachments?: EventAttachment[];
}

export interface ParseSuggestion {
  lineIndex: number;
  rawLine: string;
  eventTypeKey: string;
  eventTypeId: string;
  presetId: string | null;
  label: string;
  scaleType?: string | null;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  occurredAt: string | null;
  needsReview: boolean;
  note: string | null;
}

export interface ParseEntryResponse {
  entryId: string;
  rawText: string;
  suggestions: ParseSuggestion[];
}
