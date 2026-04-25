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
