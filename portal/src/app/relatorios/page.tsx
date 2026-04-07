'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase-client';
import { useEmpresa } from '@/lib/store';
import { formatCurrency, formatDate, formatCpfCnpj, statusColors, statusLabels, cn } from '@/lib/utils';
import DashboardLayout from '@/components/layout/dashboard-layout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  FileText,
  Download,
  Loader2,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';

// Extend jsPDF type for autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
  }
}

interface NotaFiscal {
  id: string;
  numero_nfse: number | null;
  numero_rps: number;
  serie_rps: string;
  status: string;
  valor_servicos: number;
  valor_iss: number;
  data_emissao: string;
  created_at: string;
  created_by: string;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_inss: number | null;
  valor_irrf: number | null;
  valor_csll: number | null;
  iss_retido: boolean | null;
  tomador_razao_social: string;
  tomador_cnpj_cpf: string;
}

interface UserMap {
  [userId: string]: string;
}

function getRetencoes(nota: NotaFiscal): number {
  const pis = Number(nota.valor_pis) || 0;
  const cofins = Number(nota.valor_cofins) || 0;
  const inss = Number(nota.valor_inss) || 0;
  const irrf = Number(nota.valor_irrf) || 0;
  const csll = Number(nota.valor_csll) || 0;
  const issRetido = nota.iss_retido ? (Number(nota.valor_iss) || 0) : 0;
  return pis + cofins + inss + irrf + csll + issRetido;
}

function getValorLiquido(nota: NotaFiscal): number {
  return Number(nota.valor_servicos) - getRetencoes(nota);
}

function getDefaultDateRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(start), end: fmt(end) };
}

