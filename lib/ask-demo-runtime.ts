import "server-only";
import { demoConfig } from "./ask-demo";

// The process-only opt-in has no live mode and is ignored in production.
export function localDemoConfig() { return demoConfig(process.env); }
