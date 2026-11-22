/** Framework-independent API gate. Concrete security/service adapters are absent.
 * Imported by a server-only route, tested with mocks. Never infer identity from
 * a body/user header. No local-process spawning, SQL client or provider clients.
 */
import { changesFilters } from "./changes.ts";
import type { Filters } from "./metrics.ts";
import { ASK_DISABLED, askError, projectAgentResponse } from "./ask-contract.ts";

export type Principal = { id: string };
export type AskInput = { question: string; selection: Filters };
export type AskIntegration = {
  trustedOrigin: string;
  authenticate(request: Request): Promise<Principal | null>;
  authorize(principal: Principal, selection: Filters): Promise<boolean>;
  // Must be atomic/shared across workers; no in-memory production substitute.
  takeRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  // Must invoke the Python agent over an authenticated bounded service boundary,
  // enforcing authorized campaign/date scope at SQL execution, not just prompts.
  invoke(principal: Principal, input: AskInput, signal: AbortSignal): Promise<unknown>;
};
const MAX_BYTES = 4096;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function response(status: number, message: string, extra: Record<string, string> = {}) {
  return Response.json(askError(message), { status, headers: { ...headers, ...extra } });
}

export async function readAskBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("invalid body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new RangeError("size"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function handleAsk(request: Request, integration: AskIntegration | null): Promise<Response> {
  if (!integration) return response(503, ASK_DISABLED);
  try {
    if (request.method !== "POST") return response(405, "Use POST to submit a question.", { Allow: "POST" });
    if (request.headers.get("origin") !== integration.trustedOrigin) return response(403, "This request origin is not allowed.");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return response(415, "Submit a JSON question.");
    const length = request.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) return response(413, "Question request is too large.");
    const principal = await integration.authenticate(request);
    if (!principal || typeof principal.id !== "string" || !principal.id || principal.id.length > 256) return response(401, "Sign in to use Ask the Data.");
    const quota = await integration.takeRateLimit(principal.id);
    if (!quota.allowed) return response(429, "Too many questions. Please try again later.", {
      "Retry-After": String(Math.max(1, Math.min(3600, Math.ceil(quota.retryAfterSeconds) || 60))),
    });
    let input: unknown;
    try { input = await readAskBody(request); }
    catch (error) { return response(error instanceof RangeError ? 413 : 400, "Submit a valid question within the request size limit."); }
    if (input === null || typeof input !== "object" || Array.isArray(input)) return response(400, "Invalid question request.");
    const value = input as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "campaign,from,question,to" || typeof value.question !== "string" || !value.question.trim() || value.question.length > 1000 ||
        typeof value.campaign !== "string" || typeof value.from !== "string" || typeof value.to !== "string") return response(400, "Invalid question or reporting filters.");
    const selection = changesFilters({ campaign: value.campaign, from: value.from, to: value.to });
    if (selection.error) return response(400, "Invalid campaign or inclusive date range.");
    if (!await integration.authorize(principal, selection)) return response(403, "You are not authorized for this reporting scope.");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, 30000);
      });
      const raw = await Promise.race([integration.invoke(principal, { question: value.question.trim(), selection }, controller.signal), timeout]);
      if (JSON.stringify(raw).length > 262144) throw new Error("response size");
      return Response.json(projectAgentResponse(raw), { status: 200, headers });
    } finally { if (timer) clearTimeout(timer); }
  } catch {
    return response(503, "The authenticated question service is unavailable. Please try again later.");
  }
}
