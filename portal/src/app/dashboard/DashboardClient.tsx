'use client';

import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/dashboard-layout';

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
  emitida:    'bg-green-100 text-green-700',
  cancelada:  'bg-red-100 text-red-700',
  substituida:'bg-yellow-100 text-yellow-700',
  pendente:   'bg-blue-100 text-blue-700',
  erro:       'bg-orange-100 text-orange-700',
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

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Alerta licença bloqueada */}
        {!ativa && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-red-800 font-medium text-sm">{'Licença bloqueada'}</p>
              <p className="text-red-600 text-xs mt-0.5">{'A emissão está suspensa. Entre em contato com o suporte.'}</p>
            </div>
          </div>
        )}

        {/* Empresa info */}
        {empresa && (
          <div>
            <h2 className="text-xl font-bold text-gray-900">{empresa.razao_social}</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              CNPJ: {empresa.cnpj} &middot; IM: {empresa.inscricao_municipal} &middot;&nbsp;
              {empresa.regime_tributario.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </p>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Emitidas"    value={String(totais.emitidas)}   color="green" />
          <StatCard label="Pendentes"   value={String(totais.pendentes)}  color="blue" />
          <StatCard label="Canceladas"  value={String(totais.canceladas)} color="red" />
          <StatCard label="Faturado"    value={fmt(totais.valor_total)}   color="purple" />
          <StatCard label="ISS Retido"  value={fmt(totais.iss_total)}     color="yellow" />
        </div>

        {/* Tabela de notas */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Notas Fiscais Recentes</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/notas')}
                className="text-gray-500 hover:text-gray-700 text-sm px-3 py-1.5 rounded-lg
                           border border-gray-300 hover:border-gray-400 transition-colors"
              >
                Ver Todas
              </button>
              <button
                onClick={() => router.push('/emitir')}
                disabled={!ativa}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed
                           text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
              >
                + Nova Nota
              </button>
            </div>
          </div>

          {notas.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-gray-400 text-sm">Nenhuma nota emitida ainda.</p>
              <p className="text-gray-300 text-xs mt-1">{'Clique em "+ Nova Nota" para começar.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="text-left px-6 py-3 font-medium">RPS</th>
                    <th className="text-left px-6 py-3 font-medium">NFSe</th>
                    <th className="text-left px-6 py-3 font-medium">Tomador</th>
                    <th className="text-right px-6 py-3 font-medium">Valor</th>
                    <th className="text-right px-6 py-3 font-medium">ISS</th>
                    <th className="text-center px-6 py-3 font-medium">Status</th>
                    <th className="text-right px-6 py-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {notas.map(nota => (
                    <tr key={nota.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/notas`)}>
                      <td className="px-6 py-3 text-gray-900 font-mono">#{nota.numero_rps}</td>
                      <td className="px-6 py-3 text-gray-600">{nota.numero_nfse ?? '—'}</td>
                      <td className="px-6 py-3 text-gray-600 max-w-[180px] truncate">{nota.tomador_razao_social}</td>
                      <td className="px-6 py-3 text-gray-900 text-right font-mono">{fmt(nota.valor_servicos)}</td>
                      <td className="px-6 py-3 text-gray-600 text-right font-mono">{fmt(nota.valor_iss)}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[nota.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {capitalize(nota.status)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500 text-right">{fmtDate(nota.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ── StatCard ──
function StatCard({ label, value, color }: {
  label: string; value: string; color: string;
}) {
  const palette: Record<string, string> = {
    green:  'border-green-200 bg-green-50 text-green-700',
    blue:   'border-blue-200 bg-blue-50 text-blue-700',
    red:    'border-red-200 bg-red-50 text-red-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${palette[color] ?? 'border-gray-200 bg-white'}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="font-bold text-lg truncate">{value}</p>
    </div>
  );
}
