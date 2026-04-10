import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceRoleKey } from '@/lib/supabase-server';
import { SoapClient } from '@/services/soap-client';
import { XmlBuilder } from '@/services/xml-builder';

/**
 * POST /api/nfse/sync-rps-all
 *
 * Sincroniza a numeração de RPS de TODAS as empresas ativas com a prefeitura.
 * Projetado para ser chamado via cron job (scheduled task).
 *
 * Auth: Via header x-api-secret (para cron jobs) OU admin autenticado.
 * Processa em batches de 10 empresas para não sobrecarregar o WebService.
 */

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 2000; // 2s entre batches
const DELAY_BETWEEN_REQUESTS_MS = 500; // 500ms entre requests individuais

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  // Auth via API secret (para cron) ou admin
  const apiSecret = request.headers.get('x-api-secret');
  const expectedSecret = process.env.SYNC_RPS_SECRET || process.env.SUPABASE_SERVICE_KEY;

  if (!apiSecret || apiSecret !== expectedSecret) {
    // Fallback: tenta autenticação de admin
    const { createServerSupabaseClient } = await import('@/lib/supabase-server');
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
    const MASTER_EMAIL = process.env.MASTER_EMAIL || '';
    const allAdmins = ADMIN_EMAILS.length > 0 ? ADMIN_EMAILS : [MASTER_EMAIL];
    if (!allAdmins.includes(user.email || '')) {
      return NextResponse.json({ error: 'Apenas admin pode executar sync em massa' }, { status: 403 });
    }
  }

  const ambiente = (process.env.NFSE_AMBIENTE || 'homologacao') as 'homologacao' | 'producao';
  const soapClient = new SoapClient(ambiente);
  const admin = getAdminClient();

  // Busca todas as empresas ativas com certificado
  const { data: empresas, error } = await admin
    .from('empresas')
    .select('id, cnpj, inscricao_municipal, razao_social, serie_rps, ultimo_rps_prefeitura')
    .in('status_licenca', ['ativa', 'pendente']);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!empresas || empresas.length === 0) {
    return NextResponse.json({ success: true, message: 'Nenhuma empresa ativa', total: 0 });
  }

  const results: Array<{
    empresaId: string;
    cnpj: string;
    razaoSocial: string;
    rpsPrefeitura: number | null;
    rpsAnterior: number | null;
    atualizado: boolean;
    erro?: string;
  }> = [];

  // Processa em batches
  for (let i = 0; i < empresas.length; i += BATCH_SIZE) {
    const batch = empresas.slice(i, i + BATCH_SIZE);

    for (const empresa of batch) {
      try {
        const xml = XmlBuilder.consultarRpsDisponivel({
          cnpj: empresa.cnpj,
          inscricaoMunicipal: empresa.inscricao_municipal,
        });

        const response = await soapClient.consultarRpsDisponivel(xml);

        let rpsPrefeitura: number | null = null;
        if (response.success && response.xml) {
          const match = response.xml.match(/<Numero>(\d+)<\/Numero>/i);
          if (match) {
            rpsPrefeitura = parseInt(match[1]);
          }
        }

        if (rpsPrefeitura !== null) {
          const ultimoUsado = rpsPrefeitura > 0 ? rpsPrefeitura - 1 : 0;

          // Só atualiza se o número da prefeitura é mais recente
          if (ultimoUsado > (empresa.ultimo_rps_prefeitura || 0)) {
            await admin
              .from('empresas')
              .update({ ultimo_rps_prefeitura: ultimoUsado })
              .eq('id', empresa.id);

            results.push({
              empresaId: empresa.id,
              cnpj: empresa.cnpj,
              razaoSocial: empresa.razao_social,
              rpsPrefeitura,
              rpsAnterior: empresa.ultimo_rps_prefeitura,
              atualizado: true,
            });
          } else {
            results.push({
              empresaId: empresa.id,
              cnpj: empresa.cnpj,
              razaoSocial: empresa.razao_social,
              rpsPrefeitura,
              rpsAnterior: empresa.ultimo_rps_prefeitura,
              atualizado: false,
            });
          }
        } else {
          results.push({
            empresaId: empresa.id,
            cnpj: empresa.cnpj,
            razaoSocial: empresa.razao_social,
            rpsPrefeitura: null,
            rpsAnterior: empresa.ultimo_rps_prefeitura,
            atualizado: false,
            erro: response.errors?.map(e => e.mensagem).join('; ') || 'Sem dados na resposta',
          });
        }

        // Delay entre requests individuais
        await sleep(DELAY_BETWEEN_REQUESTS_MS);

      } catch (e) {
        results.push({
          empresaId: empresa.id,
          cnpj: empresa.cnpj,
          razaoSocial: empresa.razao_social,
          rpsPrefeitura: null,
          rpsAnterior: empresa.ultimo_rps_prefeitura,
          atualizado: false,
          erro: e instanceof Error ? e.message : 'Erro desconhecido',
        });
      }
    }

    // Delay entre batches
    if (i + BATCH_SIZE < empresas.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  const atualizados = results.filter(r => r.atualizado).length;
  const erros = results.filter(r => r.erro).length;

  return NextResponse.json({
    success: true,
    total: empresas.length,
    atualizados,
    erros,
    results,
  });
}
