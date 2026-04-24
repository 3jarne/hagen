import type { Feature } from "geojson"
import { supabase } from "@/lib/supabase"

export interface DrawingData {
  drawFeatures: Feature[]
  textFeatures: Feature[]
  lineFeatures: Feature[]
}

interface DrawingRow {
  project_id: string
  draw_features: Feature[]
  text_features: Feature[]
  line_features: Feature[]
}

/** Load the single drawing row for a project (returns empty shape if none). */
export async function loadDrawing(projectId: string): Promise<DrawingData> {
  const { data, error } = await supabase
    .from("drawings")
    .select("draw_features, text_features, line_features")
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) throw error
  return {
    drawFeatures: (data?.draw_features ?? []) as Feature[],
    textFeatures: (data?.text_features ?? []) as Feature[],
    lineFeatures: (data?.line_features ?? []) as Feature[],
  }
}

/** Upsert the single drawing row for a project. */
export async function saveDrawing(
  projectId: string,
  data: DrawingData,
): Promise<void> {
  const row: DrawingRow = {
    project_id: projectId,
    draw_features: data.drawFeatures,
    text_features: data.textFeatures,
    line_features: data.lineFeatures,
  }
  const { error } = await supabase
    .from("drawings")
    .upsert(row, { onConflict: "project_id" })
  if (error) throw error
}
