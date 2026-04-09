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

// GET — Lista solicitações pendentes para as empresas do usuário
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa_id');

  const admin = getAdminClient();

  // Busca empresas onde o usuário é owner ou super_admin
  const { data: perfis } = await admin
    .from('perfis_usuarios')
    .select('empresa_id')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .in('role', ['owner', 'super_admin']);

  const empresaIds = (perfis || []).map(p => p.empresa_id);
  if (empresaIds.length === 0) {
    return NextResponse.json({ solicitacoes: [] });
  }

  let query = admin
    .from('solicitacoes_vinculo')
    .select(`
      id,
      empresa_id,
      email_solicitante,
      nome_solicitante,
      status,
      created_at,
      empresas ( razao_social )
    `)
    .in('empresa_id', empresaIds)
    .order('created_at', { ascending: false });

  if (empresaId) {
    query = query.eq('empresa_id', empresaId);
  }

  const { data: solicitacoes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    solicitacoes: (solicitacoes || []).map(s => ({
      ...s,
      razao_social_empresa: (s.empresas as any)?.razao_social || '',
    })),
  });
}

// PATCH — Aprovar ou rejeitar solicitação
export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const { solicitacao_id, acao } = body; // acao: 'aprovar' | 'rejeitar'

  if (!solicitacao_id || !['aprovar', 'rejeitar'].includes(acao)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Busca a solicitação
  const { data: solicitacao, error: fetchError } = await admin
    .from('solicitacoes_vinculo')
    .select('*')
    .eq('id', solicitacao_id)
    .eq('status', 'pendente')
    .single();

  if (fetchError || !solicitacao) {
    return NextResponse.json({ error: 'Solicitação não encontrada ou já processada' }, { status: 404 });
  }

  // Verifica permissão: usuário deve ser owner/super_admin da empresa
  const { data: perfil } = await admin
    .from('perfis_usuarios')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', solicitacao.empresa_id)
    .eq('ativo', true)
    .in('role', ['owner', 'super_admin'])
    .single();

  if (!perfil) {
    return NextResponse.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
  }

  const novoStatus = acao === 'aprovar' ? 'aprovada' : 'rejeitada';

  // Atualiza status da solicitação
  const { error: updateError } = await admin
    .from('solicitacoes_vinculo')
    .update({
      status: novoStatus,
      respondido_por: user.id,
      respondido_em: new Date().toISOString(),
    })
    .eq('id', solicitacao_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Se aprovada, cria o vínculo (perfil_usuario)
  if (acao === 'aprovar') {
    // Verifica se o usuário solicitante já existe no auth
    const { data: authData } = await admin.auth.admin.listUsers();
    const solicitanteUser = (authData?.users || []).find(
      u => u.email === solicitacao.email_solicitante
    );

    if (solicitanteUser) {
      // Verifica se já existe vínculo
      const { data: vinculoExistente } = await admin
        .from('perfis_usuarios')
        .select('id')
        .eq('user_id', solicitanteUser.id)
        .eq('empresa_id', solicitacao.empresa_id)
        .single();

      if (!vinculoExistente) {
        await admin
          .from('perfis_usuarios')
          .insert({
            user_id: solicitanteUser.id,
            empresa_id: solicitacao.empresa_id,
            role: 'emissor',
            ativo: true,
          });
      } else {
        // Reativa vínculo existente
        await admin
          .from('perfis_usuarios')
          .update({ ativo: true })
          .eq('id', vinculoExistente.id);
      }
    }
    // Se o usuário não existe no auth ainda, o vínculo será criado quando ele se cadastrar
  }

  return NextResponse.json({ success: true, status: novoStatus });
}
