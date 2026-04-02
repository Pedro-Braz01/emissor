import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { headers } from 'next/headers';

// ── Schema de validação (compatível com o formato do frontend) ──────
const EmitirSchema = z.object({
  empresaId: z.string().uuid(),
  tomador: z.object({
    cpfCnpj: z.string().min(11),
    razaoSocial: z.string().min(2),
    email: z.string().email().optional(),
    telefone: z.string().optional(),
    endereco: z.object({
      cep: z.string().optional(),
      logradouro: z.string().optional(),
      numero: z.string().optional(),
      complemento: z.string().optional(),
      bairro: z.string().optional(),
      uf: z.string().optional(),
    }).optional(),
  }),
  servico: z.object({
    valorServicos: z.number().positive(),
    discriminacao: z.string().min(5),
    itemListaServico: z.string().optional(),
    issRetido: z.boolean().default(false),
  }),
});

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  // ── Auth (usa getUser() por segurança) ──
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // ── IP do cliente ──
  const headersList = headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'desconhecido';

  // ── Valida body ──
  let body: z.infer<typeof EmitirSchema>;
  try {
    body = EmitirSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Dados inválidos', details: err }, { status: 400 });
  }

  // ── Busca empresa ──
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', body.empresaId)
    .single();

  if (empresaError || !empresa) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
  }

  // ── Verifica licença (Kill Switch) ──
  const { data: licenca } = await supabase
    .from('licencas')
    .select('*')
    .eq('empresa_id', empresa.id)
    .single();

  if (!licenca?.license_active) {
    return NextResponse.json(
      { error: 'Licença inativa. Entre em contato com o suporte.' },
      { status: 403 }
    );
  }

  // ── Busca configurações tributárias ──
  const { data: configTrib } = await supabase
    .from('configuracoes_tributarias')
    .select('*')
    .eq('empresa_id', empresa.id)
    .single();

  const aliquotas = {
    iss:    configTrib?.aliquota_iss    ?? 2.0,
    pis:    configTrib?.aliquota_pis    ?? 0.65,
    cofins: configTrib?.aliquota_cofins ?? 3.0,
    csll:   configTrib?.aliquota_csll   ?? 1.0,
    irrf:   configTrib?.aliquota_irrf   ?? 1.5,
  };

  // ── Cálculo de impostos ──
  const baseCalculo = body.servico.valorServicos;
  const impostos = calcularImpostos(baseCalculo, aliquotas, empresa.regime_tributario);

  // ── Próximo número de RPS ──
  const { count } = await supabase
    .from('notas_fiscais')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresa.id);

  const numero_rps = (count ?? 0) + 1;

  // ── Insere nota como pendente ──
  const { data: nota, error: insertError } = await supabase
    .from('notas_fiscais')
    .insert({
      empresa_id: empresa.id,
      numero_rps,
      serie_rps: '1',
      tipo_rps: 'RPS',
      status: 'pendente',
      tomador_razao_social: body.tomador.razaoSocial,
      tomador_cnpj_cpf: body.tomador.cpfCnpj,
      tomador_email: body.tomador.email ?? null,
      tomador_inscricao_municipal: null,
      valor_servicos: body.servico.valorServicos,
      valor_deducoes: 0,
      valor_base_calculo: baseCalculo,
      valor_iss: impostos.iss,
      valor_pis: impostos.pis,
      valor_cofins: impostos.cofins,
      valor_csll: impostos.csll,
      valor_irrf: impostos.irrf,
      valor_liquido: body.servico.valorServicos - impostos.iss - impostos.irrf - impostos.csll - impostos.pis - impostos.cofins,
      discriminacao: body.servico.discriminacao,
      codigo_municipio_prestacao: '3543402',
      created_by: user.id,
      created_by_ip: ip,
    })
    .select()
    .single();

  if (insertError || !nota) {
    return NextResponse.json({ error: 'Erro ao criar nota', details: insertError?.message }, { status: 500 });
  }

  // ── Audit log ──
  await supabase.from('audit_logs').insert({
    empresa_id: empresa.id,
    user_id: user.id,
    acao: 'nota_criada',
    detalhes: { nota_id: nota.id, numero_rps, valor: body.servico.valorServicos },
    ip,
  });

  return NextResponse.json({
    success: true,
    data: {
      notaId: nota.id,
      numeroRps: numero_rps,
      numeroNfse: nota.numero_nfse,
      codigoVerificacao: nota.codigo_verificacao,
    },
    message: 'Nota criada e enviada para a fila de emissão.',
  });
}

// ── Camada de cálculo de impostos ────────────────
function calcularImpostos(
  base: number,
  aliquotas: Record<string, number>,
  regime: string
) {
  const pct = (v: number, a: number) => parseFloat((v * (a / 100)).toFixed(2));

  if (regime === 'simples_nacional') {
    return {
      iss:    pct(base, aliquotas.iss),
      pis:    0,
      cofins: 0,
      csll:   0,
      irrf:   0,
    };
  }

  return {
    iss:    pct(base, aliquotas.iss),
    pis:    pct(base, aliquotas.pis),
    cofins: pct(base, aliquotas.cofins),
    csll:   pct(base, aliquotas.csll),
    irrf:   base >= 215.05 ? pct(base, aliquotas.irrf) : 0,
  };
}
