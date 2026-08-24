// Custom lists — the user's own groupings (comfort shows, movie night, watch
// with Dad) on top of the fixed follow statuses. Backed by migration 0009:
// `lists` + `list_items`, both RLS-private. A title can sit in any number of
// lists regardless of whether it's tracked.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { fetchAllRows } from './tracking'
import type { MediaType, TitleDetail } from './types'

export interface ListRow {
  id: number
  name: string
  emoji: string | null
  created_at: string
}

export interface ListItemRow {
  list_id: number
  tmdb_id: number
  media_type: MediaType
  name: string | null
  poster_path: string | null
  added_at: string
}

// The slice of a title the sheet needs to denormalize into `list_items`.
export type ListableTitle = Pick<TitleDetail, 'id' | 'media_type' | 'title' | 'posterPath'>

export function useLists() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['lists'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<ListRow[]> => {
      const { data, error } = await supabase!
        .from('lists')
        .select('id, name, emoji, created_at')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ListRow[]
    },
  })
}

// Every list item in one paged read. Counts, poster previews, and per-title
// membership all derive from this single cache entry, so one invalidation
// keeps every view honest.
export function useAllListItems() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['list-items'],
    enabled: Boolean(supabase && session),
    queryFn: () =>
      fetchAllRows<ListItemRow>((from, to) =>
        supabase!
          .from('list_items')
          .select('list_id, tmdb_id, media_type, name, poster_path, added_at')
          .order('id', { ascending: true })
          .range(from, to),
      ),
  })
}

export function useCreateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { name: string; emoji?: string | null }): Promise<number> => {
      if (!supabase) throw new Error('Not configured')
      const { data, error } = await supabase
        .from('lists')
        .insert({ name: args.name.trim(), emoji: args.emoji ?? null })
        .select('id')
        .single()
      if (error) {
        // 23505 = unique_violation on (user_id, name).
        if ((error as { code?: string }).code === '23505')
          throw new Error('You already have a list with that name.')
        throw error
      }
      return (data as { id: number }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  })
}

export function useUpdateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: number; name: string; emoji: string | null }) => {
      if (!supabase) throw new Error('Not configured')
      const { error } = await supabase
        .from('lists')
        .update({
          name: args.name.trim(),
          emoji: args.emoji,
          updated_at: new Date().toISOString(),
        })
        .eq('id', args.id)
      if (error) {
        if ((error as { code?: string }).code === '23505')
          throw new Error('You already have a list with that name.')
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  })
}

export function useDeleteList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase) throw new Error('Not configured')
      // Items go with it via ON DELETE CASCADE.
      const { error } = await supabase.from('lists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] })
      qc.invalidateQueries({ queryKey: ['list-items'] })
    },
  })
}

// Add/remove one title in one list. Optimistic: the sheet's checkmarks and the
// list pages read the shared ['list-items'] cache, so flip it immediately and
// roll back on error.
export function useToggleListItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { listId: number; title: ListableTitle; inList: boolean }) => {
      if (!supabase) throw new Error('Not configured')
      if (args.inList) {
        const { error } = await supabase
          .from('list_items')
          .delete()
          .eq('list_id', args.listId)
          .eq('tmdb_id', args.title.id)
          .eq('media_type', args.title.media_type)
        if (error) throw error
      } else {
        const { error } = await supabase.from('list_items').insert({
          list_id: args.listId,
          tmdb_id: args.title.id,
          media_type: args.title.media_type,
          name: args.title.title,
          poster_path: args.title.posterPath,
        })
        // A concurrent add from another device is success, not failure.
        if (error && (error as { code?: string }).code !== '23505') throw error
      }
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ['list-items'] })
      const prev = qc.getQueryData<ListItemRow[]>(['list-items'])
      qc.setQueryData<ListItemRow[]>(['list-items'], (rows = []) =>
        args.inList
          ? rows.filter(
              (r) =>
                !(
                  r.list_id === args.listId &&
                  r.tmdb_id === args.title.id &&
                  r.media_type === args.title.media_type
                ),
            )
          : [
              ...rows,
              {
                list_id: args.listId,
                tmdb_id: args.title.id,
                media_type: args.title.media_type,
                name: args.title.title,
                poster_path: args.title.posterPath,
                added_at: new Date().toISOString(),
              },
            ],
      )
      return { prev }
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prev) qc.setQueryData(['list-items'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['list-items'] }),
  })
}
