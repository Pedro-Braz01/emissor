import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient, getServiceRoleKey } from '@/lib/supabase-server';
import { createNfseService } from '@/services/nfse-service';
import { headers } from 'next/headers';

const CancelarSchema = z.object({
  empresaId: z.string().uuid(),
  numeroNfse: z.number().positive(),
  codigoCancelamento: z.enum(['1', '2', '4']).default('1'),
  motivo: z.string().optional(),
});

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

  let body: z.infer<typeof CancelarSchema>;
  try {
    body = CancelarSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Dados inválidos', details: err }, { status: 400 });
  }

  // ── Verifica permissão na empresa ──
  const { data: perfil } = await supabase
    .from('perfis_usuarios')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', body.empresaId)
    .eq('ativo', true)
    .single();

  const { data: empresaOwner } = await supabase
    .from('empresas')
    .select('user_id')
    .eq('id', body.empresaId)
    .single();

  if (!perfil && empresaOwner?.user_id !== user.id) {
    return NextResponse.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = getServiceRoleKey();
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json({ error: 'Chave de criptografia não configurada. Defina ENCRYPTION_KEY.' }, { status: 500 });
  }
  const ambiente = (process.env.NFSE_AMBIENTE || 'homologacao') as 'homologacao' | 'producao';

  const nfseService = createNfseService(supabaseUrl, supabaseKey, ambiente, encryptionKey);

  const result = await nfseService.cancelar(
    {
      empresaId: body.empresaId,
      numeroNfse: body.numeroNfse,
      codigoCancelamento: body.codigoCancelamento,
      motivo: body.motivo,
    },
    user.id,
    ip
  );

  if (result.success) {
    await supabase.from('audit_logs').insert({
      empresa_id: body.empresaId,
      user_id: user.id,
      acao: 'nfse_cancelada',
      detalhes: { numero_nfse: body.numeroNfse, motivo: body.motivo },
      ip,
    });

    return NextResponse.json({ success: true, message: 'NFSe cancelada com sucesso' });
  }

  return NextResponse.json(
    { success: false, error: result.error, errors: result.errors },
    { status: 422 }
  );
}
