import "server-only";
import { handlePublicAsk, publicConfig } from "@/lib/ask-public";
import { handleDemoAsk } from "@/lib/ask-demo";
import { localDemoConfig } from "@/lib/ask-demo-runtime";

// Public visitors need no application sign-in. Service credentials stay here.
export async function POST(request: Request) {
  const demo = localDemoConfig();
  if (demo) return handleDemoAsk(request, demo);
  return handlePublicAsk(request, publicConfig(process.env));
}
