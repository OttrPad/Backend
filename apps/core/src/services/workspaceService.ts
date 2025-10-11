import { supabase } from "@packages/supabase";

export interface Workspace {
  workspace_id: number;
  name: string;
  requirements: string | null;
  created_at?: string;
}

export const getWorkspaces = async (limit: number = 50, offset: number = 0) => {
  const { data, error, count } = await supabase
    .from("Workspaces")
    .select("workspace_id, name, requirements", { count: "exact" })
    .order("workspace_id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    workspaces: (data as Workspace[]) || [],
    total: count ?? 0,
    hasMore: count ? offset + limit < count : false,
  };
};

export const getWorkspaceById = async (id: number) => {
  const { data, error } = await supabase
    .from("Workspaces")
    .select("workspace_id, name, requirements")
    .eq("workspace_id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as Workspace) || null;
};
