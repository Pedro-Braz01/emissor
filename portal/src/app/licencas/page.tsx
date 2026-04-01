'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useUser } from '@/lib/store';
import { formatDate, cn, statusColors } from '@/lib/utils';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { toast } from 'sonner';
import {
  Shield,
  Search,
  Lock,
  Unlock,
  Users,
  Building2,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface Tenant {
  id: string;
  cnpj: string;
  nome: string;
  email: string;
  plano: string;
  max_notas_mes: number;
  notas_mes_atual: number;
  empresas_ativas: number;
  usuarios_ativos: number;
  ativo: boolean;
  created_at: string;
  licencas: {
    id: string;
    status: string;
    license_active: boolean;
    validade: string | null;
    trial_fim: string | null;
    blocked_reason: string | null;
    license_key: string;
  } | null;
}

export default function LicencasPage() {
  const user = useUser();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  // Modal de bloqueio
  const [modalBloquear, setModalBloquear] = useState<Tenant | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');

  // Modal de desbloquear
  const [modalDesbloquear, setModalDesbloquear] = useState<Tenant | null>(null);
  const [novaValidade, setNovaValidade] = useState('');

  useEffect(() => {
    if (user?.role === 'MASTER') {
      loadTenants();
    }
  }, [user]);

  const loadTenants = async () => {
    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('tenants')
        .select(`
          *,
          licencas (
            id,
            status,
            license_active,
            validade,
            trial_fim,
            blocked_reason,
            license_key
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error('Erro ao carregar tenants:', error);
      toast.error('Erro ao carregar licenças');
    } finally {
      setLoading(false);
    }
  };

  const handleBloquear = async () => {
    if (!modalBloquear || !motivoBloqueio.trim()) {
      toast.error('Informe o motivo do bloqueio');
      return;
    }

    setActionLoading(modalBloquear.id);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('licencas')
        .update({
          status: 'BLOQUEADO',
          license_active: false,
          blocked_at: new Date().toISOString(),
          blocked_reason: motivoBloqueio,
        })
        .eq('tenant_id', modalBloquear.id);

      if (error) throw error;

      toast.success(`${modalBloquear.nome} foi bloqueado`);
      setModalBloquear(null);
      setMotivoBloqueio('');
      loadTenants();
    } catch (error) {
      toast.error('Erro ao bloquear');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDesbloquear = async () => {
    if (!modalDesbloquear) return;

    setActionLoading(modalDesbloquear.id);
    const supabase = createClient();

    try {
      const updateData: any = {
        status: 'ATIVO',
        license_active: true,
        blocked_at: null,
        blocked_reason: null,
      };

      if (novaValidade) {
        updateData.validade = novaValidade;
      }

      const { error } = await supabase
        .from('licencas')
        .update(updateData)
        .eq('tenant_id', modalDesbloquear.id);

      if (error) throw error;

      toast.success(`${modalDesbloquear.nome} foi desbloqueado`);
      setModalDesbloquear(null);
      setNovaValidade('');
      loadTenants();
    } catch (error) {
      toast.error('Erro ao desbloquear');
    } finally {
      setActionLoading(null);
    }
  };

  // Verifica permissão
  if (user?.role !== 'MASTER') {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500" />
            <h2 className="mt-4 text-xl font-semibold">Acesso Restrito</h2>
            <p className="mt-2 text-gray-500">
              Apenas administradores MASTER podem acessar esta página.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Filtrar tenants
  const tenantsFiltrados = tenants.filter((tenant) => {
    if (busca) {
      const search = busca.toLowerCase();
      if (
        !tenant.nome.toLowerCase().includes(search) &&
        !tenant.cnpj.includes(search) &&
        !tenant.email.toLowerCase().includes(search)
      ) {
        return false;
      }
    }
    if (filtroStatus && tenant.licencas?.status !== filtroStatus) {
      return false;
    }
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ATIVO':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'TRIAL':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'BLOQUEADO':
      case 'SUSPENSO':
        return <Lock className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gerenciar Licenças</h1>
          <p className="mt-1 text-gray-500">
            Controle os clientes e suas licenças de uso
          </p>
        </div>

        {/* Info Google Sheets */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <ExternalLink className="h-5 w-5 text-blue-600" />
          <div>
            <p className="font-medium text-blue-800">
              Controle também via Google Sheets
            </p>
            <p className="mt-1 text-sm text-blue-700">
              Você pode gerenciar licenças editando a planilha de controle. 
              Altere a coluna "Status" para ATIVO ou BLOQUEADO.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Clientes</p>
                <p className="text-xl font-bold">{tenants.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Ativos</p>
                <p className="text-xl font-bold">
                  {tenants.filter((t) => t.licencas?.status === 'ATIVO').length}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Em Trial</p>
                <p className="text-xl font-bold">
                  {tenants.filter((t) => t.licencas?.status === 'TRIAL').length}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <Lock className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Bloqueados</p>
                <p className="text-xl font-bold">
                  {tenants.filter((t) => t.licencas?.status === 'BLOQUEADO').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CNPJ ou email..."
              className="input pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <select
            className="input w-auto"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            <option value="ATIVO">Ativo</option>
            <option value="TRIAL">Trial</option>
            <option value="BLOQUEADO">Bloqueado</option>
            <option value="SUSPENSO">Suspenso</option>
          </select>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-sm font-medium text-gray-500">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Plano</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Uso</th>
                    <th className="px-4 py-3">Validade</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tenantsFiltrados.map((tenant) => {
                    const licenca = tenant.licencas;
                    const status = licenca?.status || 'INATIVO';
                    const statusColor = statusColors[status] || statusColors.BLOQUEADO;

                    return (
                      <tr key={tenant.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{tenant.nome}</p>
                            <p className="text-sm text-gray-500">{tenant.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            {tenant.plano}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(status)}
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-medium',
                                statusColor.bg,
                                statusColor.text
                              )}
                            >
                              {status}
                            </span>
                          </div>
                          {licenca?.blocked_reason && (
                            <p className="mt-1 text-xs text-red-600">
                              {licenca.blocked_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            <p>
                              <FileText className="mr-1 inline h-3 w-3" />
                              {tenant.notas_mes_atual}/{tenant.max_notas_mes} notas
                            </p>
                            <p className="text-gray-500">
                              <Building2 className="mr-1 inline h-3 w-3" />
                              {tenant.empresas_ativas} empresas
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {licenca?.validade ? (
                            <span className="text-sm">
                              {formatDate(licenca.validade)}
                            </span>
                          ) : licenca?.trial_fim ? (
                            <span className="text-sm text-blue-600">
                              Trial até {formatDate(licenca.trial_fim)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {status === 'BLOQUEADO' || status === 'SUSPENSO' ? (
                            <button
                              onClick={() => setModalDesbloquear(tenant)}
                              disabled={actionLoading === tenant.id}
                              className="btn btn-outline text-green-600 hover:bg-green-50"
                            >
                              {actionLoading === tenant.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Unlock className="h-4 w-4" />
                                  Desbloquear
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => setModalBloquear(tenant)}
                              disabled={actionLoading === tenant.id}
                              className="btn btn-outline text-red-600 hover:bg-red-50"
                            >
                              {actionLoading === tenant.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Lock className="h-4 w-4" />
                                  Bloquear
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Bloquear */}
        {modalBloquear && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6">
              <h3 className="text-lg font-semibold text-red-600">
                Bloquear {modalBloquear.nome}?
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                O cliente não poderá mais emitir notas até ser desbloqueado.
              </p>
              <div className="mt-4">
                <label className="label">Motivo do bloqueio *</label>
                <textarea
                  rows={3}
                  className="input"
                  placeholder="Ex: Falta de pagamento"
                  value={motivoBloqueio}
                  onChange={(e) => setMotivoBloqueio(e.target.value)}
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setModalBloquear(null)}
                  className="btn btn-outline"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBloquear}
                  disabled={!motivoBloqueio.trim()}
                  className="btn btn-danger"
                >
                  Confirmar Bloqueio
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Desbloquear */}
        {modalDesbloquear && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6">
              <h3 className="text-lg font-semibold text-green-600">
                Desbloquear {modalDesbloquear.nome}?
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                O cliente poderá voltar a emitir notas normalmente.
              </p>
              <div className="mt-4">
                <label className="label">Nova data de validade (opcional)</label>
                <input
                  type="date"
                  className="input"
                  value={novaValidade}
                  onChange={(e) => setNovaValidade(e.target.value)}
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setModalDesbloquear(null)}
                  className="btn btn-outline"
                >
                  Cancelar
                </button>
                <button onClick={handleDesbloquear} className="btn btn-primary">
                  Confirmar Desbloqueio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
