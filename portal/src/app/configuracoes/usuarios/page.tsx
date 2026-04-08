'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { useEmpresa } from '@/lib/store';
import { Check, X, Users, UserPlus, Trash2, Mail, Clock, ShieldCheck } from 'lucide-react';

interface Solicitacao {
  id: string;
  empresa_id: string;
  email_solicitante: string;
  nome_solicitante: string | null;
  status: 'pendente' | 'aprovada' | 'rejeitada';
  created_at: string;
}

interface Vinculo {
  id: string;
  user_id: string;
  email: string;
  role: string;
  ativo: boolean;
}

export default function GestaoUsuariosPage() {
  return (
    <DashboardLayout>
      <GestaoUsuariosClient />
    </DashboardLayout>
  );
}

function GestaoUsuariosClient() {
  const empresa = useEmpresa();
  const [tab, setTab] = useState<'solicitacoes' | 'vinculados'>('solicitacoes');
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [vinculados, setVinculados] = useState<Vinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);

    try {
      // Carrega solicitações
      const resSol = await fetch(`/api/solicitacoes?empresa_id=${empresa.id}`);
      if (resSol.ok) {
        const data = await resSol.json();
        setSolicitacoes(data.solicitacoes || []);
      }

      // Carrega vínculos via endpoint dedicado
      const resUsers = await fetch(`/api/empresa-usuarios?empresa_id=${empresa.id}`);
      if (resUsers.ok) {
        const data = await resUsers.json();
        setVinculados(data.usuarios || []);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }

    setLoading(false);
  }, [empresa?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSolicitacao(solicitacaoId: string, acao: 'aprovar' | 'rejeitar') {
    setActionLoading(solicitacaoId);
    try {
      const res = await fetch('/api/solicitacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solicitacao_id: solicitacaoId, acao }),
      });
      if (res.ok) await loadData();
    } catch (err) {
      console.error('Erro ao processar solicitação:', err);
    }
    setActionLoading(null);
  }

  async function handleRemoverVinculo(perfilId: string, userEmail: string) {
    if (!confirm(`Remover acesso de ${userEmail} à empresa?`)) return;
    setActionLoading(perfilId);
    try {
      // Usa o endpoint de admin para desativar perfil
      const res = await fetch(`/api/empresa-usuarios?empresa_id=${empresa?.id}`, {
        method: 'GET',
      });
      // Para simplificar, vamos desativar via supabase client
      const { createClientSupabaseClient } = await import('@/lib/supabase-client');
      const supabase = createClientSupabaseClient();
      await supabase
        .from('perfis_usuarios')
        .update({ ativo: false })
        .eq('id', perfilId);
      await loadData();
    } catch (err) {
      console.error('Erro ao remover vínculo:', err);
    }
    setActionLoading(null);
  }

  const pendentes = solicitacoes.filter(s => s.status === 'pendente');
  const historico = solicitacoes.filter(s => s.status !== 'pendente');
  const vinculadosAtivos = vinculados.filter(v => v.ativo);
  const vinculadosInativos = vinculados.filter(v => !v.ativo);

  const roleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Proprietário';
      case 'super_admin': return 'Administrador';
      default: return 'Emissor';
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'super_admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Usuários</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gerencie acessos e solicitações de vínculo à empresa.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('solicitacoes')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'solicitacoes'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Solicitações
            {pendentes.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {pendentes.length}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setTab('vinculados')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'vinculados'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Usuários Vinculados
            <span className="text-xs text-gray-400 dark:text-gray-500">({vinculadosAtivos.length})</span>
          </span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        </div>
      ) : tab === 'solicitacoes' ? (
        <div className="space-y-4">
          {/* Pendentes */}
          {pendentes.length === 0 ? (
            <div className="text-center py-16">
              <UserPlus className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Nenhuma solicitação pendente</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Quando alguém solicitar acesso via CNPJ, aparecerá aqui.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
              </p>
              {pendentes.map(sol => (
                <div key={sol.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{sol.email_solicitante}</p>
                    </div>
                    {sol.nome_solicitante && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 ml-6 truncate">{sol.nome_solicitante}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5 ml-6">
                      <Clock className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(sol.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleSolicitacao(sol.id, 'aprovar')}
                      disabled={actionLoading === sol.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleSolicitacao(sol.id, 'rejeitar')}
                      disabled={actionLoading === sol.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Histórico */}
          {historico.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Histórico</p>
              <div className="space-y-1">
                {historico.slice(0, 10).map(sol => (
                  <div key={sol.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm">
                    <span className="text-gray-600 dark:text-gray-400 truncate">{sol.email_solicitante}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      sol.status === 'aprovada'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    }`}>
                      {sol.status === 'aprovada' ? 'Aprovada' : 'Rejeitada'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Tab: Usuários Vinculados */
        <div className="space-y-3">
          {vinculadosAtivos.length === 0 && vinculadosInativos.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Nenhum usuário vinculado</p>
            </div>
          ) : (
            <>
              {/* Ativos */}
              {vinculadosAtivos.map(v => (
                <div key={v.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium shrink-0">
                        {v.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{v.email}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(v.role)}`}>
                            {roleLabel(v.role)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {v.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoverVinculo(v.id, v.email)}
                      disabled={actionLoading === v.id}
                      className="p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      title="Remover acesso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {v.role === 'owner' && (
                    <ShieldCheck className="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0" />
                  )}
                </div>
              ))}

              {/* Inativos */}
              {vinculadosInativos.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Inativos</p>
                  {vinculadosInativos.map(v => (
                    <div key={v.id} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3 flex items-center gap-3 opacity-60 mb-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-xs shrink-0">
                        {v.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{v.email}</span>
                      <span className="text-xs text-red-400 dark:text-red-500 ml-auto shrink-0">Removido</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
