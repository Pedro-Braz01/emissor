'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useEmpresa } from '@/lib/store';
import { formatCurrency, formatCpfCnpj, validateCpfCnpj } from '@/lib/utils';
import { fetchCnpj, fetchCep } from '@/lib/brasil-api';
import { createClientSupabaseClient } from '@/lib/supabase-client';
import DashboardLayout from '@/components/layout/dashboard-layout';
import {
  CNAES, LC116_ITEMS, NBS_ITEMS,
  getLc116ByCnae, searchCnae, searchNbs,
  type CnaeItem, type Lc116Item, type NbsItem,
} from '@/lib/dados-prefeitura';
import {
  ATIVIDADES_MUNICIPAIS, searchAtividadeMunicipal,
  type AtividadeMunicipal,
} from '@/lib/dados-atividades-municipais';
import {
  FileText,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
} from 'lucide-react';

// ── Tipos ────────────────────────────────────────────
interface ConfigTributaria {
  aliquota_iss: number;
  aliquota_pis: number;
  aliquota_cofins: number;
  aliquota_csll: number;
  aliquota_irrf: number;
  aliquota_inss: number;
  iss_retido_fonte: boolean;
  codigo_servico: string;
  item_lista_servico: string;
}

// ── Classes CSS (dark theme) ─────────────────────────
const inputCls = `w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm
  placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`;

const selectCls = `w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`;

const labelCls = 'block text-sm font-medium text-gray-300 mb-1';

const sectionCls = 'bg-gray-800 rounded-xl border border-gray-700 p-5';

const readonlyCls = `w-full bg-gray-600/50 border border-gray-600 rounded-lg px-3 py-2 text-gray-300 text-sm cursor-not-allowed`;

