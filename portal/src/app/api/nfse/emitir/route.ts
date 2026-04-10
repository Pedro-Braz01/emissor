import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient, getServiceRoleKey } from '@/lib/supabase-server';
import { createNfseService } from '@/services/nfse-service';
import { headers } from 'next/headers';

// ── Schema de validação ──
const EmitirSchema = z.object({
  empresaId: z.string().uuid(),
  tomador: z.object({
    cpfCnpj: z.string().min(11).max(18).refine((val) => {
      const digits = val.replace(/\D/g, '');
      return digits.length === 11 || digits.length === 14;
    }, 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos'),
    razaoSocial: z.string().min(2).max(200),
    email: z.string().email().optional().or(z.literal('')),
    telefone: z.string().optional(),
    endereco: z.object({
      cep: z.string().optional(),
      logradouro: z.string().optional(),
      numero: z.string().optional(),
      complemento: z.string().optional(),
      bairro: z.string().optional(),
      uf: z.string().max(2).optional(),
      codigoMunicipio: z.string().optional(),
    }).optional(),
  }),
  servico: z.object({
    valorServicos: z.number().positive(),
    discriminacao: z.string().min(5),
    itemListaServico: z.string().optional(),
    issRetido: z.boolean().default(false),
    codigoCnae: z.string().optional(),
    codigoNbs: z.string().optional(),
    aliquota: z.number().min(0).max(1).optional(),
  }),
  retencoes: z.object({
    pis: z.number().default(0),
    cofins: z.number().default(0),
    inss: z.number().default(0),
    irrf: z.number().default(0),
    csll: z.number().default(0),
  }).optional(),
  enviarParaTomador: z.boolean().default(false),
});

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  // ── Auth ──
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // ── IP ──
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
    const zodErrors = err instanceof z.ZodError
      ? err.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      : ['Formato de dados inválido'];
    return NextResponse.json({ error: 'Dados inválidos', details: zodErrors }, { status: 400 });
  }

  // ── Verifica permissão na empresa ──
  const { data: perfil } = await supabase
    .from('perfis_usuarios')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', body.empresaId)
    .eq('ativo', true)
    .maybeSingle();

  const { data: empresaOwner } = await supabase
    .from('empresas')
    .select('user_id')
    .eq('id', body.empresaId)
    .maybeSingle();

  if (!empresaOwner) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
  }

  if (!perfil && empresaOwner.user_id !== user.id) {
    return NextResponse.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
  }

  // ── Verifica licença ──
  const { data: licenca } = await supabase
    .from('licencas')
    .select('*')
    .eq('empresa_id', body.empresaId)
    .maybeSingle();

  if (!licenca) {
    return NextResponse.json(
      { error: 'Licença não encontrada. Entre em contato com o suporte.' },
      { status: 403 }
    );
  }

  if (!licenca.license_active) {
    return NextResponse.json(
      { error: 'Licença inativa. Entre em contato com o suporte.' },
      { status: 403 }
    );
  }

  // ── Verifica limite mensal ──
  if ((licenca.notas_mes_atual || 0) >= (licenca.notas_mes_limite || 50)) {
    return NextResponse.json(
      { error: `Limite mensal de ${licenca.notas_mes_limite} notas atingido.` },
      { status: 403 }
    );
  }

  // ── Verifica expiração ──
  if (licenca.data_expiracao && new Date(licenca.data_expiracao) < new Date()) {
    return NextResponse.json(
      { error: 'Licença expirada. Entre em contato com o suporte.' },
      { status: 403 }
    );
  }

  // ── Emite via NfseService ──
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = getServiceRoleKey();
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json({ error: 'Chave de criptografia não configurada. Defina ENCRYPTION_KEY.' }, { status: 500 });
  }
  const ambiente = (process.env.NFSE_AMBIENTE || 'homologacao') as 'homologacao' | 'producao';

  const nfseService = createNfseService(supabaseUrl, supabaseKey, ambiente, encryptionKey);

  const result = await nfseService.emitir(
    {
      empresaId: body.empresaId,
      tomador: {
        cpfCnpj: body.tomador.cpfCnpj,
        razaoSocial: body.tomador.razaoSocial,
        email: body.tomador.email || undefined,
        telefone: body.tomador.telefone || undefined,
        endereco: body.tomador.endereco ? {
          logradouro: body.tomador.endereco.logradouro,
          numero: body.tomador.endereco.numero,
          complemento: body.tomador.endereco.complemento,
          bairro: body.tomador.endereco.bairro,
          cep: body.tomador.endereco.cep,
          uf: body.tomador.endereco.uf,
          codigoMunicipio: body.tomador.endereco.codigoMunicipio || '3543402',
        } : undefined,
      },
      servico: {
        valorServicos: body.servico.valorServicos,
        discriminacao: body.servico.discriminacao,
        itemListaServico: body.servico.itemListaServico,
        codigoCnae: body.servico.codigoCnae,
        codigoNbs: body.servico.codigoNbs,
        issRetido: body.servico.issRetido,
        aliquota: body.servico.aliquota,
      },
      retencoes: body.retencoes ? {
        pis: body.retencoes.pis,
        cofins: body.retencoes.cofins,
        inss: body.retencoes.inss,
        irrf: body.retencoes.irrf,
        csll: body.retencoes.csll,
      } : undefined,
    },
    user.id,
    user.email || 'Usuário',
    ip
  );

  // ── Incrementa contador mensal ──
  if (result.success) {
    await supabase.rpc('incrementar_notas_mes', { p_empresa_id: body.empresaId });

    // ── Audit log ──
    await supabase.from('audit_logs').insert({
      empresa_id: body.empresaId,
      user_id: user.id,
      acao: 'nfse_emitida',
      detalhes: {
        nota_id: result.notaId,
        numero_rps: result.numeroRps,
        numero_nfse: result.numeroNfse,
        codigo_verificacao: result.codigoVerificacao,
        valor: body.servico.valorServicos,
      },
      ip,
    });
  }

  if (result.success) {
    return NextResponse.json({
      success: true,
      data: {
        notaId: result.notaId,
        numeroRps: result.numeroRps,
        numeroNfse: result.numeroNfse,
        codigoVerificacao: result.codigoVerificacao,
        linkNfse: result.linkNfse,
      },
      message: 'NFSe emitida com sucesso!',
    });
  } else {
    // Nota was created but emission failed - return the error with nota ID
    return NextResponse.json({
      success: false,
      error: result.error,
      errors: result.errors,
      data: {
        notaId: result.notaId,
        numeroRps: result.numeroRps,
      },
    }, { status: 422 });
  }
}
