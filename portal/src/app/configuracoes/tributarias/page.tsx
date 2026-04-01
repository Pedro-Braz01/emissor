// Server Component
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import ConfiguracoesTributariasClient from './ConfiguracoesTributariasClient';

export default async function ConfiguracoesTributariasPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: empresa } = await supabase
    .from('empresas')
    .select('id, razao_social, regime_tributario')
    .eq('user_id', session.user.id)
    .single();

  if (!empresa) redirect('/dashboard');

  const { data: config } = await supabase
    .from('configuracoes_tributarias')
    .select('*')
    .eq('empresa_id', empresa.id)
    .single();

  return (
    <ConfiguracoesTributariasClient
      empresa={empresa}
      config={config}
    />
  );
}