export default function RelatoriosPage() {
  const empresa = useEmpresa();
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(false);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXls, setExportingXls] = useState(false);

  const defaults = getDefaultDateRange();
  const [dataInicio, setDataInicio] = useState(defaults.start);
  const [dataFim, setDataFim] = useState(defaults.end);

  const loadUserMap = useCallback(async () => {
    if (!empresa?.id) return;
    const supabase = createClient();
    const { data: perfis } = await supabase
      .from('perfis_usuarios')
      .select('user_id, email')
      .eq('empresa_id', empresa.id);

    if (perfis) {
      const map: UserMap = {};
      for (const p of perfis) {
        map[p.user_id] = p.email || p.user_id.substring(0, 8);
      }
      setUserMap(map);
    }
  }, [empresa?.id]);

  const loadNotas = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    const supabase = createClient();

    try {
      let query = supabase
        .from('notas_fiscais')
        .select(`
          id,
          numero_nfse,
          numero_rps,
          serie_rps,
          status,
          valor_servicos,
          valor_iss,
          data_emissao,
          created_at,
          created_by,
          valor_pis,
          valor_cofins,
          valor_inss,
          valor_irrf,
          valor_csll,
          iss_retido,
          tomador_razao_social,
          tomador_cnpj_cpf
        `)
        .eq('empresa_id', empresa.id)
        .in('status', ['emitida', 'cancelada'])
        .order('data_emissao', { ascending: true });

      if (dataInicio) {
        query = query.gte('data_emissao', dataInicio);
      }
      if (dataFim) {
        query = query.lte('data_emissao', dataFim);
      }

      const { data, error } = await query;

      if (error) throw error;
      setNotas(data || []);
    } catch (error) {
      console.error('Erro ao carregar notas:', error);
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, dataInicio, dataFim]);

  useEffect(() => {
    if (empresa?.id) {
      loadNotas();
      loadUserMap();
    }
  }, [empresa?.id, loadNotas, loadUserMap]);

  // Summary totals
  const totalNotas = notas.length;
  const totalBruto = notas.reduce((sum, n) => sum + Number(n.valor_servicos), 0);
  const totalRetencoes = notas.reduce((sum, n) => sum + getRetencoes(n), 0);
  const totalLiquido = notas.reduce((sum, n) => sum + getValorLiquido(n), 0);

  const getUserDisplay = (userId: string): string => {
    return userMap[userId] || userId.substring(0, 8) + '...';
  };

  // Export to PDF
  const exportPdf = () => {
    if (notas.length === 0) return;
    setExportingPdf(true);

    try {
      const doc = new jsPDF({ orientation: 'landscape' });

      // Title
      doc.setFontSize(16);
      doc.text('Livro Fiscal - Notas de Servico', 14, 20);
      doc.setFontSize(10);
      doc.text(`Empresa: ${empresa?.razaoSocial || ''}`, 14, 28);
      doc.text(`CNPJ: ${empresa?.cnpj ? formatCpfCnpj(empresa.cnpj) : ''}`, 14, 34);
      doc.text(`Periodo: ${formatDate(dataInicio)} a ${formatDate(dataFim)}`, 14, 40);

      const tableData = notas.map((nota) => [
        nota.numero_nfse?.toString() || '-',
        formatDate(nota.data_emissao),
        (nota.tomador_razao_social || '-') +
          (nota.tomador_cnpj_cpf ? '\n' + formatCpfCnpj(nota.tomador_cnpj_cpf) : ''),
        formatCurrency(Number(nota.valor_servicos)),
        formatCurrency(getRetencoes(nota)),
        formatCurrency(getValorLiquido(nota)),
        getUserDisplay(nota.created_by),
        statusLabels[nota.status] || nota.status,
      ]);

      doc.autoTable({
        startY: 46,
        head: [
          [
            'NFSe',
            'Emissao',
            'Tomador',
            'Valor Bruto',
            'Retencoes',
            'Valor Liquido',
            'Usuario',
            'Status',
          ],
        ],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 25 },
          2: { cellWidth: 55 },
          3: { cellWidth: 30, halign: 'right' as const },
          4: { cellWidth: 30, halign: 'right' as const },
          5: { cellWidth: 30, halign: 'right' as const },
          6: { cellWidth: 35 },
          7: { cellWidth: 25 },
        },
      });

      // Summary footer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = ((doc as any).lastAutoTable?.finalY as number) || 200;
      const summaryY = finalY + 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo:', 14, summaryY);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total de notas: ${totalNotas}`, 14, summaryY + 7);
      doc.text(`Total valor bruto: ${formatCurrency(totalBruto)}`, 14, summaryY + 14);
      doc.text(`Total retencoes: ${formatCurrency(totalRetencoes)}`, 14, summaryY + 21);
      doc.text(`Total valor liquido: ${formatCurrency(totalLiquido)}`, 14, summaryY + 28);

      const filename = `livro-fiscal-${dataInicio}-a-${dataFim}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
    } finally {
      setExportingPdf(false);
    }
  };

  // Export to XLS
  const exportXls = () => {
    if (notas.length === 0) return;
    setExportingXls(true);

    try {
      const wsData = notas.map((nota) => ({
        'Numero NFSe': nota.numero_nfse || '-',
        'Data Emissao': formatDate(nota.data_emissao),
        'Tomador - Razao Social': nota.tomador_razao_social || '-',
        'Tomador - CPF/CNPJ': nota.tomador_cnpj_cpf
          ? formatCpfCnpj(nota.tomador_cnpj_cpf)
          : '-',
        'Valor Bruto': Number(nota.valor_servicos),
        'Ret. PIS': Number(nota.valor_pis) || 0,
        'Ret. COFINS': Number(nota.valor_cofins) || 0,
        'Ret. INSS': Number(nota.valor_inss) || 0,
        'Ret. IRRF': Number(nota.valor_irrf) || 0,
        'Ret. CSLL': Number(nota.valor_csll) || 0,
        'ISS Retido': nota.iss_retido ? (Number(nota.valor_iss) || 0) : 0,
        'Total Retencoes': getRetencoes(nota),
        'Valor Liquido': getValorLiquido(nota),
        'Usuario': getUserDisplay(nota.created_by),
        'Status': statusLabels[nota.status] || nota.status,
      }));

      // Add summary rows
      wsData.push({
        'Numero NFSe': '',
        'Data Emissao': '',
        'Tomador - Razao Social': '',
        'Tomador - CPF/CNPJ': '',
        'Valor Bruto': '' as unknown as number,
        'Ret. PIS': '' as unknown as number,
        'Ret. COFINS': '' as unknown as number,
        'Ret. INSS': '' as unknown as number,
        'Ret. IRRF': '' as unknown as number,
        'Ret. CSLL': '' as unknown as number,
        'ISS Retido': '' as unknown as number,
        'Total Retencoes': '' as unknown as number,
        'Valor Liquido': '' as unknown as number,
        'Usuario': '',
        'Status': '',
      });
      wsData.push({
        'Numero NFSe': 'TOTAIS',
        'Data Emissao': `${totalNotas} notas`,
        'Tomador - Razao Social': '',
        'Tomador - CPF/CNPJ': '',
        'Valor Bruto': totalBruto,
        'Ret. PIS': '' as unknown as number,
        'Ret. COFINS': '' as unknown as number,
        'Ret. INSS': '' as unknown as number,
        'Ret. IRRF': '' as unknown as number,
        'Ret. CSLL': '' as unknown as number,
        'ISS Retido': '' as unknown as number,
        'Total Retencoes': totalRetencoes,
        'Valor Liquido': totalLiquido,
        'Usuario': '',
        'Status': '',
      });

      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Livro Fiscal');

      const filename = `livro-fiscal-${dataInicio}-a-${dataFim}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Erro ao gerar XLS:', error);
    } finally {
      setExportingXls(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Livro Fiscal</h1>
            <p className="mt-1 text-gray-500">
              Relatorio de notas fiscais emitidas no periodo
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportPdf}
              disabled={notas.length === 0 || exportingPdf}
              className="btn btn-outline flex items-center gap-2 disabled:opacity-50"
            >
              {exportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PDF
            </button>
            <button
              onClick={exportXls}
              disabled={notas.length === 0 || exportingXls}
              className="btn btn-outline flex items-center gap-2 disabled:opacity-50"
            >
              {exportingXls ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              XLS
            </button>
          </div>
        </div>

        {/* Filtros de data */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Data Inicio
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  className="input pl-9"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Data Fim
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  className="input pl-9"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={loadNotas}
                disabled={loading}
                className="btn btn-primary flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Gerar Relatorio
              </button>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : notas.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-gray-500">
                Nenhuma nota encontrada no periodo selecionado
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-sm font-medium text-gray-500">
                    <th className="px-4 py-3">NFSe</th>
                    <th className="px-4 py-3">Data Emissao</th>
                    <th className="px-4 py-3">Tomador</th>
                    <th className="px-4 py-3 text-right">Valor Bruto</th>
                    <th className="px-4 py-3 text-right">Retencoes</th>
                    <th className="px-4 py-3 text-right">Valor Liquido</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {notas.map((nota) => {
                    const statusColor =
                      statusColors[nota.status] || statusColors.RASCUNHO;
                    const retencoes = getRetencoes(nota);
                    const valorLiquido = getValorLiquido(nota);

                    return (
                      <tr key={nota.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {nota.numero_nfse || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {formatDate(nota.data_emissao)}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">
                              {nota.tomador_razao_social || '-'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {nota.tomador_cnpj_cpf
                                ? formatCpfCnpj(nota.tomador_cnpj_cpf)
                                : '-'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(Number(nota.valor_servicos))}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {formatCurrency(retencoes)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(valorLiquido)}
                        </td>
                        <td className="px-4 py-3">
                          <p
                            className="max-w-[120px] truncate text-sm text-gray-600"
                            title={userMap[nota.created_by] || nota.created_by}
                          >
                            {getUserDisplay(nota.created_by)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                              statusColor.bg,
                              statusColor.text
                            )}
                          >
                            {statusLabels[nota.status] || nota.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary totals */}
          {notas.length > 0 && (
            <div className="border-t bg-gray-50 px-4 py-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-sm text-gray-500">Total de Notas</p>
                  <p className="text-lg font-bold text-gray-900">{totalNotas}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-sm text-gray-500">Total Valor Bruto</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(totalBruto)}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-sm text-gray-500">Total Retencoes</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(totalRetencoes)}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-sm text-gray-500">Total Valor Liquido</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(totalLiquido)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
