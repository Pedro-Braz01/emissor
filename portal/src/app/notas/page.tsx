'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase-client';
import { useEmpresa } from '@/lib/store';
import { formatCurrency, formatDate, formatCpfCnpj, statusColors, statusLabels, cn } from '@/lib/utils';
import DashboardLayout from '@/components/layout/dashboard-layout';
import {
  Search,
  Filter,
  Download,
  Eye,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { gerarPdfNfse } from '@/services/pdf-nfse';

interface Nota {
  id: string;
  numero_nfse: number | null;
  numero_rps: number;
  serie_rps: string;
  status: string;
  valor_servicos: number;
  valor_iss: number;
  discriminacao: string;
  data_emissao: string;
  created_at: string;
  codigo_verificacao: string | null;
  pdf_url: string | null;
  xml_enviado: string | null;
  xml_retorno: string | null;
  tomador_razao_social: string;
  tomador_cnpj_cpf: string;
  empresa_id: string;
}

export default function NotasPage() {
  const empresa = useEmpresa();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');

  // Modal de detalhes
  const [notaSelecionada, setNotaSelecionada] = useState<Nota | null>(null);

  useEffect(() => {
    if (empresa?.id) {
      loadNotas();
    }
  }, [empresa?.id, page, filtroStatus, filtroDataInicio, filtroDataFim]);

  const loadNotas = async () => {
    setLoading(true);
    const supabase = createClient();

    try {
      let query = supabase
        .from('notas_fiscais')
        .select(`
          id,
          empresa_id,
          numero_nfse,
          numero_rps,
          serie_rps,
          status,
          valor_servicos,
          valor_iss,
          discriminacao,
          data_emissao,
          created_at,
          codigo_verificacao,
          pdf_url,
          xml_enviado,
          xml_retorno,
          tomador_razao_social,
          tomador_cnpj_cpf
        `, { count: 'exact' })
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filtroStatus) {
        query = query.eq('status', filtroStatus);
      }
      if (filtroDataInicio) {
        query = query.gte('data_emissao', filtroDataInicio);
      }
      if (filtroDataFim) {
        query = query.lte('data_emissao', filtroDataFim);
      }

      // Paginação
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;

      setNotas(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Erro ao carregar notas:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // Filtra por busca (cliente side para número/tomador)
  const notasFiltradas = notas.filter((nota) => {
    if (!filtroBusca) return true;
    const busca = filtroBusca.toLowerCase();
    return (
      nota.numero_nfse?.toString().includes(busca) ||
      nota.numero_rps.toString().includes(busca) ||
      nota.tomador_razao_social?.toLowerCase().includes(busca) ||
      nota.tomador_cnpj_cpf?.includes(busca)
    );
  });

  // Handlers para cancelar e download
  const handleCancelar = async (nota: Nota) => {
    if (!confirm(`Deseja cancelar a NFSe ${nota.numero_nfse}?`)) return;
    try {
      const res = await fetch('/api/nfse/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: nota.empresa_id,
          numeroNfse: nota.numero_nfse,
          codigoCancelamento: '1',
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('NFSe cancelada com sucesso!');
        loadNotas();
      } else {
        alert(`Erro ao cancelar: ${data.error}`);
      }
    } catch {
      alert('Erro de conexão ao cancelar');
    }
  };

  const handleDownloadXml = (nota: Nota, tipo: 'xml_enviado' | 'xml_retorno') => {
    window.open(`/api/nfse/download?notaId=${nota.id}&tipo=${tipo}`, '_blank');
  };

  const handleDownloadPdfNota = async (nota: Nota) => {
    try {
      const res = await fetch(`/api/nfse/download?notaId=${nota.id}&tipo=pdf`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || 'Erro ao gerar PDF');
        return;
      }
      const { nota: n, tomador, prestador } = json.data;
      if (!prestador) {
        alert('Dados do prestador (empresa) não encontrados');
        return;
      }

      const aliquotaPct = Number(n.aliquotaIss || 0) * 100;

      const doc = gerarPdfNfse({
        numeroNfse: n.numeroNfse?.toString() || '-',
        dataEmissao: n.dataEmissao ? formatDate(n.dataEmissao) : '-',
        competencia: n.competencia ? formatDate(n.competencia) : '-',
        codigoAutenticidade: n.codigoVerificacao || '-',
        naturezaOperacao: 'Tributação no município',
        numeroRps: n.numeroRps?.toString(),
        serieRps: n.serieRps,
        dataEmissaoRps: n.dataEmissao ? formatDate(n.dataEmissao) : undefined,
        localServicos: `${prestador.cidade}/${prestador.uf}`,
        municipioIncidencia: `${prestador.cidade}/${prestador.uf}`,
        prestador: {
          razaoSocial: prestador.razaoSocial || '',
          cnpj: prestador.cnpj || '',
          inscricaoMunicipal: prestador.inscricaoMunicipal || '',
          endereco: prestador.endereco || '',
          cep: prestador.cep || '',
          telefone: prestador.telefone || '',
          email: prestador.email || '',
          cidade: prestador.cidade || 'Ribeirão Preto',
          uf: prestador.uf || 'SP',
        },
        tomador: {
          cpfCnpj: tomador.cpfCnpj || '',
          razaoSocial: tomador.razaoSocial || '',
          endereco: tomador.endereco || '',
          numero: tomador.numero || '',
          complemento: tomador.complemento || '',
          bairro: tomador.bairro || '',
          cep: tomador.cep || '',
          cidade: tomador.cidade || '',
          uf: tomador.uf || '',
          telefone: tomador.telefone || '',
          email: tomador.email || '',
        },
        servico: {
          discriminacao: n.discriminacao || '',
          atividadeMunicipio: n.atividadeMunicipal || '',
          aliquota: aliquotaPct,
          itemListaServico: n.itemLc116 || '',
          codigoNbs: n.codigoNbs || '',
          codigoCnae: n.codigoCnae || '',
        },
        valores: {
          valorServicos: Number(n.valorServicos || 0),
          descontoIncondicionado: Number(n.descontoIncondicionado || 0),
          deducoes: Number(n.valorDeducoes || 0),
          baseCalculo: Number(n.valorBaseCalculo || n.valorServicos || 0),
          totalIssqn: Number(n.valorIss || 0),
          issRetido: !!n.issRetido,
          descontoCondicionado: Number(n.descontoCondicionado || 0),
          pis: Number(n.valorPis || 0),
          cofins: Number(n.valorCofins || 0),
          inss: Number(n.valorInss || 0),
          irrf: Number(n.valorIrrf || 0),
          csll: Number(n.valorCsll || 0),
          outrasRetencoes: 0,
          issRetidoValor: n.issRetido ? Number(n.valorIss || 0) : 0,
          valorLiquido: Number(n.valorLiquido || n.valorServicos || 0),
        },
        regimeTributario: prestador.regimeTributario || '',
      });

      doc.save(`NFSe_${n.numeroNfse || n.numeroRps}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar PDF da nota');
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Consulta de Notas Fiscais', 14, 15);
    doc.setFontSize(10);
    doc.text(`Empresa: ${empresa?.razaoSocial || ''}`, 14, 22);
    if (filtroDataInicio || filtroDataFim) {
      doc.text(`Período: ${filtroDataInicio || '...'} a ${filtroDataFim || '...'}`, 14, 28);
    }

    const rows = notasFiltradas.map(n => [
      n.numero_nfse ? `NFSe ${n.numero_nfse}` : `RPS ${n.numero_rps}`,
      formatDate(n.data_emissao),
      n.tomador_razao_social || '-',
      n.tomador_cnpj_cpf ? formatCpfCnpj(n.tomador_cnpj_cpf) : '-',
      formatCurrency(Number(n.valor_servicos)),
      formatCurrency(Number(n.valor_iss)),
      statusLabels[n.status] || n.status,
    ]);

    (doc as any).autoTable({
      startY: filtroDataInicio || filtroDataFim ? 33 : 27,
      head: [['Número', 'Data', 'Tomador', 'CPF/CNPJ', 'Valor', 'ISS', 'Status']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`notas_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportXLS = () => {
    const data = notasFiltradas.map(n => ({
      'Numero NFSe': n.numero_nfse || '',
      'RPS': `${n.numero_rps}/${n.serie_rps}`,
      'Data Emissao': formatDate(n.data_emissao),
      'Tomador': n.tomador_razao_social || '',
      'CPF/CNPJ': n.tomador_cnpj_cpf ? formatCpfCnpj(n.tomador_cnpj_cpf) : '',
      'Valor Servicos': Number(n.valor_servicos),
      'ISS': Number(n.valor_iss),
      'Status': statusLabels[n.status] || n.status,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Notas');
    XLSX.writeFile(wb, `notas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Consultar Notas</h1>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              {totalCount} nota{totalCount !== 1 ? 's' : ''} encontrada{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportPDF} className="btn btn-outline" disabled={notasFiltradas.length === 0}>
              <Download className="h-4 w-4" />
              Lista PDF
            </button>
            <button onClick={exportXLS} className="btn btn-outline" disabled={notasFiltradas.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-5">
            {/* Busca */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por número, tomador..."
                  className="input pl-9"
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <select
                className="input"
                value={filtroStatus}
                onChange={(e) => {
                  setFiltroStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os status</option>
                <option value="emitida">Emitida</option>
                <option value="cancelada">Cancelada</option>
                <option value="erro">Erro</option>
                <option value="pendente">Pendente</option>
              </select>
            </div>

            {/* Data Início */}
            <div>
              <input
                type="date"
                className="input"
                value={filtroDataInicio}
                onChange={(e) => {
                  setFiltroDataInicio(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Data Fim */}
            <div>
              <input
                type="date"
                className="input"
                value={filtroDataFim}
                onChange={(e) => {
                  setFiltroDataFim(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : notasFiltradas.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-700 dark:text-gray-300" />
              <p className="mt-4 text-gray-500 dark:text-gray-400">Nenhuma nota encontrada</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Tomador</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {notasFiltradas.map((nota) => {
                      const statusColor = statusColors[nota.status] || statusColors.RASCUNHO;
                      return (
                        <tr key={nota.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {nota.numero_nfse ? `NFSe ${nota.numero_nfse}` : '-'}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                RPS {nota.numero_rps}/{nota.serie_rps}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {nota.tomador_razao_social || '-'}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {nota.tomador_cnpj_cpf
                                  ? formatCpfCnpj(nota.tomador_cnpj_cpf)
                                  : '-'}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-gray-900 dark:text-white">{formatDate(nota.data_emissao)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatCurrency(Number(nota.valor_servicos))}
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
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setNotaSelecionada(nota)}
                                className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {nota.numero_nfse && (
                                <button
                                  onClick={() => handleDownloadPdfNota(nota)}
                                  className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:bg-primary-50 hover:text-primary-600"
                                  title="Baixar DANFSe (PDF)"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              )}
                              {nota.xml_retorno && (
                                <button
                                  onClick={() => handleDownloadXml(nota, 'xml_retorno')}
                                  className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:bg-green-50 hover:text-green-600"
                                  title="Baixar XML da NFS-e (validado pela prefeitura)"
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                              )}
                              {nota.status === 'emitida' && nota.numero_nfse && (
                                <button
                                  onClick={() => handleCancelar(nota)}
                                  className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  title="Cancelar NFSe"
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Mostrando {(page - 1) * pageSize + 1} a{' '}
                    {Math.min(page * pageSize, totalCount)} de {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn btn-outline p-2 disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {page} de {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="btn btn-outline p-2 disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal de Detalhes */}
        {notaSelecionada && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {notaSelecionada.numero_nfse
                    ? `NFSe ${notaSelecionada.numero_nfse}`
                    : `RPS ${notaSelecionada.numero_rps}`}
                </h2>
                <button
                  onClick={() => setNotaSelecionada(null)}
                  className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Numero NFSe</p>
                    <p className="font-medium text-gray-900 dark:text-white">{notaSelecionada.numero_nfse || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Codigo Verificacao</p>
                    <p className="font-medium text-gray-900 dark:text-white">{notaSelecionada.codigo_verificacao || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Tomador</p>
                    <p className="font-medium text-gray-900 dark:text-white">{notaSelecionada.tomador_razao_social || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">CPF/CNPJ</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {notaSelecionada.tomador_cnpj_cpf
                        ? formatCpfCnpj(notaSelecionada.tomador_cnpj_cpf)
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Valor Servicos</p>
                    <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(Number(notaSelecionada.valor_servicos))}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">ISS</p>
                    <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(Number(notaSelecionada.valor_iss))}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Discriminacao</p>
                    <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">{notaSelecionada.discriminacao}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {notaSelecionada.numero_nfse && (
                    <button
                      onClick={() => handleDownloadPdfNota(notaSelecionada)}
                      className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      DANFSe (PDF)
                    </button>
                  )}
                  {notaSelecionada.xml_retorno && (
                    <button
                      onClick={() => handleDownloadXml(notaSelecionada, 'xml_retorno')}
                      className="btn btn-outline flex-1 flex items-center justify-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      XML NFS-e
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
