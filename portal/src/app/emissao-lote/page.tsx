'use client';

import { useState, useRef } from 'react';
import { useEmpresa } from '@/lib/store';
import { formatCurrency, formatCpfCnpj } from '@/lib/utils';
import DashboardLayout from '@/components/layout/dashboard-layout';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';

interface ResultadoEmissao {
  linha: number;
  success: boolean;
  cpfCnpj: string;
  razaoSocial: string;
  valorServicos: number;
  numeroRps?: number;
  numeroNfse?: number;
  error?: string;
}

interface ResumoLote {
  totalPlanilha: number;
  totalValidos: number;
  totalEmitidos: number;
  totalErros: number;
  errosValidacao: number;
}

export default function EmissaoLotePage() {
  const empresa = useEmpresa();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<ResultadoEmissao[]>([]);
  const [errosValidacao, setErrosValidacao] = useState<string[]>([]);
  const [resumo, setResumo] = useState<ResumoLote | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivo(file);
    setResultados([]);
    setErrosValidacao([]);
    setResumo(null);

    // Preview da planilha
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      setPreview(rows.slice(0, 10)); // Mostra primeiras 10 linhas
    };
    reader.readAsArrayBuffer(file);
  };

  const handleEmitirLote = async () => {
    if (!arquivo || !empresa?.id) return;

    setLoading(true);
    setResultados([]);
    setErrosValidacao([]);
    setResumo(null);

    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      formData.append('empresaId', empresa.id);

      const res = await fetch('/api/nfse/lote', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setResumo(data.resumo);
        setResultados(data.resultados || []);
        setErrosValidacao(data.errosValidacao || []);
      } else {
        setErrosValidacao(data.errosValidacao || [data.error || 'Erro desconhecido']);
      }
    } catch {
      setErrosValidacao(['Erro de conexao com o servidor']);
    } finally {
      setLoading(false);
    }
  };

  const downloadModelo = () => {
    const modelo = [
      {
        'CPF/CNPJ': '12.345.678/0001-90',
        'Razao Social': 'Empresa Exemplo LTDA',
        'Email': 'contato@exemplo.com',
        'Telefone': '(16) 99999-9999',
        'CEP': '14000-000',
        'Endereco': 'Rua Exemplo',
        'Numero': '100',
        'Complemento': 'Sala 1',
        'Bairro': 'Centro',
        'UF': 'SP',
        'Valor Servicos': 1500.00,
        'Discriminacao': 'Prestacao de servicos de consultoria conforme contrato.',
        'Item LC 116': '17.01',
        'CNAE': '6201-5/01',
        'ISS Retido': 'Nao',
        'Ret. PIS': 0,
        'Ret. COFINS': 0,
        'Ret. INSS': 0,
        'Ret. IRRF': 0,
        'Ret. CSLL': 0,
      },
      {
        'CPF/CNPJ': '123.456.789-00',
        'Razao Social': 'Joao da Silva',
        'Email': 'joao@email.com',
        'Telefone': '(16) 98888-8888',
        'CEP': '14050-000',
        'Endereco': 'Av. Brasil',
        'Numero': '200',
        'Complemento': '',
        'Bairro': 'Jardim Sumare',
        'UF': 'SP',
        'Valor Servicos': 3000.00,
        'Discriminacao': 'Servicos de desenvolvimento de software.',
        'Item LC 116': '01.07',
        'CNAE': '6201-5/01',
        'ISS Retido': 'Nao',
        'Ret. PIS': 0,
        'Ret. COFINS': 0,
        'Ret. INSS': 0,
        'Ret. IRRF': 0,
        'Ret. CSLL': 0,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(modelo);

    // Define larguras das colunas
    ws['!cols'] = [
      { wch: 20 }, // CPF/CNPJ
      { wch: 30 }, // Razao Social
      { wch: 25 }, // Email
      { wch: 18 }, // Telefone
      { wch: 12 }, // CEP
      { wch: 25 }, // Endereco
      { wch: 8 },  // Numero
      { wch: 15 }, // Complemento
      { wch: 18 }, // Bairro
      { wch: 5 },  // UF
      { wch: 15 }, // Valor Servicos
      { wch: 50 }, // Discriminacao
      { wch: 12 }, // Item LC 116
      { wch: 12 }, // CNAE
      { wch: 10 }, // ISS Retido
      { wch: 10 }, // Ret. PIS
      { wch: 10 }, // Ret. COFINS
      { wch: 10 }, // Ret. INSS
      { wch: 10 }, // Ret. IRRF
      { wch: 10 }, // Ret. CSLL
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo Emissao');

    // Adiciona aba de instrucoes
    const instrucoes = [
      { 'Campo': 'CPF/CNPJ', 'Obrigatorio': 'Sim', 'Descricao': 'CPF (11 digitos) ou CNPJ (14 digitos) do tomador. Aceita com ou sem formatacao.' },
      { 'Campo': 'Razao Social', 'Obrigatorio': 'Sim', 'Descricao': 'Nome ou razao social do tomador do servico.' },
      { 'Campo': 'Email', 'Obrigatorio': 'Nao', 'Descricao': 'Email do tomador para envio da nota.' },
      { 'Campo': 'Telefone', 'Obrigatorio': 'Nao', 'Descricao': 'Telefone do tomador.' },
      { 'Campo': 'CEP', 'Obrigatorio': 'Nao', 'Descricao': 'CEP do endereco do tomador.' },
      { 'Campo': 'Endereco', 'Obrigatorio': 'Nao', 'Descricao': 'Logradouro do tomador.' },
      { 'Campo': 'Numero', 'Obrigatorio': 'Nao', 'Descricao': 'Numero do endereco. Use S/N se nao houver.' },
      { 'Campo': 'Complemento', 'Obrigatorio': 'Nao', 'Descricao': 'Complemento do endereco (sala, andar, etc).' },
      { 'Campo': 'Bairro', 'Obrigatorio': 'Nao', 'Descricao': 'Bairro do tomador.' },
      { 'Campo': 'UF', 'Obrigatorio': 'Nao', 'Descricao': 'Sigla do estado (SP, MG, RJ, etc).' },
      { 'Campo': 'Valor Servicos', 'Obrigatorio': 'Sim', 'Descricao': 'Valor total dos servicos prestados. Usar ponto como separador decimal.' },
      { 'Campo': 'Discriminacao', 'Obrigatorio': 'Sim', 'Descricao': 'Descricao detalhada dos servicos prestados.' },
      { 'Campo': 'Item LC 116', 'Obrigatorio': 'Nao', 'Descricao': 'Codigo do item da lista de servicos (LC 116/2003). Ex: 01.07, 17.01. Se vazio, usa o padrao da empresa.' },
      { 'Campo': 'CNAE', 'Obrigatorio': 'Nao', 'Descricao': 'Codigo CNAE. Se vazio, usa o padrao da empresa.' },
      { 'Campo': 'ISS Retido', 'Obrigatorio': 'Nao', 'Descricao': 'Sim ou Nao. Se o ISS sera retido na fonte.' },
      { 'Campo': 'Ret. PIS', 'Obrigatorio': 'Nao', 'Descricao': 'Valor da retencao de PIS.' },
      { 'Campo': 'Ret. COFINS', 'Obrigatorio': 'Nao', 'Descricao': 'Valor da retencao de COFINS.' },
      { 'Campo': 'Ret. INSS', 'Obrigatorio': 'Nao', 'Descricao': 'Valor da retencao de INSS.' },
      { 'Campo': 'Ret. IRRF', 'Obrigatorio': 'Nao', 'Descricao': 'Valor da retencao de IRRF.' },
      { 'Campo': 'Ret. CSLL', 'Obrigatorio': 'Nao', 'Descricao': 'Valor da retencao de CSLL.' },
    ];

    const wsInst = XLSX.utils.json_to_sheet(instrucoes);
    wsInst['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucoes');

    XLSX.writeFile(wb, 'modelo-emissao-nfse.xlsx');
  };

  const exportResultados = () => {
    if (resultados.length === 0) return;

    const data = resultados.map(r => ({
      'Linha': r.linha,
      'CPF/CNPJ': r.cpfCnpj,
      'Razao Social': r.razaoSocial,
      'Valor': r.valorServicos,
      'Status': r.success ? 'Emitida' : 'Erro',
      'Numero RPS': r.numeroRps || '',
      'Numero NFSe': r.numeroNfse || '',
      'Erro': r.error || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
    XLSX.writeFile(wb, `resultado-lote-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Emissao em Lote</h1>
            <p className="mt-1 text-gray-500">
              Emita multiplas notas fiscais de uma vez via planilha
            </p>
          </div>
          <button
            onClick={downloadModelo}
            className="btn btn-outline flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Baixar Planilha Modelo
          </button>
        </div>

        {/* Upload */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-8 transition hover:border-blue-400 hover:bg-blue-50/50"
            >
              <Upload className="h-10 w-10 text-gray-400" />
              <div className="text-center">
                <p className="font-medium text-gray-700">
                  {arquivo ? arquivo.name : 'Clique para selecionar a planilha'}
                </p>
                <p className="text-sm text-gray-500">
                  Formatos aceitos: .xlsx, .xls, .csv
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />

            {arquivo && !loading && !resumo && (
              <button
                onClick={handleEmitirLote}
                className="btn btn-primary flex items-center gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Emitir {preview.length > 0 ? `${preview.length}+ notas` : 'Notas'}
              </button>
            )}

            {loading && (
              <div className="flex items-center gap-3 text-blue-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="font-medium">Processando emissao em lote... Aguarde.</p>
              </div>
            )}
          </div>
        </div>

        {/* Preview da planilha */}
        {preview.length > 0 && !resumo && (
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold text-gray-900">
                Pre-visualizacao ({preview.length} primeiras linhas)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {Object.keys(preview[0]).map((col) => (
                      <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {Object.values(row).map((val, i) => (
                        <td key={i} className="whitespace-nowrap px-3 py-2 text-gray-700">
                          {String(val).substring(0, 40)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Erros de validacao */}
        {errosValidacao.length > 0 && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <h3 className="font-semibold text-yellow-800">
                Erros de Validacao ({errosValidacao.length})
              </h3>
            </div>
            <ul className="space-y-1 text-sm text-yellow-700">
              {errosValidacao.map((erro, idx) => (
                <li key={idx}>{erro}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Resumo */}
        {resumo && (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Resultado do Lote</h3>
              <button
                onClick={exportResultados}
                className="btn btn-outline flex items-center gap-2 text-sm"
              >
                <Download className="h-4 w-4" />
                Exportar Resultados
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-500">Total na Planilha</p>
                <p className="text-xl font-bold">{resumo.totalPlanilha}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-sm text-blue-600">Validos</p>
                <p className="text-xl font-bold text-blue-700">{resumo.totalValidos}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-sm text-green-600">Emitidos</p>
                <p className="text-xl font-bold text-green-700">{resumo.totalEmitidos}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-sm text-red-600">Erros</p>
                <p className="text-xl font-bold text-red-700">{resumo.totalErros}</p>
              </div>
            </div>
          </div>
        )}

        {/* Resultados detalhados */}
        {resultados.length > 0 && (
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold text-gray-900">Detalhes por Nota</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left font-medium text-gray-500">
                    <th className="px-4 py-3">Linha</th>
                    <th className="px-4 py-3">Tomador</th>
                    <th className="px-4 py-3">CPF/CNPJ</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">RPS</th>
                    <th className="px-4 py-3">NFSe</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resultados.map((r, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{r.linha}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.razaoSocial}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCpfCnpj(r.cpfCnpj)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(r.valorServicos)}</td>
                      <td className="px-4 py-3 text-gray-700">{r.numeroRps || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{r.numeroNfse || '-'}</td>
                      <td className="px-4 py-3">
                        {r.success ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            <CheckCircle className="h-3 w-3" />
                            Emitida
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700" title={r.error}>
                            <XCircle className="h-3 w-3" />
                            Erro
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
