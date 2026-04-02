// Server Component — SEM "use client"
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: empresa } = await supabase
    .from('empresas')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Busca licenças separadamente
  const { data: licencas } = empresa
    ? await supabase.from('licencas').select('*').eq('empresa_id', empresa.id)
    : { data: null };

  const empresaComLicenca = empresa
    ? { ...empresa, licencas: licencas ?? [] }
    : null;

  const empresaId = empresa?.id ?? '';

  const { data: notas } = await supabase
    .from('notas_fiscais')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: stats } = await supabase
    .from('notas_fiscais')
    .select('*')
    .eq('empresa_id', empresaId);

  const allStats = stats ?? [];
  const emitidas = allStats.filter((n: any) => n.status === 'emitida');

  const totais = {
    emitidas: emitidas.length,
    canceladas: allStats.filter((n: any) => n.status === 'cancelada').length,
    pendentes: allStats.filter((n: any) => n.status === 'pendente').length,
    valor_total: emitidas.reduce((acc: number, n: any) => acc + (n.valor_servicos ?? 0), 0),
    iss_total: emitidas.reduce((acc: number, n: any) => acc + (n.valor_iss ?? 0), 0),
  };

  return (
    <DashboardClient
      empresa={empresaComLicenca}
      notas={notas ?? []}
      totais={totais}
      userEmail={user.email ?? ''}
    />
  );
}