// ── Componente Principal ─────────────────────────────
export default function EmitirPage() {
  const empresa = useEmpresa();
  const [loading, setLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [config, setConfig] = useState<ConfigTributaria | null>(null);

  // Estado do resultado
  const [resultado, setResultado] = useState<{
    success: boolean;
    numeroRps?: number;
    numeroNfse?: string;
    codigoVerificacao?: string;
    error?: string;
  } | null>(null);

  // ── DADOS DA NOTA (Header) ──
  const [exigibilidadeIss, setExigibilidadeIss] = useState('exigivel');
  const [numProcesso, setNumProcesso] = useState('');
  const [municipioIncidencia, setMunicipioIncidencia] = useState('Ribeirão Preto (SP)');
  const [municipioPrestacao, setMunicipioPrestacao] = useState('Ribeirão Preto (SP)');
  const [competencia, setCompetencia] = useState(new Date().toISOString().split('T')[0]);

  // ── DADOS DO CLIENTE (Tomador) ──
  const [tipoDocumento, setTipoDocumento] = useState<'cnpj' | 'cpf' | 'ext'>('cnpj');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('');
  const [tomadorCep, setTomadorCep] = useState('');
  const [tomadorEndereco, setTomadorEndereco] = useState('');
  const [tomadorNumero, setTomadorNumero] = useState('');
  const [tomadorComplemento, setTomadorComplemento] = useState('');
  const [tomadorBairro, setTomadorBairro] = useState('');
  const [tomadorCidade, setTomadorCidade] = useState('');
  const [tomadorUf, setTomadorUf] = useState('');
  const [tomadorTelefone, setTomadorTelefone] = useState('');
  const [tomadorEmail, setTomadorEmail] = useState('');
  const [enviarParaTomador, setEnviarParaTomador] = useState(false);
  const [exterior, setExterior] = useState(false);

  // ── SERVIÇO ──
  const [cnaeInput, setCnaeInput] = useState('');
  const [itemLc116, setItemLc116] = useState('');
  const [atividadeMunicipal, setAtividadeMunicipal] = useState('');
  const [codigoNbs, setCodigoNbs] = useState('');
  const [valorServicos, setValorServicos] = useState('');
  const [aliquotaIss, setAliquotaIss] = useState('');
  const [discriminacao, setDiscriminacao] = useState('');
  const [informacoesAdicionais, setInformacoesAdicionais] = useState('');

  // ── Dropdowns CNAE / NBS ──
  const [cnaeSearch, setCnaeSearch] = useState('');
  const [cnaeDropdownOpen, setCnaeDropdownOpen] = useState(false);
  const [selectedCnae, setSelectedCnae] = useState<CnaeItem | null>(null);
  const [filteredCnaes, setFilteredCnaes] = useState<CnaeItem[]>([]);
  const [lc116Options, setLc116Options] = useState<Lc116Item[]>([]);

  const [nbsSearch, setNbsSearch] = useState('');
  const [nbsDropdownOpen, setNbsDropdownOpen] = useState(false);
  const [selectedNbs, setSelectedNbs] = useState<NbsItem | null>(null);
  const [filteredNbs, setFilteredNbs] = useState<NbsItem[]>([]);

  // ── Dropdown Atividade Municipal ──
  const [atividadeMunSearch, setAtividadeMunSearch] = useState('');
  const [atividadeMunDropdownOpen, setAtividadeMunDropdownOpen] = useState(false);
  const [selectedAtividadeMun, setSelectedAtividadeMun] = useState<AtividadeMunicipal | null>(null);
  const [filteredAtividadesMun, setFilteredAtividadesMun] = useState<AtividadeMunicipal[]>([]);

  // ── CNAEs cadastrados da empresa ──
  const [cnaesDaEmpresa, setCnaesDaEmpresa] = useState<CnaeItem[]>([]);

  const cnaeRef = useRef<HTMLDivElement>(null);
  const nbsRef = useRef<HTMLDivElement>(null);
  const atividadeMunRef = useRef<HTMLDivElement>(null);

  // ── DESCONTOS ──
  const [descontoCondicionado, setDescontoCondicionado] = useState('0');
  const [descontoIncondicionado, setDescontoIncondicionado] = useState('0');
  const [deducoesBaseCalculo, setDeducoesBaseCalculo] = useState('0');

  // ── RETENÇÕES (editáveis, pré-preenchidas do config) ──
  const [retPis, setRetPis] = useState('0');
  const [retCofins, setRetCofins] = useState('0');
  const [retInss, setRetInss] = useState('0');
  const [retIrrf, setRetIrrf] = useState('0');
  const [retCsll, setRetCsll] = useState('0');
  const [outrasRetencoes, setOutrasRetencoes] = useState('0');
  const [issRetido, setIssRetido] = useState(false);

  // ── Carrega config tributária + CNAEs da empresa ──
  useEffect(() => {
    if (!empresa?.id) return;
    const supabase = createClientSupabaseClient();
    supabase
      .from('configuracoes_tributarias')
      .select('*')
      .eq('empresa_id', empresa.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setConfig(data as ConfigTributaria);
          setAliquotaIss(String(data.aliquota_iss ?? 2));
          setIssRetido(data.iss_retido_fonte ?? false);
        }
      });

    // Carrega CNAEs cadastrados da empresa
    supabase
      .from('empresas')
      .select('cnaes_cadastrados')
      .eq('id', empresa.id)
      .single()
      .then(({ data }) => {
        const cadastrados = (data as any)?.cnaes_cadastrados || [];
        if (cadastrados.length > 0) {
          // Mapeia para CnaeItem buscando LC116 correlations
          const mapped: CnaeItem[] = cadastrados.map((c: any) => {
            const full = CNAES.find(cn => cn.codigo === c.codigo);
            return { codigo: c.codigo, descricao: c.descricao, lc116: full?.lc116 || [] };
          });
          setCnaesDaEmpresa(mapped);

          // Auto-seleciona o CNAE padrão
          const padrao = cadastrados.find((c: any) => c.padrao);
          if (padrao && !cnaeInput) {
            const item = mapped.find(m => m.codigo === padrao.codigo);
            if (item) {
              handleSelectCnae(item);
            }
          }
        }
      });
  }, [empresa?.id]);

  // ── Recalcula retenções quando valor muda ──
  const recalcRetencoes = useCallback((valor: string) => {
    const v = parseFloat(valor) || 0;
    if (!config || v <= 0) return;
    setRetPis(((v * config.aliquota_pis) / 100).toFixed(2));
    setRetCofins(((v * config.aliquota_cofins) / 100).toFixed(2));
    setRetInss(((v * config.aliquota_inss) / 100).toFixed(2));
    setRetIrrf(((v * config.aliquota_irrf) / 100).toFixed(2));
    setRetCsll(((v * config.aliquota_csll) / 100).toFixed(2));
  }, [config]);

  const handleValorChange = (v: string) => {
    setValorServicos(v);
    recalcRetencoes(v);
  };

  // ── Cálculos realtime ──
  const numValor = parseFloat(valorServicos) || 0;
  const numDescCond = parseFloat(descontoCondicionado) || 0;
  const numDescIncond = parseFloat(descontoIncondicionado) || 0;
  const numDeducoes = parseFloat(deducoesBaseCalculo) || 0;
  const numAliqIss = parseFloat(aliquotaIss) || 0;

  const baseCalculo = Math.max(0, numValor - numDeducoes - numDescIncond);
  const totalIssqn = (baseCalculo * numAliqIss) / 100;

  const totalRetencoes =
    (parseFloat(retPis) || 0) +
    (parseFloat(retCofins) || 0) +
    (parseFloat(retInss) || 0) +
    (parseFloat(retIrrf) || 0) +
    (parseFloat(retCsll) || 0) +
    (parseFloat(outrasRetencoes) || 0) +
    (issRetido ? totalIssqn : 0);

  const valorLiquido = numValor - numDescIncond - totalRetencoes;

  // ── CNPJ Auto-fill ──
  const handleCnpjBlur = async () => {
    const digits = cpfCnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    const data = await fetchCnpj(digits);
    setCnpjLoading(false);
    if (data) {
      setRazaoSocial(data.razao_social);
      if (data.email) setTomadorEmail(data.email);
      if (data.telefone) setTomadorTelefone(data.telefone);
      if (data.cep) {
        setTomadorCep(data.cep);
        setTomadorEndereco(data.logradouro);
        setTomadorNumero(data.numero);
        setTomadorComplemento(data.complemento);
        setTomadorBairro(data.bairro);
        setTomadorUf(data.uf);
        setTomadorCidade(data.municipio);
      }
    }
  };

  // ── CEP Auto-fill ──
  const handleCepBlur = async () => {
    const digits = tomadorCep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    const data = await fetchCep(digits);
    setCepLoading(false);
    if (data) {
      setTomadorEndereco(data.street);
      setTomadorBairro(data.neighborhood);
      setTomadorUf(data.state);
      setTomadorCidade(data.city);
    }
  };

  // ── CNAE dropdown logic (usa CNAEs da empresa quando cadastrados) ──
  useEffect(() => {
    const source = cnaesDaEmpresa.length > 0 ? cnaesDaEmpresa : CNAES;
    if (cnaeSearch.length >= 1) {
      if (cnaesDaEmpresa.length > 0) {
        const q = cnaeSearch.toLowerCase();
        setFilteredCnaes(source.filter(c =>
          c.codigo.includes(q) || c.descricao.toLowerCase().includes(q)
        ).slice(0, 20));
      } else {
        setFilteredCnaes(searchCnae(cnaeSearch).slice(0, 20));
      }
    } else {
      setFilteredCnaes(source.slice(0, 20));
    }
  }, [cnaeSearch, cnaesDaEmpresa]);

  const handleSelectCnae = (item: CnaeItem) => {
    setSelectedCnae(item);
    setCnaeInput(item.codigo);
    setCnaeSearch(`${item.codigo} - ${item.descricao}`);
    setCnaeDropdownOpen(false);
    // Auto-fill LC116
    const lc116Items = getLc116ByCnae(item.codigo);
    setLc116Options(lc116Items);
    if (lc116Items.length === 1) {
      setItemLc116(lc116Items[0].codigo);
    } else if (lc116Items.length > 1) {
      setItemLc116('');
    }
  };

  // ── NBS dropdown logic ──
  useEffect(() => {
    if (nbsSearch.length >= 1) {
      setFilteredNbs(searchNbs(nbsSearch).slice(0, 20));
    } else {
      setFilteredNbs(NBS_ITEMS.slice(0, 20));
    }
  }, [nbsSearch]);

  const handleSelectNbs = (item: NbsItem) => {
    setSelectedNbs(item);
    setCodigoNbs(item.codigo);
    setNbsSearch(`${item.codigo} - ${item.descricao}`);
    setNbsDropdownOpen(false);
  };

  // ── Atividade Municipal dropdown logic (filtra por LC116 quando preenchido) ──
  useEffect(() => {
    // Remove dots and leading zeros: "04.01" → "0401" → "401"
    const lc116Prefix = itemLc116 ? itemLc116.replace(/\./g, '').replace(/^0+/, '') : '';
    let base = lc116Prefix
      ? ATIVIDADES_MUNICIPAIS.filter(a => a.codigo.startsWith(lc116Prefix))
      : ATIVIDADES_MUNICIPAIS;
    if (atividadeMunSearch.length >= 1) {
      const q = atividadeMunSearch.toLowerCase();
      base = base.filter(a => a.codigo.includes(q) || a.descricao.toLowerCase().includes(q));
    }
    setFilteredAtividadesMun(base.slice(0, 20));
  }, [atividadeMunSearch, itemLc116]);

  const handleSelectAtividadeMun = (item: AtividadeMunicipal) => {
    setSelectedAtividadeMun(item);
    setAtividadeMunicipal(item.codigo);
    setAtividadeMunSearch(`${item.codigo} - ${item.descricao}`);
    setAtividadeMunDropdownOpen(false);
    // Auto-fill aliquota ISS from atividade municipal
    const aliq = parseFloat(item.aliquota.replace('%', '').replace(',', '.'));
    if (!isNaN(aliq) && aliq > 0) {
      setAliquotaIss(String(aliq));
    }
  };

  // ── Click outside to close dropdowns ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cnaeRef.current && !cnaeRef.current.contains(e.target as Node)) {
        setCnaeDropdownOpen(false);
      }
      if (nbsRef.current && !nbsRef.current.contains(e.target as Node)) {
        setNbsDropdownOpen(false);
      }
      if (atividadeMunRef.current && !atividadeMunRef.current.contains(e.target as Node)) {
        setAtividadeMunDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── CPF/CNPJ formatação ──
  const handleCpfCnpjChange = (val: string) => {
    let v = val.replace(/\D/g, '');
    if (v.length <= 11) {
      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
        d ? `${a}.${b}.${c}-${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
      );
    } else {
      v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) =>
        e ? `${a}.${b}.${c}/${d}-${e}` : d ? `${a}.${b}.${c}/${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
      );
    }
    setCpfCnpj(v);
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!empresa?.id) { toast.error('Selecione uma empresa'); return; }
    if (!cpfCnpj || !razaoSocial) { toast.error('Preencha os dados do tomador'); return; }
    if (!numValor) { toast.error('Informe o valor dos serviços'); return; }
    if (!discriminacao || discriminacao.length < 10) { toast.error('Descreva o serviço (mínimo 10 caracteres)'); return; }

    setLoading(true);
    setResultado(null);

    try {
      const res = await fetch('/api/nfse/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: empresa.id,
          tomador: {
            cpfCnpj: cpfCnpj.replace(/\D/g, ''),
            razaoSocial,
            email: tomadorEmail || undefined,
            telefone: tomadorTelefone || undefined,
            endereco: {
              cep: tomadorCep,
              logradouro: tomadorEndereco,
              numero: tomadorNumero,
              complemento: tomadorComplemento,
              bairro: tomadorBairro,
              uf: tomadorUf,
            },
          },
          servico: {
            valorServicos: numValor,
            discriminacao,
            itemListaServico: itemLc116 || config?.item_lista_servico,
            issRetido,
            codigoCnae: cnaeInput,
            codigoNbs,
          },
          retencoes: {
            pis: parseFloat(retPis) || 0,
            cofins: parseFloat(retCofins) || 0,
            inss: parseFloat(retInss) || 0,
            irrf: parseFloat(retIrrf) || 0,
            csll: parseFloat(retCsll) || 0,
          },
          enviarParaTomador,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setResultado({ success: true, numeroRps: result.data.numeroRps, numeroNfse: result.data.numeroNfse, codigoVerificacao: result.data.codigoVerificacao });
        toast.success('NFSe emitida com sucesso!');
      } else {
        setResultado({ success: false, error: result.error });
        toast.error(result.error || 'Erro ao emitir');
      }
    } catch {
      setResultado({ success: false, error: 'Erro de conexão' });
      toast.error('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-900 -m-4 lg:-m-6 p-4 lg:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Emitir NFS-e</h1>
              <p className="text-gray-400 text-sm">{empresa?.razaoSocial || 'Selecione uma empresa'}</p>
            </div>
          </div>

          {/* Resultado */}
          {resultado && (
            <div className={`flex items-start gap-3 rounded-lg border p-4 ${resultado.success ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
              {resultado.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-400">NFSe emitida com sucesso!</p>
                    <p className="mt-1 text-sm text-green-300">RPS: {resultado.numeroRps} | Verificação: {resultado.codigoVerificacao}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-400">Erro na emissão</p>
                    <p className="mt-1 text-sm text-red-300">{resultado.error}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════ DADOS DA NOTA ═══════════════ */}
          <div className={sectionCls}>
            <h2 className="text-white font-semibold text-sm mb-4">Dados da nota</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Modelo do documento</label>
                <input value="NFS-e" readOnly className={readonlyCls} />
              </div>
              <div>
                <label className={labelCls}>Exigibilidade ISS</label>
                <select value={exigibilidadeIss} onChange={e => setExigibilidadeIss(e.target.value)} className={selectCls}>
                  <option value="exigivel">Exigível</option>
                  <option value="nao_incidencia">Não Incidência</option>
                  <option value="isencao">Isenção</option>
                  <option value="exportacao">Exportação</option>
                  <option value="imunidade">Imunidade</option>
                  <option value="suspensa_decisao_judicial">Suspensa por Decisão Judicial</option>
                  <option value="suspensa_proc_administrativo">Suspensa por Processo Administrativo</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>N° Processo Suspensão Exigibilidade</label>
                <input value={numProcesso} onChange={e => setNumProcesso(e.target.value)}
                  placeholder="Número do processo" className={inputCls}
                  disabled={!exigibilidadeIss.startsWith('suspensa')} />
              </div>
              <div>
                <label className={labelCls}>Município de incidência</label>
                <input value={municipioIncidencia} onChange={e => setMunicipioIncidencia(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Município de prestação</label>
                <input value={municipioPrestacao} onChange={e => setMunicipioPrestacao(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data de Competência</label>
                <input type="date" value={competencia} onChange={e => setCompetencia(e.target.value)}
                  className={inputCls} />
              </div>
            </div>
          </div>

          {/* ═══════════════ DADOS DO CLIENTE ═══════════════ */}
          <div className={sectionCls}>
            <h2 className="text-white font-semibold text-sm mb-4">Dados do cliente</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Nome / Razão Social *</label>
                <div className="relative">
                  <input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)}
                    placeholder="Nome / Razão Social" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>CPF/CNPJ *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input value={cpfCnpj}
                      onChange={e => handleCpfCnpjChange(e.target.value)}
                      onBlur={handleCnpjBlur}
                      placeholder="00.000.000/0000-00" maxLength={18} className={inputCls} />
                    {cnpjLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                      </div>
                    )}
                  </div>
                  <button onClick={handleCnpjBlur} className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg">
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={exterior} onChange={e => setExterior(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-600" />
                  Exterior
                </label>
                <div className="flex-1">
                  <label className={labelCls}>Inscrição Municipal</label>
                  <input value={inscricaoMunicipal} onChange={e => setInscricaoMunicipal(e.target.value)}
                    placeholder="000000" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>CEP</label>
                <div className="relative">
                  <input value={tomadorCep} onChange={e => setTomadorCep(e.target.value)}
                    onBlur={handleCepBlur} placeholder="00000-000" maxLength={9} className={inputCls} />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Endereço</label>
                <input value={tomadorEndereco} onChange={e => setTomadorEndereco(e.target.value)}
                  placeholder="Endereço" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Número</label>
                <input value={tomadorNumero} onChange={e => setTomadorNumero(e.target.value)}
                  placeholder="Número" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Complemento</label>
                <input value={tomadorComplemento} onChange={e => setTomadorComplemento(e.target.value)}
                  placeholder="Complemento" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Bairro</label>
                <input value={tomadorBairro} onChange={e => setTomadorBairro(e.target.value)}
                  placeholder="Bairro" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Cidade</label>
                <input value={tomadorCidade} onChange={e => setTomadorCidade(e.target.value)}
                  placeholder="Cidade" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Estado</label>
                <input value={tomadorUf} onChange={e => setTomadorUf(e.target.value)}
                  placeholder="UF" maxLength={2} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input value={tomadorTelefone} onChange={e => setTomadorTelefone(e.target.value)}
                  placeholder="Telefone" className={inputCls} />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>E-mail</label>
                <div className="flex gap-2 items-center">
                  <input value={tomadorEmail} onChange={e => setTomadorEmail(e.target.value)}
                    placeholder="E-mail" type="email" className={`${inputCls} flex-1`} />
                  <label className="flex items-center gap-2 text-sm text-gray-300 shrink-0">
                    <input type="checkbox" checked={enviarParaTomador}
                      onChange={e => setEnviarParaTomador(e.target.checked)}
                      className="rounded border-gray-600 bg-gray-700 text-blue-600" />
                    Enviar
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ SERVIÇO ═══════════════ */}
          <div className={sectionCls}>
            <h2 className="text-white font-semibold text-sm mb-4">Serviço</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CNAE - Searchable dropdown */}
              <div ref={cnaeRef} className="relative">
                <label className={labelCls}>CNAE</label>
                <input
                  value={cnaeSearch}
                  onChange={e => {
                    setCnaeSearch(e.target.value);
                    setCnaeDropdownOpen(true);
                    // Allow manual editing
                    if (!e.target.value) {
                      setSelectedCnae(null);
                      setCnaeInput('');
                      setLc116Options([]);
                      setAtividadeMunicipal('');
                    }
                  }}
                  onFocus={() => setCnaeDropdownOpen(true)}
                  placeholder={cnaesDaEmpresa.length > 0 ? "Selecione o CNAE da empresa..." : "Digite código ou descrição do CNAE..."}
                  className={inputCls}
                />
                {cnaeDropdownOpen && filteredCnaes.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-600 bg-gray-700 shadow-lg">
                    {filteredCnaes.map(item => (
                      <li
                        key={item.codigo}
                        onClick={() => handleSelectCnae(item)}
                        className="cursor-pointer px-3 py-2 text-sm text-gray-200 hover:bg-blue-600 hover:text-white"
                      >
                        {item.codigo} - {item.descricao}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500 mt-1">Pesquise por código ou descrição. Editável manualmente.</p>
              </div>

              {/* Item LC 116/2003 - Select populated by CNAE */}
              <div>
                <label className={labelCls}>Item LC 116/2003</label>
                {lc116Options.length > 0 ? (
                  <select
                    value={itemLc116}
                    onChange={e => {
                      setItemLc116(e.target.value);
                      setAtividadeMunSearch('');
                      setSelectedAtividadeMun(null);
                      setAtividadeMunicipal('');
                    }}
                    className={selectCls}
                  >
                    <option value="">Selecione...</option>
                    {lc116Options.map(item => (
                      <option key={item.codigo} value={item.codigo}>
                        {item.descricao}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={itemLc116}
                    onChange={e => setItemLc116(e.target.value)}
                    placeholder="Ex: 17.01 (selecione CNAE para preencher)"
                    className={inputCls}
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">Correlação automática pelo CNAE ou editar manualmente.</p>
              </div>

              {/* Atividade Município - Searchable dropdown from TribMun data */}
              <div ref={atividadeMunRef} className="relative">
                <label className={labelCls}>Atividade Município</label>
                <input
                  value={atividadeMunSearch}
                  onChange={e => {
                    setAtividadeMunSearch(e.target.value);
                    setAtividadeMunDropdownOpen(true);
                    if (!e.target.value) {
                      setSelectedAtividadeMun(null);
                      setAtividadeMunicipal('');
                    }
                  }}
                  onFocus={() => setAtividadeMunDropdownOpen(true)}
                  placeholder="Digite código ou descrição da atividade..."
                  className={inputCls}
                />
                {atividadeMunDropdownOpen && filteredAtividadesMun.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-600 bg-gray-700 shadow-lg">
                    {filteredAtividadesMun.map(item => (
                      <li
                        key={item.codigo}
                        onClick={() => handleSelectAtividadeMun(item)}
                        className="cursor-pointer px-3 py-2 text-sm text-gray-200 hover:bg-blue-600 hover:text-white"
                      >
                        {item.codigo} - {item.descricao} ({item.aliquota})
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500 mt-1">Conforme cadastro na prefeitura. Alíquota ISS preenchida automaticamente.</p>
              </div>

              {/* Código NBS - Searchable dropdown */}
              <div ref={nbsRef} className="relative">
                <label className={labelCls}>Código NBS</label>
                <input
                  value={nbsSearch}
                  onChange={e => {
                    setNbsSearch(e.target.value);
                    setNbsDropdownOpen(true);
                    if (!e.target.value) {
                      setSelectedNbs(null);
                      setCodigoNbs('');
                    }
                  }}
                  onFocus={() => setNbsDropdownOpen(true)}
                  placeholder="Digite código ou descrição NBS..."
                  className={inputCls}
                />
                {nbsDropdownOpen && filteredNbs.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-600 bg-gray-700 shadow-lg">
                    {filteredNbs.map(item => (
                      <li
                        key={item.codigo}
                        onClick={() => handleSelectNbs(item)}
                        className="cursor-pointer px-3 py-2 text-sm text-gray-200 hover:bg-blue-600 hover:text-white"
                      >
                        {item.codigo} - {item.descricao}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500 mt-1">Pesquise por código ou descrição.</p>
              </div>

              <div>
                <label className={labelCls}>Valor Total dos Serviços *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={valorServicos}
                    onChange={e => handleValorChange(e.target.value)}
                    placeholder="0,00" className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Alíquota ISS (%)</label>
                <input type="number" step="0.01" min="0" max="5" value={aliquotaIss}
                  onChange={e => setAliquotaIss(e.target.value)}
                  placeholder="0,00%" className={inputCls} />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Descrição do Serviço *</label>
                <textarea rows={4} value={discriminacao}
                  onChange={e => setDiscriminacao(e.target.value)}
                  placeholder="Descrição do serviço (obrigatório)..."
                  className={`${inputCls} resize-y`} />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Informações Adicionais</label>
                <textarea rows={3} value={informacoesAdicionais}
                  onChange={e => setInformacoesAdicionais(e.target.value)}
                  placeholder="Informações adicionais (opcional)..."
                  className={`${inputCls} resize-y`} />
              </div>
            </div>
          </div>

          {/* ═══════════════ DESCONTOS ═══════════════ */}
          <div className={sectionCls}>
            <h2 className="text-white font-semibold text-sm mb-4">Descontos</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Desconto Condicionado</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={descontoCondicionado}
                    onChange={e => setDescontoCondicionado(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Desconto Incondicionado</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={descontoIncondicionado}
                    onChange={e => setDescontoIncondicionado(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Deduções Base de Cálculo</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={deducoesBaseCalculo}
                    onChange={e => setDeducoesBaseCalculo(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ RETENÇÕES DE IMPOSTOS ═══════════════ */}
          <div className={sectionCls}>
            <h2 className="text-white font-semibold text-sm mb-1">Retenções de Impostos</h2>
            <p className="text-xs text-gray-500 mb-4">Pré-preenchido das configurações tributárias. Editável por nota.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>PIS</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={retPis}
                    onChange={e => setRetPis(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>COFINS</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={retCofins}
                    onChange={e => setRetCofins(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>INSS</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={retInss}
                    onChange={e => setRetInss(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>IRRF</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={retIrrf}
                    onChange={e => setRetIrrf(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>CSLL</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={retCsll}
                    onChange={e => setRetCsll(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Outras Retenções</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={outrasRetencoes}
                    onChange={e => setOutrasRetencoes(e.target.value)}
                    className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div className="col-span-2 md:col-span-2">
                <label className={labelCls}>ISSQN Retido?</label>
                <div className="flex gap-0 mt-1">
                  <button type="button"
                    onClick={() => setIssRetido(true)}
                    className={`px-5 py-2 text-sm font-medium rounded-l-lg border transition-colors ${
                      issRetido
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                    }`}>
                    Sim
                  </button>
                  <button type="button"
                    onClick={() => setIssRetido(false)}
                    className={`px-5 py-2 text-sm font-medium rounded-r-lg border-t border-r border-b transition-colors ${
                      !issRetido
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                    }`}>
                    Não
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ TOTAIS DA NOTA FISCAL ═══════════════ */}
          <div className={sectionCls}>
            <h2 className="text-white font-semibold text-sm mb-4">Totais da Nota Fiscal</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Valor Total dos Serviços</label>
                <input value={formatCurrency(numValor)} readOnly className={readonlyCls} />
              </div>
              <div>
                <label className={labelCls}>Total ISSQN</label>
                <input value={formatCurrency(totalIssqn)} readOnly className={readonlyCls} />
              </div>
              <div>
                <label className={`${labelCls} text-green-400`}>Valor Líquido da NFS-e</label>
                <input value={formatCurrency(valorLiquido)} readOnly
                  className={`${readonlyCls} !text-green-400 !bg-green-500/10 !border-green-500/30 font-bold text-lg`} />
              </div>
            </div>
          </div>

          {/* ═══════════════ BOTÃO EMITIR ═══════════════ */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium
                       py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Emitindo...</>
            ) : (
              <><FileText className="h-5 w-5" /> Emitir NFS-e</>
            )}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
