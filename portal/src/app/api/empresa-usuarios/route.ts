import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, getServiceRoleKey } from '@/lib/supabase-server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET — Lista usuários vinculados a uma empresa (acessível por owner/super_admin da empresa)
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa_id');
  if (!empresaId) {
    return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Verifica se o usuário é owner ou super_admin da empresa
  const { data: meuPerfil } = await admin
    .from('perfis_usuarios')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .in('role', ['owner', 'super_admin'])
    .single();

  if (!meuPerfil) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  // Busca todos os perfis desta empresa
  const { data: perfis } = await admin
    .from('perfis_usuarios')
    .select('id, user_id, role, ativo, created_at')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: true });

  if (!perfis || perfis.length === 0) {
    return NextResponse.json({ usuarios: [] });
  }

  // Busca emails dos usuários via admin auth API
  const { data: authData } = await admin.auth.admin.listUsers();
  const userMap = new Map(
    (authData?.users || []).map(u => [u.id, u.email || ''])
  );

  const usuarios = perfis.map(p => ({
    id: p.id,
    user_id: p.user_id,
    email: userMap.get(p.user_id) || '—',
    role: p.role,
    ativo: p.ativo,
  }));

  return NextResponse.json({ usuarios });
}
