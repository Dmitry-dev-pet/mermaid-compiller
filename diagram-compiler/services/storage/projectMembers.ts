import type { SupabaseClient } from '@supabase/supabase-js';

export type ProjectMemberRole = 'viewer' | 'editor';

export type ProjectMember = {
  userId: string;
  role: ProjectMemberRole;
  createdAt?: number;
};

export const listProjectMembers = async (client: SupabaseClient, projectId: string): Promise<ProjectMember[]> => {
  const { data, error } = await client
    .from('project_members')
    .select('user_id,role,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    role: row.role as ProjectMemberRole,
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : undefined,
  }));
};

export const addProjectMember = async (
  client: SupabaseClient,
  projectId: string,
  userId: string,
  role: ProjectMemberRole,
  createdBy: string | null
) => {
  const { error } = await client.from('project_members').upsert(
    {
      project_id: projectId,
      user_id: userId,
      role,
      created_by: createdBy,
    },
    { onConflict: 'project_id,user_id' }
  );
  if (error) throw error;
};

export const updateProjectMemberRole = async (
  client: SupabaseClient,
  projectId: string,
  userId: string,
  role: ProjectMemberRole
) => {
  const { error } = await client
    .from('project_members')
    .update({ role })
    .eq('project_id', projectId)
    .eq('user_id', userId);
  if (error) throw error;
};

export const removeProjectMember = async (client: SupabaseClient, projectId: string, userId: string) => {
  const { error } = await client.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
  if (error) throw error;
};
