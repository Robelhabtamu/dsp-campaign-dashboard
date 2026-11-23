import "server-only";
import postgres from "postgres";
import { loadChanges, type ChangesState } from "./changes";
import type { Filters } from "./metrics";

let reader: ReturnType<typeof postgres> | undefined;

export async function publishedChanges(selection: Filters & { metric?: string; direction?: string }): Promise<ChangesState> {
  const url = process.env.AI_DASHBOARD_DATABASE_URL;
  if (!url) return { status: "unconfigured", items: [], omitted: 0, limited: false };
  return loadChanges(async () => {
    // Deliberately independent of lib/db.ts and DATABASE_URL. Lazy configuration
    // keeps other routes working before the restricted reader is provisioned.
    reader ??= postgres(url, { ssl: "require", prepare: false, max: 2, connect_timeout: 10, idle_timeout: 20,
      connection: { statement_timeout: 10000 } });
    const result = await reader.begin("read only", async (sql) => {
      const [access] = await sql`SELECT
        pg_has_role(current_user, 'ai_dashboard_reader', 'USAGE') AS allowed,
        has_table_privilege(current_user, 'ai_store.explanations', 'SELECT') AS raw_access`;
      if (!access.allowed || access.raw_access) throw new Error("Restricted reader required");
      const rows = await sql`SELECT job_id, evidence, explanation, provider_used, attempt_count, publication_status
        FROM ai_store.published_outputs
        WHERE publication_status = 'publishable'
          AND (${selection.campaign}::text = 'all' OR evidence->>'advertiser_id' = ${selection.campaign})
          AND (${selection.metric ?? 'all'}::text = 'all' OR evidence->>'metric' = ${selection.metric ?? 'all'})
          AND (${selection.direction ?? 'all'}::text = 'all' OR evidence->>'direction' = ${selection.direction ?? 'all'})
          AND left(evidence->>'observation_timestamp', 10) >= ${selection.from}
          AND left(evidence->>'observation_timestamp', 10) <= ${selection.to}
        ORDER BY evidence->>'observation_timestamp' DESC, job_id LIMIT 101`;
      return Array.from(rows);
    });
    return Array.from(result);
  }, selection);
}
