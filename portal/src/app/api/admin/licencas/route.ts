import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

const MASTER_EMAIL = 'pedro.souza53321+dev@gmail.com';

async function isAdmin(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const allAdmins = ADMIN_EMAILS.length > 0 ? ADMIN_EMAILS : [MASTER_EMAIL];
  if (!allAdmins.includes(user.email || '')) return false;
  return true;
}

// PATCH — toggle license active/inactive
export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await request.json();
  const { empresa_id, license_active, plano, data_expiracao, notas_mes_limite } = body;

  if (!empresa_id) {
    return NextResponse.json({ error: 'empresa_id obrigat\u00f3rio' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Check if license exists
  const { data: existing } = await admin
    .from('licencas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .single();

  const payload: Record<string, unknown> = {};
  if (typeof license_active === 'boolean') payload.license_active = license_active;
  if (plano) payload.plano = plano;
  if (data_expiracao !== undefined) payload.data_expiracao = data_expiracao;
  if (notas_mes_limite !== undefined) payload.notas_mes_limite = notas_mes_limite;

  if (existing) {
    const { error } = await admin
      .from('licencas')
      .update(payload)
      .eq('empresa_id', empresa_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin
      .from('licencas')
      .insert({ empresa_id, license_active: license_active ?? false, plano: plano || 'basico', notas_mes_limite: notas_mes_limite || 50 });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
