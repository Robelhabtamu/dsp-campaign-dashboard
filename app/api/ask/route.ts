import "server-only";
import { handleAsk } from "@/lib/ask-api";
import { handleDemoAsk } from "@/lib/ask-demo";
import { localDemoConfig } from "@/lib/ask-demo-runtime";

// Live execution remains disabled. Anonymous synthetic demo is a separate path.
export async function POST(request: Request) {
  const demo = localDemoConfig();
  if (demo) return handleDemoAsk(request, demo);
  return handleAsk(request, null);
}
