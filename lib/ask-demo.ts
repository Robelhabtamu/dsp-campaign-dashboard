/** Anonymous public SYNTHETIC fixture only. This is not live user auth. */
import { readAskBody } from "./ask-api.ts";
import { askError, askFailure, projectAgentResponse, type AskErrorCode } from "./ask-contract.ts";
import { filters, type Params } from "./metrics.ts";

export const demoDates = ["2013-06-06", "2013-06-07", "2013-06-08"];
export const demoCampaigns = ["1458", "3358"];
export function demoFilters(params: Params) {
  const selection = filters({ ...params, campaign: params.campaign ?? "1458" }, demoDates);
  if (!selection.error && selection.campaign !== "all" && !demoCampaigns.includes(selection.campaign)) selection.error = "Choose synthetic advertiser 1458 or 3358.";
  return selection;
}

export type DemoConfig = { url: string; token: string; origin: string };
export function demoConfig(env: Record<string, string | undefined>): DemoConfig | null {
  if (env.NODE_ENV !== "development" || env.ASK_LOCAL_DEMO !== "1" || !env.ASK_DEMO_BRIDGE_TOKEN || env.ASK_DEMO_BRIDGE_TOKEN.length < 32) return null;
  const url = env.ASK_DEMO_SERVICE_URL ?? "http://127.0.0.1:8765";
  const origin = env.ASK_DEMO_ORIGIN ?? "http://127.0.0.1:3001";
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(url) || !/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(origin)) return null;
  return { url, token: env.ASK_DEMO_BRIDGE_TOKEN, origin };
}
export async function demoReadiness(config: DemoConfig | null, transport = fetch): Promise<{ ready: boolean; aiAvailable: boolean }> {
  if (!config) return { ready: false, aiAvailable: false };
  try {
    const response = await transport(config.url + "/health", { headers: { Authorization: "Bearer " + config.token }, cache: "no-store", signal: AbortSignal.timeout(2000) });
    const state = await response.json();
    return { ready: response.ok && state.ready === true && state.live_enabled === false && state.mode === "synthetic_demo", aiAvailable: state.ai_available === true };
  } catch { return { ready: false, aiAvailable: false }; }
}
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function error(status: number, message: string, code?: AskErrorCode) { return Response.json(code ? askFailure(code) : askError(message), { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } }); }
export async function handleDemoAsk(request: Request, config: DemoConfig, transport = fetch) {
  if (request.method !== "POST") return error(405, "Use POST.");
  if (request.headers.get("origin") !== config.origin) return error(403, "Demo request origin denied.", "demo_origin");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return error(415, "JSON required.");
  let value;
  try { value = await readAskBody(request); } catch (e) { return error(e instanceof RangeError ? 413 : 400, "Invalid demo request."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return error(400, "Invalid demo request.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "campaign,from,mode,question,to" || typeof input.question !== "string" || !input.question.trim() || input.question.length > 1000 ||
    !["1458", "3358", "all"].includes(String(input.campaign)) || !["synthetic_scripted", "synthetic_ai"].includes(String(input.mode)) ||
    ![input.from, input.to].every(v => typeof v === "string" && /^2013-06-0[678]$/.test(v)) || String(input.from) > String(input.to)) return error(400, "Select a supported synthetic campaign and June 6–8 dates.", "demo_scope");
  try {
    const response = await transport(config.url + "/ask", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.token },
      body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(28000) });
    if (!response.ok) {
      if (response.status === 429) return error(429, "Rate limited", "demo_rate_limit");
      let failure: Record<string, unknown> = {};
      try { failure = await response.json(); } catch { /* Never expose driver/provider text. */ }
      if (response.status === 400) return error(400, "Invalid demo request", failure.error_code === "demo_question" ? "demo_question" : "demo_scope");
      return error(503, "Backend unavailable", failure.error_code === "demo_ai_budget" ? "demo_ai_budget" : "demo_backend");
    }
    // Bound upstream bytes before parsing; never pass provider messages through.
    const raw = await readAskBody(new Request("http://internal", { method: "POST", body: response.body, duplex: "half" } as RequestInit));
    if (!raw || typeof raw !== "object" || (raw as Record<string, unknown>).demo_mode !== input.mode) return error(503, "Invalid demo response.");
    const result = raw as Record<string, unknown>;
    if (!Array.isArray(result.evidence) || result.evidence.some(e => !e || e.source !== "synthetic_fixture" || e.query_executed !== true) ||
      result.status === "approved" && result.evidence.length === 0) return error(503, "Synthetic SQL evidence is required.");
    return Response.json(projectAgentResponse(raw), { headers });
  } catch { return error(503, "Synthetic question backend unavailable. No answer was generated.", "demo_backend"); }
}
