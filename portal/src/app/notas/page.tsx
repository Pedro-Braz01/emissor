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

  const exportXML = () => {
    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const buildNfseXml = (nota: Nota) => {
      const numero = nota.numero_nfse?.toString() || '';
      const codigo = nota.codigo_verificacao || '';
      const dataEmissao = nota.data_emissao || '';
      const valorServicos = Number(nota.valor_servicos).toFixed(2);
      const valorIss = Number(nota.valor_iss).toFixed(2);
      const prestadorRazao = escapeXml(empresa?.razaoSocial || '');
      const tomadorRazao = escapeXml(nota.tomador_razao_social || '');
      const tomadorCpfCnpj = escapeXml(nota.tomador_cnpj_cpf || '');
      const discriminacao = escapeXml(nota.discriminacao || '');

      return `  <CompNfse>
    <Nfse>
      <InfNfse>
        <Numero>${numero}</Numero>
        <CodigoVerificacao>${codigo}</CodigoVerificacao>
        <DataEmissao>${dataEmissao}</DataEmissao>
        <Valores>
          <ValorServicos>${valorServicos}</ValorServicos>
          <ValorIss>${valorIss}</ValorIss>
        </Valores>
        <PrestadorServico>
          <RazaoSocial>${prestadorRazao}</RazaoSocial>
        </PrestadorServico>
        <TomadorServico>
          <RazaoSocial>${tomadorRazao}</RazaoSocial>
          <CpfCnpj>${tomadorCpfCnpj}</CpfCnpj>
        </TomadorServico>
        <Discriminacao>${discriminacao}</Discriminacao>
      </InfNfse>
    </Nfse>
  </CompNfse>`;
    };

    let xmlContent: string;
    if (notasFiltradas.length === 1) {
      xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n${buildNfseXml(notasFiltradas[0]).trim()}`;
    } else {
      const nfseElements = notasFiltradas.map(buildNfseXml).join('\n');
      xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ListaNfse>\n${nfseElements}\n</ListaNfse>`;
    }

    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notas_${new Date().toISOString().slice(0, 10)}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Consultar Notas</h1>
            <p className="mt-1 text-gray-500">
              {totalCount} nota{totalCount !== 1 ? 's' : ''} encontrada{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportXML} className="btn btn-outline" disabled={notasFiltradas.length === 0}>
              <FileText className="h-4 w-4" />
              XML
            </button>
            <button onClick={exportPDF} className="btn btn-outline" disabled={notasFiltradas.length === 0}>
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button onClick={exportXLS} className="btn btn-outline" disabled={notasFiltradas.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-5">
            {/* Busca */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
        <div className="rounded-xl border bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : notasFiltradas.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-gray-500">Nenhuma nota encontrada</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-sm font-medium text-gray-500">
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Tomador</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {notasFiltradas.map((nota) => {
                      const statusColor = statusColors[nota.status] || statusColors.RASCUNHO;
                      return (
                        <tr key={nota.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">
                                {nota.numero_nfse ? `NFSe ${nota.numero_nfse}` : '-'}
                              </p>
                              <p className="text-sm text-gray-500">
                                RPS {nota.numero_rps}/{nota.serie_rps}
                              </p>
                            </div>
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
                          <td className="px-4 py-3">
                            <p className="text-gray-900">{formatDate(nota.data_emissao)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">
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
                                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {nota.xml_enviado && (
                                <button
                                  onClick={() => handleDownloadXml(nota, 'xml_enviado')}
                                  className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                  title="Baixar XML enviado"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              )}
                              {nota.xml_retorno && (
                                <button
                                  onClick={() => handleDownloadXml(nota, 'xml_retorno')}
                                  className="rounded-lg p-2 text-gray-400 hover:bg-green-50 hover:text-green-600"
                                  title="Baixar XML retorno"
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                              )}
                              {nota.status === 'emitida' && nota.numero_nfse && (
                                <button
                                  onClick={() => handleCancelar(nota)}
                                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
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
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-sm text-gray-500">
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
                    <span className="text-sm text-gray-600">
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
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white">
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="text-lg font-semibold">
                  {notaSelecionada.numero_nfse
                    ? `NFSe ${notaSelecionada.numero_nfse}`
                    : `RPS ${notaSelecionada.numero_rps}`}
                </h2>
                <button
                  onClick={() => setNotaSelecionada(null)}
                  className="rounded-lg p-2 hover:bg-gray-100"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-gray-500">Numero NFSe</p>
                    <p className="font-medium">{notaSelecionada.numero_nfse || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Codigo Verificacao</p>
                    <p className="font-medium">{notaSelecionada.codigo_verificacao || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Tomador</p>
                    <p className="font-medium">{notaSelecionada.tomador_razao_social || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">CPF/CNPJ</p>
                    <p className="font-medium">
                      {notaSelecionada.tomador_cnpj_cpf
                        ? formatCpfCnpj(notaSelecionada.tomador_cnpj_cpf)
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Valor Servicos</p>
                    <p className="font-medium">{formatCurrency(Number(notaSelecionada.valor_servicos))}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ISS</p>
                    <p className="font-medium">{formatCurrency(Number(notaSelecionada.valor_iss))}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">Discriminacao</p>
                    <p className="whitespace-pre-wrap text-sm">{notaSelecionada.discriminacao}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {notaSelecionada.xml_enviado && (
                    <button
                      onClick={() => handleDownloadXml(notaSelecionada, 'xml_enviado')}
                      className="btn btn-outline flex-1 flex items-center justify-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      XML Enviado
                    </button>
                  )}
                  {notaSelecionada.xml_retorno && (
                    <button
                      onClick={() => handleDownloadXml(notaSelecionada, 'xml_retorno')}
                      className="btn btn-outline flex-1 flex items-center justify-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      XML Retorno
                    </button>
                  )}
                  {notaSelecionada.pdf_url && (
                    <a
                      href={notaSelecionada.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      PDF NFSe
                    </a>
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
