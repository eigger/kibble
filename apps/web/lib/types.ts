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
  eventType?: { scaleType: string | null };
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
}

export interface CreatedEvent {
  id: string;
  petId: string;
  presetId: string | null;
  occurredAt: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  scaleValue?: number | null;
  note: string | null;
  preset: { id: string; label: string } | null;
  eventType: { key: string; label: string; icon: string | null; scaleType?: string | null };
  attachments?: EventAttachment[];
}

export interface TodaySummaryRow {
  eventTypeKey: string;
  label: string;
  count: number;
}

export type { JournalStats } from "@kibble/shared";

export interface TimelineEvent {
  id: string;
  occurredAt: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  scaleValue: number | null;
  note: string | null;
  preset: { id: string; label: string } | null;
  eventType: { key: string; label: string; icon: string | null; scaleType?: string | null };
  attachments?: EventAttachment[];
}

export interface ParseSuggestion {
  lineIndex: number;
  rawLine: string;
  eventTypeKey: string;
  eventTypeId: string;
  presetId: string | null;
  label: string;
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
