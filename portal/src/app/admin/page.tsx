'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCpfCnpj, formatDate } from '@/lib/utils';
import {
  Shield,
  Building2,
  Search,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

interface Licenca {
  id: string;
  license_active: boolean;
  plano: string;
  data_expiracao: string | null;
  notas_mes_limite: number;
}

interface Empresa {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  inscricao_municipal: string;
  regime_tributario: string;
  email_empresa: string | null;
  telefone: string | null;
  created_at: string;
  total_notas: number;
  licenca: Licenca | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativas' | 'inativas'>('todos');
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadEmpresas();
  }, []);

  async function loadEmpresas() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/empresas');
      if (res.status === 403) {
        router.push('/dashboard');
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEmpresas(data.empresas || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleLicenca(empresaId: string, currentActive: boolean) {
    setToggling(empresaId);
    try {
      const res = await fetch('/api/admin/licencas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaId,
          license_active: !currentActive,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setEmpresas(prev => prev.map(e => {
        if (e.id !== empresaId) return e;
        return {
          ...e,
          licenca: e.licenca
            ? { ...e.licenca, license_active: !currentActive }
            : { id: '', license_active: !currentActive, plano: 'basico', data_expiracao: null, notas_mes_limite: 50 },
        };
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  }

  const filtradas = empresas.filter(e => {
    const matchBusca = !busca ||
      e.razao_social.toLowerCase().includes(busca.toLowerCase()) ||
      e.cnpj.includes(busca.replace(/\D/g, '')) ||
      (e.email_empresa || '').toLowerCase().includes(busca.toLowerCase());

    const ativa = e.licenca?.license_active ?? false;
    const matchStatus =
      filtroStatus === 'todos' ||
      (filtroStatus === 'ativas' && ativa) ||
      (filtroStatus === 'inativas' && !ativa);

    return matchBusca && matchStatus;
  });

  const totalAtivas = empresas.filter(e => e.licenca?.license_active).length;
  const totalInativas = empresas.length - totalAtivas;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Painel Admin</p>
              <p className="text-gray-500 text-xs">{'Gestão de Empresas e Licenças'}</p>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-white text-sm transition-colors">
            Voltar ao Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total de Empresas" value={empresas.length} color="blue" />
          <StatCard label={'Licenças Ativas'} value={totalAtivas} color="green" />
          <StatCard label={'Licenças Inativas'} value={totalInativas} color="red" />
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, CNPJ ou email..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm
                         placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="todos">Todos</option>
            <option value="ativas">Ativas</option>
            <option value="inativas">Inativas</option>
          </select>
          <button onClick={loadEmpresas}
            className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-300
                       hover:bg-gray-700 transition-colors text-sm">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma empresa encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map(empresa => {
              const ativa = empresa.licenca?.license_active ?? false;
              const expanded = expandedId === empresa.id;

              return (
                <div key={empresa.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`w-3 h-3 rounded-full shrink-0 ${ativa ? 'bg-green-400' : 'bg-red-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium text-sm truncate">{empresa.razao_social}</p>
                        <p className="text-gray-500 text-xs">
                          {formatCpfCnpj(empresa.cnpj)} &middot; {empresa.total_notas} notas &middot; Desde {formatDate(empresa.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium
                        ${ativa ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                        {ativa ? 'Ativa' : 'Inativa'}
                      </span>

                      <button
                        onClick={() => toggleLicenca(empresa.id, ativa)}
                        disabled={toggling === empresa.id}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50
                          ${ativa
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                            : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                          }`}
                      >
                        {toggling === empresa.id ? '...' : ativa ? 'Desativar' : 'Ativar'}
                      </button>

                      <button onClick={() => setExpandedId(expanded ? null : empresa.id)}
                        className="text-gray-500 hover:text-white transition-colors">
                        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-5 pb-4 pt-0 border-t border-gray-700 mt-0">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Email</p>
                          <p className="text-gray-300">{empresa.email_empresa || '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Telefone</p>
                          <p className="text-gray-300">{empresa.telefone || '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Regime</p>
                          <p className="text-gray-300">{empresa.regime_tributario.replace(/_/g, ' ')}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Plano</p>
                          <p className="text-gray-300">{empresa.licenca?.plano || 'basico'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">IM</p>
                          <p className="text-gray-300">{empresa.inscricao_municipal}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">{'Limite Notas/Mês'}</p>
                          <p className="text-gray-300">{empresa.licenca?.notas_mes_limite || 50}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">{'Expiração'}</p>
                          <p className="text-gray-300">{empresa.licenca?.data_expiracao ? formatDate(empresa.licenca.data_expiracao) : 'Sem limite'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Total Notas</p>
                          <p className="text-gray-300">{empresa.total_notas}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-500/20 bg-blue-500/5',
    green: 'border-green-500/20 bg-green-500/5',
    red: 'border-red-500/20 bg-red-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-white font-bold text-2xl">{value}</p>
    </div>
  );
}
