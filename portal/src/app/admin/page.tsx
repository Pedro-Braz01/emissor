'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatCpfCnpj, formatDate } from '@/lib/utils';
import { createClientSupabaseClient } from '@/lib/supabase-client';
import {
  Shield,
  Building2,
  Search,
  RefreshCw,
  ChevronDown,
  Users,
  Settings,
  Plus,
  KeyRound,
  UserCheck,
  UserX,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

const MASTER_EMAIL = 'pedro.souza53321+dev@gmail.com';

// ─── Types ───────────────────────────────────────────────────────────

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

interface UsuarioPerfil {
  empresa_id: string;
  razao_social: string;
  role: string;
  ativo: boolean;
}

interface Usuario {
  id: string;
  email: string;
  created_at: string;
  perfis: UsuarioPerfil[];
}

type TabKey = 'empresas' | 'usuarios' | 'configuracoes';

// ─── Main Component ──────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('empresas');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [loadingAuth, setLoadingAuth] = useState(true);

  const isMaster = currentUserEmail === MASTER_EMAIL;

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setCurrentUserEmail(user.email);
        }
      } catch {
        // ignore
      } finally {
        setLoadingAuth(false);
      }
    }
    fetchCurrentUser();
  }, []);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; masterOnly?: boolean }[] = [
    { key: 'empresas', label: 'Empresas', icon: <Building2 className="w-4 h-4" /> },
    { key: 'usuarios', label: 'Usuarios', icon: <Users className="w-4 h-4" /> },
    { key: 'configuracoes', label: 'Configuracoes', icon: <Settings className="w-4 h-4" />, masterOnly: true },
  ];

  const visibleTabs = tabs.filter(t => !t.masterOnly || isMaster);

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Painel Admin</p>
              <p className="text-gray-500 text-xs">
                {isMaster ? 'Master' : 'Staff'} &middot; {currentUserEmail}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-gray-800/50 border-b border-gray-700 sticky top-[65px] z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab.key
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'empresas' && <EmpresasTab />}
        {activeTab === 'usuarios' && <UsuariosTab isMaster={isMaster} />}
        {activeTab === 'configuracoes' && isMaster && <ConfiguracoesTab />}
      </main>
    </div>
  );
}

// ─── Empresas Tab (original) ─────────────────────────────────────────

