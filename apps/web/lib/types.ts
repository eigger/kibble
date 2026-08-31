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
