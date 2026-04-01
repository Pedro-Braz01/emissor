'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useEmpresa, useLicenca } from '@/lib/store';
import { formatCurrency, formatDate, statusColors, statusLabels } from '@/lib/utils';
import DashboardLayout from '@/components/layout/dashboard-layout';
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

interface Stats {
  totalMes: number;
  emitidas: number;
  canceladas: number;
  valorTotal: number;
  ultimasNotas: Array<{
    id: string;
    numero_nfse: number | null;
    numero_rps: number;
    status: string;
    valor_servicos: number;
    created_at: string;
    tomadores?: { razao_social: string } | null;
  }>;
}

export default function DashboardPage() {
  const empresa = useEmpresa();
  const licenca = useLicenca();
  const [stats, setStats] = useState<Stats>({
    totalMes: 0,
    emitidas: 0,
    canceladas: 0,
    valorTotal: 0,
    ultimasNotas: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (empresa?.id) {
      loadStats();
    }
  }, [empresa?.id]);

  const loadStats = async () => {
    const supabase = createClient();
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    try {
      // Total do mês
      const { count: totalMes } = await supabase
        .from('notas_fiscais')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id)
        .gte('created_at', inicioMes.toISOString());

      // Emitidas
      const { count: emitidas } = await supabase
        .from('notas_fiscais')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id)
        .eq('status', 'EMITIDA')
        .gte('created_at', inicioMes.toISOString());

      // Canceladas
      const { count: canceladas } = await supabase
        .from('notas_fiscais')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id)
        .eq('status', 'CANCELADA')
        .gte('created_at', inicioMes.toISOString());

      // Valor total
      const { data: valorData } = await supabase
        .from('notas_fiscais')
        .select('valor_servicos')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'EMITIDA')
        .gte('created_at', inicioMes.toISOString());

      const valorTotal = valorData?.reduce((sum, n) => sum + Number(n.valor_servicos), 0) || 0;

      // Últimas notas
      const { data: ultimasNotas } = await supabase
        .from('notas_fiscais')
        .select(`
          id,
          numero_nfse,
          numero_rps,
          status,
          valor_servicos,
          created_at,
          tomadores (razao_social)
        `)
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalMes: totalMes || 0,
        emitidas: emitidas || 0,
        canceladas: canceladas || 0,
        valorTotal,
        ultimasNotas: ultimasNotas || [],
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total do Mês',
      value: stats.totalMes,
      icon: FileText,
      color: 'bg-blue-500',
    },
    {
      title: 'Emitidas',
      value: stats.emitidas,
      icon: CheckCircle,
      color: 'bg-green-500',
    },
    {
      title: 'Canceladas',
      value: stats.canceladas,
      icon: XCircle,
      color: 'bg-red-500',
    },
    {
      title: 'Faturamento',
      value: formatCurrency(stats.valorTotal),
      icon: TrendingUp,
      color: 'bg-purple-500',
      isValue: true,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-gray-500">
            Visão geral das notas fiscais emitidas
          </p>
        </div>

        {/* Alerta de Homologação */}
        {empresa?.ambiente !== 'PRODUCAO' && (
          <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Modo Homologação</p>
              <p className="text-sm text-yellow-700">
                As notas emitidas são apenas para teste e não têm validade fiscal.
              </p>
            </div>
          </div>
        )}

        {/* Cards de Estatísticas */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.color} text-white`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {loading ? '...' : card.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Últimas Notas */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="font-semibold text-gray-900">Últimas Notas</h2>
            <a href="/notas" className="text-sm text-primary-600 hover:underline">
              Ver todas
            </a>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : stats.ultimasNotas.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Nenhuma nota emitida ainda
            </div>
          ) : (
            <div className="divide-y">
              {stats.ultimasNotas.map((nota) => {
                const statusColor = statusColors[nota.status] || statusColors.RASCUNHO;
                return (
                  <div
                    key={nota.id}
                    className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                        <FileText className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {nota.numero_nfse
                            ? `NFSe ${nota.numero_nfse}`
                            : `RPS ${nota.numero_rps}`}
                        </p>
                        <p className="text-sm text-gray-500">
                          {nota.tomadores?.razao_social || 'Sem tomador'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {formatCurrency(Number(nota.valor_servicos))}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor.bg} ${statusColor.text}`}
                      >
                        {statusLabels[nota.status] || nota.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
