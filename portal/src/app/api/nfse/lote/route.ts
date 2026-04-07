import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createNfseService } from '@/services/nfse-service';
import { headers } from 'next/headers';
import * as XLSX from 'xlsx';

interface Linhaplanilha {
  linha: number;
  cpfCnpj: string;
  razaoSocial: string;
  email?: string;
  telefone?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  uf?: string;
  valorServicos: number;
  discriminacao: string;
  itemListaServico?: string;
  codigoCnae?: string;
  issRetido?: boolean;
  retPis?: number;
  retCofins?: number;
  retInss?: number;
  retIrrf?: number;
  retCsll?: number;
}

function parsePlanilha(buffer: Buffer): { dados: Linhaplanilha[]; erros: string[] } {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

  const dados: Linhaplanilha[] = [];
  const erros: string[] = [];

  rows.forEach((row, idx) => {
    const linha = idx + 2; // +2 porque header é linha 1

    // Campos obrigatórios
    const cpfCnpj = String(row['CPF/CNPJ'] || row['cpf_cnpj'] || '').replace(/\D/g, '');
    const razaoSocial = String(row['Razão Social'] || row['razao_social'] || '').trim();
    const valorStr = String(row['Valor Serviços'] || row['valor_servicos'] || '0');
    const valorServicos = parseFloat(valorStr.replace(',', '.')) || 0;
    const discriminacao = String(row['Discriminação'] || row['discriminacao'] || '').trim();

    if (!cpfCnpj || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      erros.push(`Linha ${linha}: CPF/CNPJ inválido "${row['CPF/CNPJ'] || row['cpf_cnpj'] || ''}"`);
      return;
    }
    if (!razaoSocial) {
      erros.push(`Linha ${linha}: Razão Social obrigatória`);
      return;
    }
    if (valorServicos <= 0) {
      erros.push(`Linha ${linha}: Valor dos serviços deve ser maior que zero`);
      return;
    }
    if (!discriminacao) {
      erros.push(`Linha ${linha}: Discriminação dos serviços obrigatória`);
      return;
    }

    dados.push({
      linha,
      cpfCnpj,
      razaoSocial,
      email: String(row['Email'] || row['email'] || '').trim() || undefined,
      telefone: String(row['Telefone'] || row['telefone'] || '').trim() || undefined,
      cep: String(row['CEP'] || row['cep'] || '').trim() || undefined,
      logradouro: String(row['Endereço'] || row['endereco'] || row['logradouro'] || '').trim() || undefined,
      numero: String(row['Número'] || row['numero'] || '').trim() || undefined,
      complemento: String(row['Complemento'] || row['complemento'] || '').trim() || undefined,
      bairro: String(row['Bairro'] || row['bairro'] || '').trim() || undefined,
      uf: String(row['UF'] || row['uf'] || '').trim() || undefined,
      valorServicos,
      discriminacao,
      itemListaServico: String(row['Item LC 116'] || row['item_lc116'] || '').trim() || undefined,
      codigoCnae: String(row['CNAE'] || row['cnae'] || '').trim() || undefined,
      issRetido: String(row['ISS Retido'] || row['iss_retido'] || '').toLowerCase() === 'sim',
      retPis: parseFloat(String(row['Ret. PIS'] || row['ret_pis'] || '0').replace(',', '.')) || 0,
      retCofins: parseFloat(String(row['Ret. COFINS'] || row['ret_cofins'] || '0').replace(',', '.')) || 0,
      retInss: parseFloat(String(row['Ret. INSS'] || row['ret_inss'] || '0').replace(',', '.')) || 0,
      retIrrf: parseFloat(String(row['Ret. IRRF'] || row['ret_irrf'] || '0').replace(',', '.')) || 0,
      retCsll: parseFloat(String(row['Ret. CSLL'] || row['ret_csll'] || '0').replace(',', '.')) || 0,
    });
  });

  return { dados, erros };
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const headersList = headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'desconhecido';

  // Lê FormData com arquivo
  const formData = await request.formData();
  const file = formData.get('arquivo') as File;
  const empresaId = formData.get('empresaId') as string;

  if (!file || !empresaId) {
    return NextResponse.json({ error: 'Arquivo e empresaId são obrigatórios' }, { status: 400 });
  }

  // Verifica licença
  const { data: licenca } = await supabase
    .from('licencas')
    .select('*')
    .eq('empresa_id', empresaId)
    .single();

  if (!licenca?.license_active) {
    return NextResponse.json({ error: 'Licença inativa' }, { status: 403 });
  }

  if (licenca.data_expiracao && new Date(licenca.data_expiracao) < new Date()) {
    return NextResponse.json({ error: 'Licença expirada' }, { status: 403 });
  }

  // Parse da planilha
  const buffer = Buffer.from(await file.arrayBuffer());
  const { dados, erros: errosValidacao } = parsePlanilha(buffer);

  if (dados.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'Nenhum registro válido encontrado na planilha',
      errosValidacao,
    }, { status: 400 });
  }

  // Verifica limite mensal
  const notasRestantes = licenca.notas_mes_limite - licenca.notas_mes_atual;
  if (dados.length > notasRestantes) {
    return NextResponse.json({
      success: false,
      error: `Limite mensal insuficiente. Restam ${notasRestantes} notas, mas a planilha tem ${dados.length} registros.`,
    }, { status: 403 });
  }

  // Emite cada nota individualmente
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const ambiente = (process.env.NFSE_AMBIENTE || 'homologacao') as 'homologacao' | 'producao';

  const nfseService = createNfseService(supabaseUrl, supabaseKey, ambiente, encryptionKey);

  const resultados: Array<{
    linha: number;
    success: boolean;
    cpfCnpj: string;
    razaoSocial: string;
    valorServicos: number;
    numeroRps?: number;
    numeroNfse?: number;
    error?: string;
  }> = [];

  for (const item of dados) {
    try {
      const result = await nfseService.emitir(
        {
          empresaId,
          tomador: {
            cpfCnpj: item.cpfCnpj,
            razaoSocial: item.razaoSocial,
            email: item.email,
            telefone: item.telefone,
            endereco: item.logradouro ? {
              logradouro: item.logradouro,
              numero: item.numero,
              complemento: item.complemento,
              bairro: item.bairro,
              cep: item.cep,
              uf: item.uf,
              codigoMunicipio: '3543402',
            } : undefined,
          },
          servico: {
            valorServicos: item.valorServicos,
            discriminacao: item.discriminacao,
            itemListaServico: item.itemListaServico,
            codigoCnae: item.codigoCnae,
            issRetido: item.issRetido,
          },
          retencoes: {
            pis: item.retPis,
            cofins: item.retCofins,
            inss: item.retInss,
            irrf: item.retIrrf,
            csll: item.retCsll,
          },
        },
        user.id,
        user.email || 'Usuário',
        ip
      );

      // Incrementa contador mensal
      if (result.success) {
        await supabase.rpc('incrementar_notas_mes', { p_empresa_id: empresaId });
      }

      resultados.push({
        linha: item.linha,
        success: result.success,
        cpfCnpj: item.cpfCnpj,
        razaoSocial: item.razaoSocial,
        valorServicos: item.valorServicos,
        numeroRps: result.numeroRps,
        numeroNfse: result.numeroNfse,
        error: result.error,
      });
    } catch (err) {
      resultados.push({
        linha: item.linha,
        success: false,
        cpfCnpj: item.cpfCnpj,
        razaoSocial: item.razaoSocial,
        valorServicos: item.valorServicos,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }

  const totalSucesso = resultados.filter(r => r.success).length;
  const totalErro = resultados.filter(r => !r.success).length;

  // Audit log
  await supabase.from('audit_logs').insert({
    empresa_id: empresaId,
    user_id: user.id,
    acao: 'nfse_lote_emitido',
    detalhes: {
      total: dados.length,
      sucesso: totalSucesso,
      erros: totalErro,
      erros_validacao: errosValidacao.length,
    },
    ip,
  });

  return NextResponse.json({
    success: true,
    resumo: {
      totalPlanilha: dados.length + errosValidacao.length,
      totalValidos: dados.length,
      totalEmitidos: totalSucesso,
      totalErros: totalErro,
      errosValidacao: errosValidacao.length,
    },
    errosValidacao,
    resultados,
  });
}
