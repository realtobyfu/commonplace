import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://commonplace:commonplace@localhost:5433/commonplace",
  },
});
