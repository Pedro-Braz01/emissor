import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getServiceRoleKey } from '@/lib/supabase-server';
import { createNfseService } from '@/services/nfse-service';

/**
 * POST /api/nfse/sync-rps
 * Sincroniza a numeração de RPS com a prefeitura via ConsultarRpsDisponivel.
 * Retorna o próximo RPS disponível segundo a prefeitura.
 */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const { empresaId } = body;

  if (!empresaId) {
    return NextResponse.json({ error: 'empresaId obrigatório' }, { status: 400 });
  }

  // Verifica permissão
  const { data: perfil } = await supabase
    .from('perfis_usuarios')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .single();

  const { data: empresaOwner } = await supabase
    .from('empresas')
    .select('user_id')
    .eq('id', empresaId)
    .single();

  if (!perfil && empresaOwner?.user_id !== user.id) {
    return NextResponse.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = getServiceRoleKey();
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json({ error: 'ENCRYPTION_KEY não configurada' }, { status: 500 });
  }
  const ambiente = (process.env.NFSE_AMBIENTE || 'homologacao') as 'homologacao' | 'producao';

  const nfseService = createNfseService(supabaseUrl, supabaseKey, ambiente, encryptionKey);

  // Consulta RPS disponível na prefeitura
  const response = await nfseService.consultarRpsDisponivel(empresaId);

  if (!response.success) {
    return NextResponse.json({
      success: false,
      error: response.errors?.map(e => e.mensagem).join('; ') || 'Erro ao consultar prefeitura',
    }, { status: 422 });
  }

  // Extrai número do RPS disponível
  let rpsDisponivel: number | null = null;
  if (response.xml) {
    const match = response.xml.match(/<Numero>(\d+)<\/Numero>/i);
    if (match) {
      rpsDisponivel = parseInt(match[1]);
    }
  }

  if (rpsDisponivel !== null) {
    // Atualiza ultimo_rps_prefeitura (o disponível é o próximo, então o último usado é -1)
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await adminClient
      .from('empresas')
      .update({ ultimo_rps_prefeitura: rpsDisponivel > 0 ? rpsDisponivel - 1 : 0 })
      .eq('id', empresaId);
  }

  // Obtém próximo RPS local para comparação
  const { createClient } = await import('@supabase/supabase-js');
  const adminClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rpsLocal } = await adminClient.rpc('get_next_rps_number', {
    p_empresa_id: empresaId,
  });

  return NextResponse.json({
    success: true,
    rpsPrefeitura: rpsDisponivel,
    rpsLocal: rpsLocal,
    message: rpsDisponivel
      ? `Prefeitura indica próximo RPS: ${rpsDisponivel}. Sistema usará RPS: ${rpsLocal}`
      : 'Não foi possível extrair número do RPS da resposta da prefeitura',
    xmlRetorno: response.xml,
  });
}
