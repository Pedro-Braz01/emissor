import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const notaId = searchParams.get('notaId');
  const tipo = searchParams.get('tipo'); // 'xml_enviado' | 'xml_retorno' | 'pdf'

  if (!notaId || !tipo) {
    return NextResponse.json({ error: 'Parâmetros notaId e tipo são obrigatórios' }, { status: 400 });
  }

  // Busca a nota (RLS garante acesso)
  const { data: nota, error } = await supabase
    .from('notas_fiscais')
    .select('id, empresa_id, numero_nfse, numero_rps, serie_rps, xml_enviado, xml_retorno, status, valor_servicos, valor_iss, aliquota_iss, discriminacao, competencia, data_emissao, codigo_verificacao, tomador_razao_social, tomador_cnpj_cpf, iss_retido, valor_pis, valor_cofins, valor_inss, valor_irrf, valor_csll, valor_liquido')
    .eq('id', notaId)
    .single();

  if (error || !nota) {
    return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
  }

  // Busca dados da empresa para o PDF
  const { data: empresa } = await supabase
    .from('empresas')
    .select('razao_social, cnpj, inscricao_municipal, endereco_completo, telefone, email_empresa, regime_tributario')
    .eq('id', nota.empresa_id || '')
    .single();

  if (tipo === 'xml_enviado') {
    const xml = nota.xml_enviado;
    if (!xml) {
      return NextResponse.json({ error: 'XML de envio não disponível' }, { status: 404 });
    }
    const filename = nota.numero_nfse
      ? `nfse_${nota.numero_nfse}_envio.xml`
      : `rps_${nota.numero_rps}_envio.xml`;
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (tipo === 'xml_retorno') {
    const xml = nota.xml_retorno;
    if (!xml) {
      return NextResponse.json({ error: 'XML de retorno não disponível' }, { status: 404 });
    }
    const filename = nota.numero_nfse
      ? `nfse_${nota.numero_nfse}_retorno.xml`
      : `rps_${nota.numero_rps}_retorno.xml`;
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (tipo === 'pdf') {
    // Retorna dados JSON para o frontend gerar o PDF (DANFSe)
    return NextResponse.json({
      success: true,
      data: {
        nota: {
          numeroNfse: nota.numero_nfse,
          numeroRps: nota.numero_rps,
          serieRps: nota.serie_rps,
          codigoVerificacao: nota.codigo_verificacao,
          dataEmissao: nota.data_emissao,
          competencia: nota.competencia,
          status: nota.status,
          valorServicos: nota.valor_servicos,
          valorIss: nota.valor_iss,
          aliquotaIss: nota.aliquota_iss,
          valorPis: nota.valor_pis,
          valorCofins: nota.valor_cofins,
          valorInss: nota.valor_inss,
          valorIrrf: nota.valor_irrf,
          valorCsll: nota.valor_csll,
          valorLiquido: nota.valor_liquido,
          issRetido: nota.iss_retido,
          discriminacao: nota.discriminacao,
        },
        tomador: {
          razaoSocial: nota.tomador_razao_social,
          cpfCnpj: nota.tomador_cnpj_cpf,
        },
        prestador: empresa ? {
          razaoSocial: empresa.razao_social,
          cnpj: empresa.cnpj,
          inscricaoMunicipal: empresa.inscricao_municipal,
          endereco: empresa.endereco_completo,
          telefone: empresa.telefone,
          email: empresa.email_empresa,
          regimeTributario: empresa.regime_tributario,
        } : null,
      },
    });
  }

  return NextResponse.json({ error: 'Tipo inválido. Use xml_enviado, xml_retorno ou pdf' }, { status: 400 });
}
