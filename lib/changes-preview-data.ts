import "server-only";
import { open } from "node:fs/promises";
import { previewEnabled, previewState, type DisplayChangesState, type changeFilters } from "./changes-preview";

export async function localChangesPreview(selection: ReturnType<typeof changeFilters>): Promise<DisplayChangesState | null> {
  // Production never opens a fixture, even if both preview variables are set.
  if (!previewEnabled(process.env)) return null;
  try {
    const file = process.env.CHANGES_PREVIEW_FILE;
    if (!file || selection.error) throw new Error("Preview setup required");
    const handle = await open(file, "r");
    try {
      if ((await handle.stat()).size > 2000000) throw new Error("Preview too large");
      return previewState(JSON.parse(await handle.readFile("utf8")), selection);
    } finally { await handle.close(); }
  } catch { return { status: "error", items: [], omitted: 0, limited: false, preview: { diagnostics: {}, samples: 0 } }; }
}
