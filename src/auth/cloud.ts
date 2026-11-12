import type { Design, LibraryRecord } from '../domain/types';
import { supabase } from './supabase';

export async function pushDesign(record: LibraryRecord, userId: string): Promise<string | null> {
  if (!supabase) return null;
  const payload = {
    owner_id: userId,
    title: record.title,
    tags: record.tags,
    favorite: record.favorite,
    trashed_at: record.trashedAt,
    document: record.document,
    updated_at: record.updatedAt,
  };
  if (record.remoteId) {
    const { error } = await supabase.from('designs').update(payload).eq('id', record.remoteId);
    if (error) throw error;
    return record.remoteId;
  }
  const { data, error } = await supabase.from('designs').insert(payload).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function pullDesigns(userId: string): Promise<LibraryRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('designs')
    .select('id,title,tags,favorite,trashed_at,document,created_at,updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: `remote-${row.id as string}`,
    title: row.title as string,
    tags: (row.tags as string[]) ?? [],
    favorite: Boolean(row.favorite),
    trashedAt: (row.trashed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    thumbnail: null,
    document: row.document as Design,
    remoteId: row.id as string,
  }));
}

export async function createShare(remoteId: string, userId: string, mode: 'view' | 'copy'): Promise<string> {
  if (!supabase) throw new Error('Cloud sharing needs Supabase. A compressed link still works without an account.');
  const { data, error } = await supabase
    .from('shares')
    .insert({ design_id: remoteId, owner_id: userId, mode })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function fetchShare(id: string): Promise<{ mode: 'view' | 'copy'; title: string; document: Design } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_shared_design', { share_id: id });
  if (error || !data) return null;
  return data as { mode: 'view' | 'copy'; title: string; document: Design };
}

export async function updateProfile(userId: string, displayName: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('profiles').upsert({ id: userId, display_name: displayName, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function readProfile(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return (data as { display_name?: string } | null)?.display_name ?? null;
}
