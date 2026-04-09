import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, getServiceRoleKey } from '@/lib/supabase-server';

// Admin API uses service_role to bypass RLS
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

const MASTER_EMAIL = 'pedro.souza53321+dev@gmail.com';

async function isAdmin(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const allAdmins = ADMIN_EMAILS.length > 0 ? ADMIN_EMAILS : [MASTER_EMAIL];
  if (!allAdmins.includes(user.email || '')) return null;
  return user.id;
}

// GET — list all empresas with their licenses
export async function GET() {
  const supabase = createServerSupabaseClient();
  const userId = await isAdmin(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const admin = getAdminClient();

  const { data: empresas, error } = await admin
    .from('empresas')
    .select(`
      id,
      cnpj,
      razao_social,
      nome_fantasia,
      inscricao_municipal,
      regime_tributario,
      email_empresa,
      telefone,
      created_at,
      user_id,
      licencas (
        id,
        license_active,
        plano,
        data_expiracao,
        notas_mes_limite
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get note counts per empresa
  const empresaIds = (empresas || []).map(e => e.id);
  const { data: noteCounts } = await admin
    .from('notas_fiscais')
    .select('empresa_id')
    .in('empresa_id', empresaIds);

  const countMap: Record<string, number> = {};
  (noteCounts || []).forEach((n: any) => {
    countMap[n.empresa_id] = (countMap[n.empresa_id] || 0) + 1;
  });

  const result = (empresas || []).map(e => ({
    ...e,
    total_notas: countMap[e.id] || 0,
    licenca: (e.licencas as any)?.[0] || null,
  }));

  return NextResponse.json({ empresas: result });
}
