// Data + auth layer for PrimeBias.
//
// This app was originally built on Base44. It now runs entirely on Supabase.
// This module keeps the old `base44` export name and its `{ auth, entities }`
// shape so the rest of the app didn't need to change during the migration.
// The entity methods (list / filter / create / update / delete) mirror the
// Base44 SDK's contract but are backed by Supabase Postgres + Row Level Security.
//
// Nothing here talks to Base44 anymore — feel free to rename `base44` to
// something like `db` throughout the app whenever you want.
import { supabase, isSupabaseConfigured } from './supabaseClient';

// Entity name (as used across the app) -> Postgres table name.
const TABLES = {
  BiasAnalysis: 'bias_analysis',
  CompletedTrade: 'completed_trade',
  MonthlyJournal: 'monthly_journal',
  TradeJournalEntry: 'trade_journal_entry',
};

function client() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
    );
  }
  return supabase;
}

// Base44 sort strings look like "-created_date" (desc) or "year" (asc).
function applySort(query, sort) {
  if (!sort) return query;
  const descending = sort.startsWith('-');
  const column = descending ? sort.slice(1) : sort;
  return query.order(column, { ascending: !descending });
}

function makeEntity(table) {
  return {
    async list(sort, limit = 100) {
      let q = client().from(table).select('*');
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },

    async filter(query = {}, sort, limit = 100) {
      let q = client().from(table).select('*').match(query);
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },

    async create(values) {
      const { data, error } = await client()
        .from(table)
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async update(id, values) {
      const { data, error } = await client()
        .from(table)
        .update(values)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await client().from(table).delete().eq('id', id);
      if (error) throw error;
      return { id };
    },
  };
}

const entities = Object.fromEntries(
  Object.entries(TABLES).map(([name, table]) => [name, makeEntity(table)])
);

const auth = {
  // Mirrors base44.auth.me(): resolves to the current user or throws (401) when signed out.
  async me() {
    const { data, error } = await client().auth.getUser();
    if (error) throw error;
    if (!data?.user) {
      const err = new Error('Not authenticated');
      err.status = 401;
      throw err;
    }
    const u = data.user;
    return {
      ...u,
      email: u.email,
      full_name: u.user_metadata?.full_name,
      role: u.user_metadata?.role, // undefined unless you set it in Supabase
    };
  },

  async signInWithPassword(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signUp(email, password) {
    const { data, error } = await client().auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  // Login is handled by the in-app <Login /> screen (see AuthContext), so this
  // is a no-op kept only for backwards compatibility with old call sites.
  redirectToLogin() {},
};

export const base44 = { entities, auth };
export { isSupabaseConfigured };
