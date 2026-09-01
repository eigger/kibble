export type UserRole = "ADMIN" | "GENERAL";
export type Species = "DOG" | "CAT" | "OTHER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  householdId: string | null;
  needsPet: boolean;
}

export interface Pet {
  id: string;
  name: string;
  species: Species;
  sortOrder: number;
}

export interface Preset {
  id: string;
  petId: string | null;
  label: string;
  isStarter: boolean;
  sortOrder: number;
}

export interface CreatedEvent {
  id: string;
  petId: string;
  presetId: string | null;
  occurredAt: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  note: string | null;
  preset: { id: string; label: string } | null;
  eventType: { key: string; label: string; icon: string | null };
}

export interface TodaySummaryRow {
  eventTypeKey: string;
  label: string;
  count: number;
}

export interface TimelineEvent {
  id: string;
  occurredAt: string;
  quantity: number | null;
  quantityOffered: number | null;
  unit: string | null;
  scaleValue: number | null;
  note: string | null;
  preset: { id: string; label: string } | null;
  eventType: { key: string; label: string; icon: string | null };
}
