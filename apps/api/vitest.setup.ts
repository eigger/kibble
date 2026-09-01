import { existsSync } from "fs";

if (!process.env.DATABASE_URL) {
  const envPath = "../../.env";
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-jwt-secret";
}
