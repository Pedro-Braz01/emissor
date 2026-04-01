'use client';

import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase-client';

// ---- Tipos ----
type Nota = {
  id: string;
  numero_rps: number;
  numero_nfse: string | null;
  tomador_razao_social: string;
  valor_servicos: number;
  valor_iss: number;
  status: string;
  created_at: string;
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
  pendentes: number;
  valor_total: number;
  iss_total: number;
};

type Props = { empresa: Empresa; notas: Nota[]; totais: Totais; userEmail: string };

// ---- Helpers ----
const STATUS_STYLE: Record<string, string> = {
  emitida:    'bg-green-500/10 text-green-400 border-green-500/20',
  cancelada:  'bg-red-500/10 text-red-400 border-red-500/20',
  substituida:'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  pendente:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  erro:       'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Componente ----
export default function DashboardClient({ empresa, notas, totais, userEmail }: Props) {
  const router = useRouter();
  const licenca = empresa?.licencas?.[0];
  const ativa = licenca?.license_active ?? false;

  async function handleLogout() {
    await createClientSupabaseClient().auth.signOut();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-900">

      {/* ── Header ── */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">Emissor NFSe</p>
              <p className="text-gray-500 text-xs">Ribeirão Preto</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className={`hidden sm:inline-flex px-2.5 py-1 rounded-full text-xs font-medium border
              ${ativa ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
              {ativa ? '● Licença Ativa' : '● Licença Bloqueada'}
            </span>
            <span className="text-gray-400 text-sm hidden md:block">{userEmail}</span>
            <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm transition-colors">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Alerta licença bloqueada ── */}
        {!ativa && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-red-400 font-medium text-sm">Licença bloqueada</p>
              <p className="text-red-400/70 text-xs mt-0.5">A emissão está suspensa. Entre em contato com o suporte.</p>
            </div>
          </div>
        )}

        {/* ── Empresa ── */}
        {empresa && (
          <div>
            <h2 className="text-white font-semibold text-xl">{empresa.razao_social}</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              CNPJ: {empresa.cnpj} &middot; IM: {empresa.inscricao_municipal} &middot;&nbsp;
              {empresa.regime_tributario.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </p>
          </div>
        )}

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Emitidas"    value={String(totais.emitidas)}        color="green"  emoji="📄" />
          <StatCard label="Pendentes"   value={String(totais.pendentes)}       color="blue"   emoji="⏳" />
          <StatCard label="Canceladas"  value={String(totais.canceladas)}      color="red"    emoji="❌" />
          <StatCard label="Faturado"    value={fmt(totais.valor_total)}        color="purple" emoji="💰" />
          <StatCard label="ISS Retido"  value={fmt(totais.iss_total)}          color="yellow" emoji="🏛️" />
        </div>

        {/* ── Tabela de notas ── */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-medium">Notas Fiscais</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/notas/lote')}
                disabled={!ativa}
                className="text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-sm px-3 py-1.5 rounded-lg
                           border border-gray-600 hover:border-gray-500 transition-colors"
              >
                Importar Lote
              </button>
              <button
                onClick={() => router.push('/notas/emitir')}
                disabled={!ativa}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                           text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
              >
                + Nova Nota
              </button>
            </div>
          </div>

          {notas.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-gray-500 text-sm">Nenhuma nota emitida ainda.</p>
              <p className="text-gray-600 text-xs mt-1">Clique em &ldquo;+ Nova Nota&rdquo; para começar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase">
                    <th className="text-left px-6 py-3 font-medium">RPS</th>
                    <th className="text-left px-6 py-3 font-medium">NFSe</th>
                    <th className="text-left px-6 py-3 font-medium">Tomador</th>
                    <th className="text-right px-6 py-3 font-medium">Valor</th>
                    <th className="text-right px-6 py-3 font-medium">ISS</th>
                    <th className="text-center px-6 py-3 font-medium">Status</th>
                    <th className="text-right px-6 py-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {notas.map(nota => (
                    <tr key={nota.id} className="hover:bg-gray-700/30 transition-colors cursor-pointer"
                        onClick={() => router.push(`/notas/${nota.id}`)}>
                      <td className="px-6 py-3 text-gray-300 font-mono">#{nota.numero_rps}</td>
                      <td className="px-6 py-3 text-gray-300">{nota.numero_nfse ?? '—'}</td>
                      <td className="px-6 py-3 text-gray-300 max-w-[180px] truncate">{nota.tomador_razao_social}</td>
                      <td className="px-6 py-3 text-gray-300 text-right font-mono">{fmt(nota.valor_servicos)}</td>
                      <td className="px-6 py-3 text-gray-300 text-right font-mono">{fmt(nota.valor_iss)}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[nota.status] ?? 'bg-gray-700 text-gray-400'}`}>
                          {capitalize(nota.status)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-right">{fmtDate(nota.created_at)}</td>
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

// ── StatCard ──
function StatCard({ label, value, color, emoji }: {
  label: string; value: string; color: string; emoji: string;
}) {
  const palette: Record<string, string> = {
    green:  'border-green-500/20  bg-green-500/5',
    blue:   'border-blue-500/20   bg-blue-500/5',
    red:    'border-red-500/20    bg-red-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5',
    yellow: 'border-yellow-500/20 bg-yellow-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${palette[color] ?? 'border-gray-700 bg-gray-800'}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-base">{emoji}</span>
        <span className="text-gray-400 text-xs">{label}</span>
      </div>
      <p className="text-white font-semibold text-base truncate">{value}</p>
    </div>
  );
}
