import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = createServerSupabaseClient();

  // ✅ CORREÇÃO: usar getUser() em vez de getSession()
  // getUser() retorna tipo User com id tipado corretamente
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // Agora user.id é string — TypeScript fica feliz
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id, razao_social, cnpj')
    .eq('user_id', user.id)
    .single();

  if (!empresa) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
  }

  const { data: licenca } = await supabase
    .from('licencas')
    .select('license_active, plano, data_expiracao, notas_mes_limite')
    .eq('empresa_id', empresa.id)
    .single();

  return NextResponse.json({
    empresa_id: empresa.id,
    razao_social: empresa.razao_social,
    cnpj: empresa.cnpj,
    license_active: licenca?.license_active ?? false,
    plano: licenca?.plano ?? 'basico',
    data_expiracao: licenca?.data_expiracao ?? null,
    notas_mes_limite: licenca?.notas_mes_limite ?? 50,
  });
}

// PATCH — atualiza licença (uso interno / admin)
export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const { empresa_id, license_active } = body;

  if (!empresa_id || typeof license_active !== 'boolean') {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  const { error } = await supabase
    .from('licencas')
    .update({ license_active, updated_at: new Date().toISOString() })
    .eq('empresa_id', empresa_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, license_active });
}
