import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
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
