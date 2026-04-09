import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceRoleKey } from '@/lib/supabase-server';
import { z } from 'zod';

// Service-role client — bypassa RLS completamente
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const CadastroSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(6),
  cnpj: z.string().min(14),
  razao_social: z.string().min(2),
  nome_fantasia: z.string().optional().nullable(),
  inscricao_municipal: z.string().min(1),
  regime_tributario: z.enum(['simples_nacional', 'lucro_presumido', 'lucro_real']),
  telefone: z.string().optional().nullable(),
  endereco_completo: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof CadastroSchema>;
  try {
    body = CadastroSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Dados inválidos', details: err }, { status: 400 });
  }

  const admin = getAdminClient();
  const cnpjLimpo = body.cnpj.replace(/\D/g, '');

  // ── Verifica se CNPJ já existe ──
  const { data: empresaExistente } = await admin
    .from('empresas')
    .select('id, razao_social, email_empresa')
    .eq('cnpj', cnpjLimpo)
    .single();

  if (empresaExistente) {
    // CNPJ já cadastrado — cria solicitação de vínculo
    // Verifica se já existe solicitação pendente deste email
    const { data: solicitacaoExistente } = await admin
      .from('solicitacoes_vinculo')
      .select('id')
      .eq('empresa_id', empresaExistente.id)
      .eq('email_solicitante', body.email)
      .eq('status', 'pendente')
      .single();

    if (!solicitacaoExistente) {
      // Cria solicitação de vínculo
      await admin
        .from('solicitacoes_vinculo')
        .insert({
          empresa_id: empresaExistente.id,
          email_solicitante: body.email,
          nome_solicitante: body.razao_social,
        });

      // Envia email de notificação para o email da empresa
      const emailDestino = empresaExistente.email_empresa;
      if (emailDestino) {
        try {
          // Usa o Supabase Auth para enviar email via SMTP configurado
          // Alternativa: envia via edge function ou resend
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
          const serviceKey = getServiceRoleKey();

          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: emailDestino,
              subject: 'Solicitação de acesso ao emissor NFSe',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #2563eb;">Solicitação de Vínculo</h2>
                  <p>O usuário <strong>${body.email}</strong> está solicitando acesso à empresa <strong>${empresaExistente.razao_social}</strong> no sistema emissor de NFS-e.</p>
                  <p>Para aprovar ou rejeitar esta solicitação, acesse o painel do sistema em <strong>Configurações > Usuários</strong>.</p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                  <p style="color: #6b7280; font-size: 12px;">Este é um email automático do Emissor NFSe.</p>
                </div>
              `,
            }),
          }).catch(() => {
            // Silencia erro de envio — a solicitação já foi salva no banco
            console.warn('Aviso: não foi possível enviar email de notificação de vínculo');
          });
        } catch {
          // Silencia — email é best-effort
        }
      }
    }

    return NextResponse.json(
      { error: 'Esta empresa já possui cadastro. Uma solicitação de acesso foi enviada ao responsável.' },
      { status: 409 }
    );
  }

  // ── Fluxo normal: CNPJ novo ──

  // 1. Cria usuário no Supabase Auth via admin API
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.senha,
    email_confirm: true,
    user_metadata: {
      razao_social: body.razao_social,
      cnpj: cnpjLimpo,
    },
  });

  if (authError) {
    if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const userId = authData.user.id;

  // 2. Cria empresa com service_role (bypassa RLS)
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({
      user_id: userId,
      cnpj: cnpjLimpo,
      razao_social: body.razao_social,
      nome_fantasia: body.nome_fantasia || null,
      inscricao_municipal: body.inscricao_municipal,
      regime_tributario: body.regime_tributario,
      email_empresa: body.email,
      telefone: body.telefone || null,
      endereco_completo: body.endereco_completo || null,
      status_licenca: 'pendente',
    })
    .select('id')
    .single();

  if (empresaError) {
    // Rollback: remove usuário criado
    await admin.auth.admin.deleteUser(userId);

    if (empresaError.message.includes('duplicate') || empresaError.message.includes('unique')) {
      return NextResponse.json({ error: 'Este CNPJ já está cadastrado.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro ao cadastrar empresa: ' + empresaError.message }, { status: 500 });
  }

  // 3. O trigger on_empresa_created já criou automaticamente:
  //    - configuracoes_tributarias (defaults)
  //    - licencas (license_active: true, plano: basico)
  //    - perfis_usuarios (role: owner)
  //
  //    Agora ajustamos a licença para pendente (aguarda pagamento)
  await admin
    .from('licencas')
    .update({ license_active: false })
    .eq('empresa_id', empresa.id);

  // 4. Ajusta alíquotas pelo regime tributário
  const isSN = body.regime_tributario === 'simples_nacional';
  await admin
    .from('configuracoes_tributarias')
    .update({
      aliquota_pis:    isSN ? 0 : 0.65,
      aliquota_cofins: isSN ? 0 : 3.00,
      aliquota_csll:   isSN ? 0 : 1.00,
      aliquota_irrf:   isSN ? 0 : 1.50,
      aliquota_inss:   isSN ? 0 : 11.00,
    })
    .eq('empresa_id', empresa.id);

  return NextResponse.json({ success: true, empresaId: empresa.id });
}
