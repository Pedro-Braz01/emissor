'use client';

// ✅ USE EM: arquivos com "use client"
// ❌ NÃO IMPORTAR: next/headers, cookies() ou qualquer API de servidor aqui

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './supabase.types';

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClientSupabaseClient() {
  if (_client) return _client;
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return _client;
}

// Alias de conveniência
export const supabase = createClientSupabaseClient();
