'use client';

import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase-client';

type Nota = {
  id: string;
  numero_rps: number;
  tomador_razao_social: string;
  valor_servicos: number;
  valor_iss: number;
  status: string;
  created_at: string;
  numero_nfse: string | null;
};

type Empresa = {
  razao_social: string;
  cnpj: string;
  inscricao_municipal: string;
  regime_tributario: string;
  licencas?: { license_active: boolean; data_expiracao: string | null }[];
} | null;

type Totais = {
  emitidas: number;
  canceladas: number;
  valor_total: number;
  iss_total: number;
};

type Props = {
  empresa: Empresa;
  notas: Nota[];
  totais: Totais;
  userEmail: string;
};

const STATUS_COLORS: Record<string, string> = {
  emitida: 'bg-green-500/10 text-green-400 border-green-500/20',
  cancelada: 'bg-red-500/10 text-red-400 border-red-500/20',
  substituida: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  pendente: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  erro: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR');
}

export default function DashboardClient({ empresa, notas, totais, userEmail }: Props) {
  const router = useRouter();
  const licenca = empresa?.licencas?.[0];
  const isActive = licenca?.license_active ?? false;

  async function handleLogout() {
    const supabase = createClientSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">Emissor NFSe</h1>
              <p className="text-gray-500 text-xs">Ribeirão Preto</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Status da licença */}
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${isActive ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
              {isActive ? '● Licença Ativa' : '● Licença Bloqueada'}
            </span>

            <span className="text-gray-400 text-sm">{userEmail}</span>

            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Alerta licença bloqueada */}
        {!isActive && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-red-400 font-medium text-sm">Licença bloqueada</p>
              <p className="text-red-400/70 text-xs">Entre em contato com o suporte para reativar.</p>
            </div>
          </div>
        )}

        {/* Empresa info */}
        {empresa && (
          <div className="mb-6">
            <h2 className="text-white font-semibold text-lg">{empresa.razao_social}</h2>
            <p className="text-gray-400 text-sm">CNPJ: {empresa.cnpj} • IM: {empresa.inscricao_municipal} • {empresa.regime_tributario.replace('_', ' ').toUpperCase()}</p>
          </div>
        )}

        {/* Cards de estatísticas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Notas Emitidas"
            value={totais.emitidas.toString()}
            icon="📄"
            color="blue"
          />
          <StatCard
            label="Canceladas"
            value={totais.canceladas.toString()}
            icon="❌"
            color="red"
          />
          <StatCard
            label="Faturamento Total"
            value={formatCurrency(totais.valor_total)}
            icon="💰"
            color="green"
          />
          <StatCard
            label="ISS Retido"
            value={formatCurrency(totais.iss_total)}
            icon="🏛️"
            color="yellow"
          />
        </div>

        {/* Tabela de notas */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-medium">Últimas Notas Fiscais</h3>
            <button
              onClick={() => router.push('/notas/emitir')}
              disabled={!isActive}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
            >
              + Nova Nota
            </button>
          </div>

          {notas.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-500">Nenhuma nota emitida ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">RPS</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">NFSe</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Tomador</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">Valor</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">ISS</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {notas.map((nota) => (
                    <tr key={nota.id} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-3 text-gray-300 text-sm font-mono">#{nota.numero_rps}</td>
                      <td className="px-6 py-3 text-gray-300 text-sm">{nota.numero_nfse ?? '—'}</td>
                      <td className="px-6 py-3 text-gray-300 text-sm max-w-[200px] truncate">{nota.tomador_razao_social}</td>
                      <td className="px-6 py-3 text-gray-300 text-sm text-right font-mono">{formatCurrency(nota.valor_servicos)}</td>
                      <td className="px-6 py-3 text-gray-300 text-sm text-right font-mono">{formatCurrency(nota.valor_iss)}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[nota.status] ?? 'bg-gray-700 text-gray-400'}`}>
                          {nota.status.charAt(0).toUpperCase() + nota.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-sm text-right">{formatDate(nota.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string;
  value: string;
  icon: string;
  color: 'blue' | 'red' | 'green' | 'yellow';
}) {
  const colors = {
    blue: 'border-blue-500/20 bg-blue-500/5',
    red: 'border-red-500/20 bg-red-500/5',
    green: 'border-green-500/20 bg-green-500/5',
    yellow: 'border-yellow-500/20 bg-yellow-500/5',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-gray-400 text-xs">{label}</span>
      </div>
      <p className="text-white font-semibold text-lg">{value}</p>
    </div>
  );
}
