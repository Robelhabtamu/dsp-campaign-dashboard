import "server-only";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

const sql = postgres(connectionString, {
  ssl: "require",
  max: 5,
  // Avoid named-statement collisions across pooled serverless connections.
  prepare: false,
});

export default sql;
