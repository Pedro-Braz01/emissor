import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// ===================
// TIPOS
// ===================

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          cnpj: string;
          nome: string;
          slug: string;
          email: string;
          plano: string;
          max_notas_mes: number;
          notas_mes_atual: number;
          ativo: boolean;
        };
      };
      usuarios: {
        Row: {
          id: string;
          tenant_id: string;
          auth_user_id: string;
          email: string;
          nome: string;
          role: string;
          empresas_permitidas: string[];
          ativo: boolean;
        };
      };
      empresas: {
        Row: {
          id: string;
          tenant_id: string;
          cnpj: string;
          razao_social: string;
          inscricao_municipal: string;
          ambiente: string;
          serie_rps: string;
          proximo_numero_rps: number;
          regime_tributario: string;
          aliquota_iss: number;
          item_lista_servico: string;
          ativo: boolean;
        };
      };
      notas_fiscais: {
        Row: {
          id: string;
          empresa_id: string;
          numero_nfse: number | null;
          numero_rps: number;
          serie_rps: string;
          status: string;
          valor_servicos: number;
          discriminacao: string;
          created_by: string;
          created_by_nome: string;
          created_at: string;
        };
      };
      licencas: {
        Row: {
          id: string;
          tenant_id: string;
          status: string;
          license_active: boolean;
          validade: string | null;
        };
      };
    };
  };
};

// ===================
// CLIENT-SIDE
// ===================

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ===================
// SERVER-SIDE
// ===================

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component
          }
        },
      },
    }
  );
}

// ===================
// ADMIN (SERVICE ROLE)
// ===================

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
