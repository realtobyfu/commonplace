import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const client = postgres(
    process.env.DATABASE_URL ??
      "postgres://commonplace:commonplace@localhost:5433/commonplace",
    { max: 1 },
  );
  await migrate(drizzle(client), { migrationsFolder: "./lib/db/migrations" });
  await client.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
