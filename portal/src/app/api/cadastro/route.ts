import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Service-role client — bypassa RLS completamente
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
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

  // 1. Cria usuário no Supabase Auth via admin API (sem exigir confirmação de email)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.senha,
    email_confirm: true, // confirma automaticamente — email de boas-vindas é enviado pelo Supabase
    user_metadata: {
      razao_social: body.razao_social,
      cnpj: body.cnpj.replace(/\D/g, ''),
    },
  });

  if (authError) {
    if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const userId = authData.user.id;

  // 2. Cria empresa com service_role (bypassa RLS — user ainda sem sessão ativa)
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({
      user_id: userId,
      cnpj: body.cnpj.replace(/\D/g, ''),
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
    // Rollback: remove usuário criado para não deixar órfão
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
  //    Agora ajustamos a licença para pendente (aguarda confirmação de pagamento)
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
