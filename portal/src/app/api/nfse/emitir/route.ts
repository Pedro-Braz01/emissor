import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient, getServerSession } from '@/lib/supabase-server';
import { headers } from 'next/headers';

// ── Schema de validação ──────────────────────────────────────────────
const EmitirSchema = z.object({
  tomador_razao_social: z.string().min(2),
  tomador_cnpj_cpf: z.string().min(11),
  tomador_email: z.string().email().optional(),
  tomador_inscricao_municipal: z.string().optional(),
  valor_servicos: z.number().positive(),
  valor_deducoes: z.number().min(0).default(0),
  discriminacao: z.string().min(5),
  codigo_municipio_prestacao: z.string().default('3543402'), // Ribeirão Preto
  data_competencia: z.string().optional(), // YYYY-MM-DD
});

export async function POST(request: Request) {
  // ── Auth ──
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  // ── IP do cliente ──
  const headersList = headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'desconhecido';

  const supabase = createServerSupabaseClient();

  // ── Busca empresa ──
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('id, cnpj, inscricao_municipal, regime_tributario')
    .eq('user_id', session.user.id)
    .single();

  if (empresaError || !empresa) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
  }

  // ── Verifica licença (Kill Switch) ──
  const { data: licenca } = await supabase
    .from('licencas')
    .select('license_active, notas_mes_limite')
    .eq('empresa_id', empresa.id)
    .single();

  if (!licenca?.license_active) {
    return NextResponse.json(
      { error: 'Licença inativa. Entre em contato com o suporte.' },
      { status: 403 }
    );
  }

  // ── Valida body ──
  let body: z.infer<typeof EmitirSchema>;
  try {
    body = EmitirSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Dados inválidos', details: err }, { status: 400 });
  }

  // ── Busca configurações tributárias ──
  const { data: config } = await supabase
    .from('configuracoes_tributarias')
    .select('*')
    .eq('empresa_id', empresa.id)
    .single();

  const aliquotas = {
    iss:    config?.aliquota_iss    ?? 2.0,
    pis:    config?.aliquota_pis    ?? 0.65,
    cofins: config?.aliquota_cofins ?? 3.0,
    csll:   config?.aliquota_csll   ?? 1.0,
    irrf:   config?.aliquota_irrf   ?? 1.5,
  };

  // ── Cálculo de impostos ──
  const baseCalculo = body.valor_servicos - body.valor_deducoes;
  const impostos = calcularImpostos(baseCalculo, aliquotas, empresa.regime_tributario as string);

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
      tomador_razao_social: body.tomador_razao_social,
      tomador_cnpj_cpf: body.tomador_cnpj_cpf,
      tomador_email: body.tomador_email ?? null,
      tomador_inscricao_municipal: body.tomador_inscricao_municipal ?? null,
      valor_servicos: body.valor_servicos,
      valor_deducoes: body.valor_deducoes,
      valor_base_calculo: baseCalculo,
      valor_iss: impostos.iss,
      valor_pis: impostos.pis,
      valor_cofins: impostos.cofins,
      valor_csll: impostos.csll,
      valor_irrf: impostos.irrf,
      valor_liquido: body.valor_servicos - impostos.iss - impostos.irrf - impostos.csll - impostos.pis - impostos.cofins,
      discriminacao: body.discriminacao,
      codigo_municipio_prestacao: body.codigo_municipio_prestacao,
      created_by: session.user.id,
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
    user_id: session.user.id,
    acao: 'nota_criada',
    detalhes: { nota_id: nota.id, numero_rps, valor: body.valor_servicos },
    ip,
  });

  return NextResponse.json({
    success: true,
    nota_id: nota.id,
    numero_rps,
    impostos,
    message: 'Nota criada e enviada para a fila de emissão.',
  });
}

// ── Camada de cálculo de impostos (Strategy Pattern) ────────────────
// Troque esta função em 2026 para IVA/CBS sem mexer no resto do código
function calcularImpostos(
  base: number,
  aliquotas: Record<string, number>,
  regime: string
) {
  const pct = (v: number, a: number) => parseFloat((v * (a / 100)).toFixed(2));

  // Simples Nacional: apenas ISS, sem retenção federal
  if (regime === 'simples_nacional') {
    return {
      iss:    pct(base, aliquotas.iss),
      pis:    0,
      cofins: 0,
      csll:   0,
      irrf:   0,
    };
  }

  // Lucro Presumido / Lucro Real: retenções completas
  return {
    iss:    pct(base, aliquotas.iss),
    pis:    pct(base, aliquotas.pis),
    cofins: pct(base, aliquotas.cofins),
    csll:   pct(base, aliquotas.csll),
    irrf:   base >= 215.05 ? pct(base, aliquotas.irrf) : 0, // Limite IRRF
  };
}
