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

  const { createClient } = await import('@supabase/supabase-js');
  const adminClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let rpsDisponivel: number | null = null;
  let prefeituraError = '';

  // Tenta consultar a prefeitura (pode falhar se não tem certificado ou se a prefeitura estiver fora)
  try {
    const nfseService = createNfseService(supabaseUrl, supabaseKey, ambiente, encryptionKey);
    const response = await nfseService.consultarRpsDisponivel(empresaId);

    if (response.success && response.xml) {
      const match = response.xml.match(/<Numero>(\d+)<\/Numero>/i);
      if (match) {
        rpsDisponivel = parseInt(match[1]);

        // Atualiza ultimo_rps_prefeitura
        await adminClient
          .from('empresas')
          .update({ ultimo_rps_prefeitura: rpsDisponivel > 0 ? rpsDisponivel - 1 : 0 })
          .eq('id', empresaId);
      }
    } else {
      prefeituraError = response.errors?.map(e => e.mensagem).join('; ') || 'Prefeitura não retornou dados';
    }
  } catch (err: any) {
    prefeituraError = err.message || 'Erro ao conectar com a prefeitura';
  }

  // Obtém próximo RPS local (funciona independente da prefeitura)
  const { data: rpsLocalData } = await adminClient.rpc('get_next_rps_number', {
    p_empresa_id: empresaId,
  });
  const rpsLocal = rpsLocalData || 1;

  // Busca último RPS usado localmente
  const { data: maxRps } = await adminClient
    .from('notas_fiscais')
    .select('numero_rps')
    .eq('empresa_id', empresaId)
    .order('numero_rps', { ascending: false })
    .limit(1)
    .single();

  // Busca última NFS-e emitida
  const { data: maxNfse } = await adminClient
    .from('notas_fiscais')
    .select('numero_nfse')
    .eq('empresa_id', empresaId)
    .not('numero_nfse', 'is', null)
    .order('numero_nfse', { ascending: false })
    .limit(1)
    .single();

  // Busca ultimo_rps_prefeitura atualizado
  const { data: empresaAtualizada } = await adminClient
    .from('empresas')
    .select('ultimo_rps_prefeitura')
    .eq('id', empresaId)
    .single();

  let message = '';
  if (rpsDisponivel) {
    message = `Prefeitura indica proximo RPS: ${rpsDisponivel}. Sistema usara RPS: ${rpsLocal}`;
  } else if (prefeituraError) {
    message = `Consulta a prefeitura falhou: ${prefeituraError}. Usando numeracao local: proximo RPS = ${rpsLocal}`;
  } else {
    message = `Proximo RPS local: ${rpsLocal}`;
  }

  return NextResponse.json({
    success: true,
    rpsPrefeitura: rpsDisponivel,
    rpsLocal: rpsLocal,
    ultimoRpsLocal: maxRps?.numero_rps ?? null,
    ultimoRpsPrefeitura: empresaAtualizada?.ultimo_rps_prefeitura ?? 0,
    ultimaNfse: maxNfse?.numero_nfse ?? null,
    prefeituraError: prefeituraError || undefined,
    message,
  });
}
