export type UserRole = "ADMIN" | "GENERAL";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
