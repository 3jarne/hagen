import { supabase } from "@/lib/supabase"

export interface Project {
  id: string
  user_id: string
  name: string
  address: string
  center_lng: number
  center_lat: number
  zoom: number
  gnr: number | null
  bnr: number | null
  sharing_enabled: boolean
  share_id: string | null
  created_at: string
  updated_at: string
}

export interface NewProjectInput {
  address: string
  center_lng: number
  center_lat: number
  gnr: number
  bnr: number
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  return (data as Project | null) ?? null
}

/** Hent prosjekt via share_id — krever ikke innlogging.
 *  RLS sørger for at kun delte prosjekter returneres. */
export async function getProjectByShareId(
  shareId: string,
): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("share_id", shareId)
    .eq("sharing_enabled", true)
    .maybeSingle()
  if (error) throw error
  return (data as Project | null) ?? null
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as Project[]
}

export async function createProject(
  input: NewProjectInput,
): Promise<Project> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr) throw userErr
  const userId = userRes.user?.id
  if (!userId) throw new Error("Ikke innlogget")

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: input.address,
      address: input.address,
      center_lng: input.center_lng,
      center_lat: input.center_lat,
      gnr: input.gnr,
      bnr: input.bnr,
    })
    .select("*")
    .single()
  if (error) throw error
  return data as Project
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) throw error
}

const SHARE_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

function generateShareId(length = 12): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let id = ""
  for (let i = 0; i < length; i++) {
    id += SHARE_ID_ALPHABET[bytes[i] % SHARE_ID_ALPHABET.length]
  }
  return id
}

/** Slå på deling. Beholder eksisterende share_id hvis prosjektet
 *  allerede har én. */
export async function enableSharing(
  projectId: string,
  existingShareId: string | null,
): Promise<{ share_id: string }> {
  const share_id = existingShareId ?? generateShareId()
  const { error } = await supabase
    .from("projects")
    .update({ sharing_enabled: true, share_id })
    .eq("id", projectId)
  if (error) throw error
  return { share_id }
}

/** Slå av deling. Beholder share_id slik at samme lenke gjenbrukes
 *  hvis bruker slår på deling igjen senere. */
export async function disableSharing(projectId: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ sharing_enabled: false })
    .eq("id", projectId)
  if (error) throw error
}

/** Bygg full URL til read-only-visningen. */
export function buildShareUrl(shareId: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(
    /\/$/,
    "",
  )
  return `${base}/del/${shareId}`
}
