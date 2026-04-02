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
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
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
