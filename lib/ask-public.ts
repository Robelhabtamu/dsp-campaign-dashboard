/** Public visitor access. The token authenticates servers, never visitors. */
import { readAskBody } from "./ask-api.ts";
import { askError, projectAgentResponse } from "./ask-contract.ts";
export type PublicConfig = { url: string; token: string; origin: string };
export function publicConfig(env: Record<string, string | undefined>): PublicConfig | null {
  if (env.ASK_PUBLIC_ACCESS !== "1" || !env.ASK_SERVICE_TOKEN || env.ASK_SERVICE_TOKEN.length < 32) return null;
  try {
    const url = new URL(env.ASK_SERVICE_URL ?? "");
    const origin = new URL(env.ASK_PUBLIC_ORIGIN ?? "");
    if (url.protocol !== "https:" || origin.protocol !== "https:" || url.username || url.password || origin.username || origin.password || url.search || url.hash || url.pathname !== "/" || origin.origin !== env.ASK_PUBLIC_ORIGIN) return null;
    return { url: url.origin, token: env.ASK_SERVICE_TOKEN, origin: origin.origin };
  } catch { return null; }
}
export async function publicReady(config: PublicConfig | null, transport = fetch): Promise<boolean> {
  if (!config) return false;
  try {
    const r = await transport(config.url + "/health", { headers: { Authorization: "Bearer " + config.token }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    const body = await readAskBody(new Request("https://internal", { method: "POST", body: r.body, duplex: "half" } as RequestInit));
    const s = body as Record<string, unknown>;
    return r.ok && s?.mode === "public_campaign_data" && s.ready === true;
  } catch { return false; }
}
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function handlePublicAsk(request: Request, config: PublicConfig | null, transport = fetch) {
  const fail = (status: number, message: string) => Response.json(askError(message), { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
  if (!config) return fail(503, "The Python question service is not configured.");
  if (request.method !== "POST") return fail(405, "Use POST.");
  if (request.headers.get("origin") !== config.origin) return fail(403, "Request origin denied.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return fail(415, "JSON required.");
  let input;
  try { input = await readAskBody(request); } catch (e) { return fail(e instanceof RangeError ? 413 : 400, "Invalid question request."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "Invalid question.");
  const v = input as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "campaign,from,question,to" || typeof v.question !== "string" || !v.question.trim() || v.question.length > 1000 || v.campaign !== "all" || v.from !== "" || v.to !== "") return fail(400, "Ask about any approved campaign or date in your question; page filters are unavailable in public mode.");
  try {
    const r = await transport(config.url + "/ask", { method: "POST", headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" }, body: JSON.stringify(v), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(28000) });
    if (!r.ok) return fail(r.status === 429 ? 429 : 503, r.status === 429 ? "Question limit reached. Please try again later." : "The question backend is unavailable.");
    // Cap the streaming response independently of Content-Length.
    const reader = r.body?.getReader(); if (!reader) throw new Error("body");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const p = await reader.read(); if (p.done) break; size += p.value.length; if (size > 262144) { await reader.cancel(); throw new Error("size"); } chunks.push(p.value); } } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    return Response.json(projectAgentResponse(JSON.parse(new TextDecoder().decode(bytes))), { headers });
  } catch { return fail(503, "The question backend is unavailable. No approved answer was returned."); }
}
