// ✅ USE EM: Server Components, Route Handlers (/api/...), Server Actions
// ❌ NUNCA IMPORTAR em arquivos com "use client"

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value,
              ...options,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            });
          } catch {
            // set() throws in Server Components (read-only context) — safe to ignore.
            // Cookies will be refreshed on the next middleware pass.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value: '',
              ...options,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
              maxAge: 0,
            });
          } catch {
            // Same as above — safe to ignore in read-only contexts.
          }
        },
      },
    }
  );
}

/**
 * Retorna a service_role key do Supabase.
 * Compatível com ambos os nomes:
 * - SUPABASE_SERVICE_ROLE_KEY (definido pela integração Vercel+Supabase)
 * - SUPABASE_SERVICE_KEY (nome usado no .env local)
 */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY não configurada');
  return key;
}

// Helpers rápidos para uso em Server Components
// NOTA: getUser() é preferível a getSession() por segurança —
// getUser() valida o token com o servidor Supabase, enquanto
// getSession() apenas lê o JWT do cookie sem validar.
export async function getServerSession() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Retorna um objeto compatível com a interface de session
  return { user };
}

export async function getServerUser() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