function EmpresasTab() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativas' | 'inativas'>('todos');
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEmpresas = useCallback(async () => {
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
  }, [router]);

  useEffect(() => {
    loadEmpresas();
  }, [loadEmpresas]);

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

      setEmpresas(prev =>
        prev.map(e => {
          if (e.id !== empresaId) return e;
          return {
            ...e,
            licenca: e.licenca
              ? { ...e.licenca, license_active: !currentActive }
              : { id: '', license_active: !currentActive, plano: 'basico', data_expiracao: null, notas_mes_limite: 50 },
          };
        })
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  }

  const filtradas = empresas.filter(e => {
    const matchBusca =
      !busca ||
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
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total de Empresas" value={empresas.length} color="blue" />
        <StatCard label="Licencas Ativas" value={totalAtivas} color="green" />
        <StatCard label="Licencas Inativas" value={totalInativas} color="red" />
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
        <button
          onClick={loadEmpresas}
          className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-300
                     hover:bg-gray-700 transition-colors text-sm"
        >
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
                        {formatCpfCnpj(empresa.cnpj)} &middot; {empresa.total_notas} notas &middot; Desde{' '}
                        {formatDate(empresa.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium
                      ${
                        ativa
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}
                    >
                      {ativa ? 'Ativa' : 'Inativa'}
                    </span>

                    <button
                      onClick={() => toggleLicenca(empresa.id, ativa)}
                      disabled={toggling === empresa.id}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50
                        ${
                          ativa
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                            : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                        }`}
                    >
                      {toggling === empresa.id ? '...' : ativa ? 'Desativar' : 'Ativar'}
                    </button>

                    <button
                      onClick={() => setExpandedId(expanded ? null : empresa.id)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
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
                        <p className="text-gray-500 text-xs">Limite Notas/Mes</p>
                        <p className="text-gray-300">{empresa.licenca?.notas_mes_limite || 50}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Expiracao</p>
                        <p className="text-gray-300">
                          {empresa.licenca?.data_expiracao ? formatDate(empresa.licenca.data_expiracao) : 'Sem limite'}
                        </p>
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
    </div>
  );
}

// ─── Usuarios Tab ────────────────────────────────────────────────────

function UsuariosTab({ isMaster }: { isMaster: boolean }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<Usuario | null>(null);

  // Toggling perfil ativo
  const [togglingPerfil, setTogglingPerfil] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, empresasRes] = await Promise.all([
        fetch('/api/admin/usuarios'),
        fetch('/api/admin/empresas'),
      ]);
      const usersData = await usersRes.json();
      const empresasData = await empresasRes.json();
      if (usersData.error) throw new Error(usersData.error);
      if (empresasData.error) throw new Error(empresasData.error);
      setUsuarios(usersData.usuarios || []);
      setEmpresas(empresasData.empresas || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function togglePerfilAtivo(userId: string, empresaId: string, currentAtivo: boolean) {
    const key = `${userId}-${empresaId}`;
    setTogglingPerfil(key);
    try {
      const res = await fetch(`/api/admin/usuarios/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfis: [{ empresa_id: empresaId, ativo: !currentAtivo }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setUsuarios(prev =>
        prev.map(u => {
          if (u.id !== userId) return u;
          return {
            ...u,
            perfis: u.perfis.map(p =>
              p.empresa_id === empresaId ? { ...p, ativo: !currentAtivo } : p
            ),
          };
        })
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTogglingPerfil(null);
    }
  }

  const filtrados = usuarios.filter(u => {
    if (!busca) return true;
    const lower = busca.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(lower) ||
      u.perfis.some(p => p.razao_social.toLowerCase().includes(lower))
    );
  });

  const roleLabel = (role: string) => {
    const map: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Admin',
      emissor: 'Emissor',
      visualizador: 'Visualizador',
    };
    return map[role] || role;
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total de Usuarios" value={usuarios.length} color="blue" />
        <StatCard
          label="Perfis Ativos"
          value={usuarios.reduce((acc, u) => acc + u.perfis.filter(p => p.ativo).length, 0)}
          color="green"
        />
        <StatCard
          label="Perfis Inativos"
          value={usuarios.reduce((acc, u) => acc + u.perfis.filter(p => !p.ativo).length, 0)}
          color="red"
        />
      </div>

      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por email ou empresa..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-white text-sm
                       placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-lg px-4 py-2.5 text-white text-sm
                     transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Novo Usuario
        </button>
        <button
          onClick={loadData}
          className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-300
                     hover:bg-gray-700 transition-colors text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* User List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum usuario encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(user => {
            const expanded = expandedId === user.id;
            const allInactive = user.perfis.length > 0 && user.perfis.every(p => !p.ativo);

            return (
              <div key={user.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        allInactive ? 'bg-red-400' : user.perfis.length > 0 ? 'bg-green-400' : 'bg-gray-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium text-sm truncate">{user.email}</p>
                      <p className="text-gray-500 text-xs">
                        {user.perfis.length} empresa{user.perfis.length !== 1 ? 's' : ''} vinculada
                        {user.perfis.length !== 1 ? 's' : ''} &middot; Criado em {formatDate(user.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Roles badges */}
                    {user.perfis.slice(0, 2).map((p, i) => (
                      <span
                        key={i}
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium hidden sm:inline-block
                          ${
                            p.ativo
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                          }`}
                      >
                        {p.razao_social ? p.razao_social.substring(0, 15) : 'N/A'}
                      </span>
                    ))}
                    {user.perfis.length > 2 && (
                      <span className="text-xs text-gray-500 hidden sm:inline-block">
                        +{user.perfis.length - 2}
                      </span>
                    )}

                    {/* Reset password - master only */}
                    {isMaster && (
                      <button
                        onClick={() => setResetPasswordUser(user)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                        title="Resetar senha"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => setExpandedId(expanded ? null : user.id)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="px-5 pb-4 border-t border-gray-700">
                    <div className="pt-4 space-y-2">
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">
                        Perfis vinculados
                      </p>
                      {user.perfis.length === 0 ? (
                        <p className="text-gray-500 text-sm">Nenhum perfil vinculado</p>
                      ) : (
                        <div className="space-y-2">
                          {user.perfis.map((perfil, idx) => {
                            const key = `${user.id}-${perfil.empresa_id}`;
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      perfil.ativo ? 'bg-green-400' : 'bg-red-400'
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-gray-200 text-sm truncate">
                                      {perfil.razao_social || perfil.empresa_id}
                                    </p>
                                    <p className="text-gray-500 text-xs">
                                      {roleLabel(perfil.role)} &middot;{' '}
                                      {perfil.ativo ? 'Ativo' : 'Inativo'}
                                    </p>
                                  </div>
                                </div>

                                <button
                                  onClick={() => togglePerfilAtivo(user.id, perfil.empresa_id, perfil.ativo)}
                                  disabled={togglingPerfil === key}
                                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50
                                    ${
                                      perfil.ativo
                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                        : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                                    }`}
                                >
                                  {perfil.ativo ? (
                                    <UserX className="w-3 h-3" />
                                  ) : (
                                    <UserCheck className="w-3 h-3" />
                                  )}
                                  {togglingPerfil === key ? '...' : perfil.ativo ? 'Desativar' : 'Ativar'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          isMaster={isMaster}
          empresas={empresas}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <ResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
          onReset={() => {
            setResetPasswordUser(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Configuracoes Tab ───────────────────────────────────────────────

function ConfiguracoesTab() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/empresas');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setEmpresas(data.empresas || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function loadConfig(empresaId: string) {
    if (!empresaId) {
      setConfig(null);
      return;
    }
    setLoadingConfig(true);
    setError('');
    try {
      // Use admin empresas endpoint to get full info - the empresa data already contains config
      const res = await fetch('/api/admin/empresas');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const emp = (data.empresas || []).find((e: any) => e.id === empresaId);
      if (emp) {
        setConfig(emp);
      } else {
        setConfig(null);
        setError('Empresa nao encontrada');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingConfig(false);
    }
  }

  function handleSelect(empresaId: string) {
    setSelectedEmpresa(empresaId);
    loadConfig(empresaId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h3 className="text-white font-medium text-sm mb-4">Selecione uma empresa para ver configuracoes</h3>
        <select
          value={selectedEmpresa}
          onChange={e => handleSelect(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm
                     focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">-- Selecionar empresa --</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>
              {e.razao_social} ({formatCpfCnpj(e.cnpj)})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loadingConfig && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {config && !loadingConfig && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-6">
          <h3 className="text-white font-semibold text-base mb-2">
            {config.razao_social}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ConfigField label="CNPJ" value={formatCpfCnpj(config.cnpj)} />
            <ConfigField label="Nome Fantasia" value={config.nome_fantasia || '-'} />
            <ConfigField label="Inscricao Municipal" value={config.inscricao_municipal || '-'} />
            <ConfigField label="Regime Tributario" value={(config.regime_tributario || '').replace(/_/g, ' ')} />
            <ConfigField label="Email" value={config.email_empresa || '-'} />
            <ConfigField label="Telefone" value={config.telefone || '-'} />
            <ConfigField label="Criado em" value={config.created_at ? formatDate(config.created_at) : '-'} />
            <ConfigField label="Total Notas" value={String(config.total_notas ?? 0)} />
          </div>

          {/* Licenca details */}
          {config.licenca && (
            <>
              <div className="border-t border-gray-700 pt-4">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Licenca</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ConfigField
                    label="Status"
                    value={config.licenca.license_active ? 'Ativa' : 'Inativa'}
                    highlight={config.licenca.license_active ? 'green' : 'red'}
                  />
                  <ConfigField label="Plano" value={config.licenca.plano || 'basico'} />
                  <ConfigField label="Notas/Mes Limite" value={String(config.licenca.notas_mes_limite ?? 50)} />
                  <ConfigField
                    label="Expiracao"
                    value={config.licenca.data_expiracao ? formatDate(config.licenca.data_expiracao) : 'Sem limite'}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create User Modal ───────────────────────────────────────────────

function CreateUserModal({
  isMaster,
  empresas,
  onClose,
  onCreated,
}: {
  isMaster: boolean;
  empresas: Empresa[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [perfis, setPerfis] = useState<{ empresa_id: string; role: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const availableRoles = isMaster
    ? ['emissor', 'visualizador', 'admin', 'super_admin']
    : ['emissor', 'visualizador', 'admin'];

  function addPerfil() {
    if (perfis.length >= 20) return;
    setPerfis(prev => [...prev, { empresa_id: '', role: 'emissor' }]);
  }

  function removePerfil(idx: number) {
    setPerfis(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePerfil(idx: number, field: 'empresa_id' | 'role', value: string) {
    setPerfis(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email || !senha) {
      setError('Email e senha sao obrigatorios');
      return;
    }
    if (senha.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    const validPerfis = perfis.filter(p => p.empresa_id);
    if (validPerfis.length === 0) {
      setError('Selecione pelo menos uma empresa');
      return;
    }

    // Check for duplicate empresas
    const empresaIds = validPerfis.map(p => p.empresa_id);
    if (new Set(empresaIds).size !== empresaIds.length) {
      setError('Nao pode vincular a mesma empresa duas vezes');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha, perfis: validPerfis }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold">Novo Usuario</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm
                         placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Senha</label>
            <div className="relative">
              <input
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Minimo 6 caracteres"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm
                           placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowSenha(!showSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Perfis */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-xs font-medium">Empresas vinculadas</label>
              <button
                type="button"
                onClick={addPerfil}
                disabled={perfis.length >= 20}
                className="text-xs text-purple-400 hover:text-purple-300 disabled:text-gray-600 disabled:cursor-not-allowed"
              >
                + Adicionar empresa
              </button>
            </div>

            {perfis.length === 0 && (
              <p className="text-gray-500 text-xs">
                Clique em &quot;+ Adicionar empresa&quot; para vincular
              </p>
            )}

            <div className="space-y-2">
              {perfis.map((perfil, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={perfil.empresa_id}
                    onChange={e => updatePerfil(idx, 'empresa_id', e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
                               focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Selecionar empresa...</option>
                    {empresas.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.razao_social}
                      </option>
                    ))}
                  </select>
                  <select
                    value={perfil.role}
                    onChange={e => updatePerfil(idx, 'role', e.target.value)}
                    className="w-36 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
                               focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {availableRoles.map(r => (
                      <option key={r} value={r}>
                        {r === 'super_admin' ? 'Super Admin' : r === 'admin' ? 'Admin' : r === 'emissor' ? 'Emissor' : 'Visualizador'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removePerfil(idx)}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {submitting ? 'Criando...' : 'Criar Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ────────────────────────────────────────────

function ResetPasswordModal({
  user,
  onClose,
  onReset,
}: {
  user: Usuario;
  onClose: () => void;
  onReset: () => void;
}) {
  const [novaSenha, setNovaSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!novaSenha || novaSenha.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/usuarios/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: novaSenha }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess(true);
      setTimeout(() => onReset(), 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold">Resetar Senha</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-green-400 text-sm">Senha resetada com sucesso!</p>
            </div>
          )}

          <div className="bg-gray-900/50 rounded-lg px-4 py-3">
            <p className="text-gray-400 text-xs">Usuario</p>
            <p className="text-white text-sm">{user.email}</p>
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Nova Senha</label>
            <div className="relative">
              <input
                type={showSenha ? 'text' : 'password'}
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder="Minimo 6 caracteres"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm
                           placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
                minLength={6}
                disabled={success}
              />
              <button
                type="button"
                onClick={() => setShowSenha(!showSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || success}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-600/50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {submitting ? 'Resetando...' : 'Resetar Senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────────

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

function ConfigField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'green' | 'red';
}) {
  const textColor = highlight === 'green'
    ? 'text-green-400'
    : highlight === 'red'
      ? 'text-red-400'
      : 'text-gray-200';

  return (
    <div className="bg-gray-900/50 rounded-lg px-4 py-3">
      <p className="text-gray-500 text-xs mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${textColor}`}>{value}</p>
    </div>
  );
}
