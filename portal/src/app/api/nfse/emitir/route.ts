import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase';
import { NfseService } from '@/services/nfse-service';
import { getLicenseService } from '@/services/license-service';
import { z } from 'zod';

// ===================
// SCHEMA DE VALIDAÇÃO
// ===================

const emissaoSchema = z.object({
  empresaId: z.string().uuid('ID da empresa inválido'),
  tomador: z.object({
    cpfCnpj: z.string().min(11).max(14),
    razaoSocial: z.string().min(3).max(255),
    email: z.string().email().optional().or(z.literal('')),
    telefone: z.string().optional(),
    endereco: z.object({
      logradouro: z.string().optional(),
      numero: z.string().optional(),
      complemento: z.string().optional(),
      bairro: z.string().optional(),
      codigoMunicipio: z.string().optional(),
      uf: z.string().length(2).optional(),
      cep: z.string().optional(),
    }).optional(),
  }),
  servico: z.object({
    valorServicos: z.number().positive('Valor deve ser maior que zero'),
    discriminacao: z.string().min(10, 'Discriminação muito curta').max(2000),
    itemListaServico: z.string().optional(),
    codigoCnae: z.string().optional(),
    issRetido: z.boolean().default(false),
    aliquota: z.number().optional(),
  }),
  competencia: z.string().optional(),
});

// ===================
// HANDLER
// ===================

export async function POST(request: NextRequest) {
  try {
    // 1. Autentica usuário
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // 2. Busca dados do usuário
    const adminClient = createAdminClient();
    const { data: usuario, error: userError } = await adminClient
      .from('usuarios')
      .select('id, nome, tenant_id, role, empresas_permitidas, ativo')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !usuario || !usuario.ativo) {
      return NextResponse.json(
        { error: 'Usuário não encontrado ou inativo' },
        { status: 403 }
      );
    }

    // 3. Verifica se pode emitir
    if (!['MASTER', 'ADMIN', 'GERENTE', 'OPERADOR'].includes(usuario.role)) {
      return NextResponse.json(
        { error: 'Sem permissão para emitir notas' },
        { status: 403 }
      );
    }

    // 4. Verifica licença
    const licenseService = getLicenseService();
    const { pode, motivo } = await licenseService.podeEmitir(usuario.tenant_id);

    if (!pode) {
      return NextResponse.json(
        { error: motivo },
        { status: 403 }
      );
    }

    // 5. Parse e valida body
    const body = await request.json();
    const validationResult = emissaoSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Dados inválidos',
          details: validationResult.error.errors.map(e => ({
            campo: e.path.join('.'),
            mensagem: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const dados = validationResult.data;

    // 6. Verifica permissão para a empresa
    if (usuario.role === 'OPERADOR') {
      const permitidas = usuario.empresas_permitidas || [];
      if (permitidas.length > 0 && !permitidas.includes(dados.empresaId)) {
        return NextResponse.json(
          { error: 'Sem permissão para emitir notas desta empresa' },
          { status: 403 }
        );
      }
    }

    // 7. Verifica se empresa pertence ao tenant
    const { data: empresa, error: empresaError } = await adminClient
      .from('empresas')
      .select('id, tenant_id')
      .eq('id', dados.empresaId)
      .eq('tenant_id', usuario.tenant_id)
      .eq('ativo', true)
      .single();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { error: 'Empresa não encontrada ou sem acesso' },
        { status: 404 }
      );
    }

    // 8. Emite a nota
    const ambiente = (process.env.NFSE_AMBIENTE as 'homologacao' | 'producao') || 'homologacao';
    const encryptionKey = process.env.CERTIFICATE_ENCRYPTION_KEY!;

    const nfseService = new NfseService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      ambiente,
      encryptionKey
    );

    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';

    const resultado = await nfseService.emitir(
      {
        empresaId: dados.empresaId,
        tomador: {
          cpfCnpj: dados.tomador.cpfCnpj,
          razaoSocial: dados.tomador.razaoSocial,
          email: dados.tomador.email || undefined,
          telefone: dados.tomador.telefone,
          endereco: dados.tomador.endereco,
        },
        servico: {
          valorServicos: dados.servico.valorServicos,
          discriminacao: dados.servico.discriminacao,
          itemListaServico: dados.servico.itemListaServico,
          codigoCnae: dados.servico.codigoCnae,
          issRetido: dados.servico.issRetido,
          aliquota: dados.servico.aliquota,
        },
        competencia: dados.competencia,
      },
      usuario.id,
      usuario.nome,
      clientIp
    );

    // 9. Incrementa contador se sucesso
    if (resultado.success) {
      await licenseService.incrementarNotasMes(usuario.tenant_id);
    }

    // 10. Retorna resultado
    if (resultado.success) {
      return NextResponse.json({
        success: true,
        data: {
          notaId: resultado.notaId,
          numeroRps: resultado.numeroRps,
          serieRps: resultado.serieRps,
          numeroNfse: resultado.numeroNfse,
          codigoVerificacao: resultado.codigoVerificacao,
        },
        message: `NFSe ${resultado.numeroNfse} emitida com sucesso!`,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: resultado.error,
        errors: resultado.errors,
        data: {
          notaId: resultado.notaId,
          numeroRps: resultado.numeroRps,
        },
      }, { status: 422 });
    }

  } catch (error) {
    console.error('Erro na emissão:', error);
    
    return NextResponse.json(
      { 
        error: 'Erro interno ao processar emissão',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
