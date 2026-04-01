// Server Component — SEM "use client"
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  const { data: empresa } = await supabase
    .from('empresas')
    .select('*, licencas(*)')
    .eq('user_id', session.user.id)
    .single();

  const { data: notas } = await supabase
    .from('notas_fiscais')
    .select('id, numero_rps, numero_nfse, tomador_razao_social, valor_servicos, valor_iss, status, created_at')
    .eq('empresa_id', empresa?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: stats } = await supabase
    .from('notas_fiscais')
    .select('status, valor_servicos, valor_iss')
    .eq('empresa_id', empresa?.id ?? '');

  const emitidas = stats?.filter(n => n.status === 'emitida') ?? [];

  const totais = {
    emitidas: emitidas.length,
    canceladas: stats?.filter(n => n.status === 'cancelada').length ?? 0,
    pendentes: stats?.filter(n => n.status === 'pendente').length ?? 0,
    valor_total: emitidas.reduce((acc, n) => acc + (n.valor_servicos ?? 0), 0),
    iss_total: emitidas.reduce((acc, n) => acc + (n.valor_iss ?? 0), 0),
  };

  return (
    <DashboardClient
      empresa={empresa}
      notas={notas ?? []}
      totais={totais}
      userEmail={session.user.email ?? ''}
    />
  );
}
