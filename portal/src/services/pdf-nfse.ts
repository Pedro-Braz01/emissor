/**
 * ============================================================================
 * PDF NFS-e (DANFSe) - Geração do PDF da Nota Fiscal de Serviço Eletrônica
 * ============================================================================
 * Layout baseado no modelo ISSNet da Prefeitura de Ribeirão Preto
 * Inclui rodapé obrigatório para empresas do Simples Nacional
 */

import jsPDF from 'jspdf';

// ── Tipos ──

export interface DadosPrestador {
  razaoSocial: string;
  cnpj: string;
  inscricaoMunicipal: string;
  endereco: string;
  cep: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
}

export interface DadosTomador {
  cpfCnpj: string;
  inscricaoMunicipal?: string;
  razaoSocial: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
  telefone?: string;
  email?: string;
}

export interface DadosServico {
  discriminacao: string;
  atividadeMunicipio?: string;
  aliquota: number;
  itemListaServico?: string;
  codigoNbs?: string;
  codigoCnae?: string;
}

export interface DadosValores {
  valorServicos: number;
  descontoIncondicionado: number;
  deducoes: number;
  baseCalculo: number;
  totalIssqn: number;
  issRetido: boolean;
  descontoCondicionado: number;
  pis: number;
  cofins: number;
  inss: number;
  irrf: number;
  csll: number;
  outrasRetencoes: number;
  issRetidoValor: number;
  valorLiquido: number;
}

export interface DadosNfse {
  numeroNfse: string;
  dataEmissao: string;
  competencia: string;
  codigoAutenticidade: string;
  naturezaOperacao: string;
  numeroRps?: string;
  serieRps?: string;
  dataEmissaoRps?: string;
  localServicos: string;
  municipioIncidencia: string;
  prestador: DadosPrestador;
  tomador: DadosTomador;
  servico: DadosServico;
  valores: DadosValores;
  regimeTributario: string;
  informacoesComplementares?: string;
}

// ── Helpers ──

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function formatCnpjCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return value;
}

// ── Gerador PDF ──

export function gerarPdfNfse(dados: DadosNfse): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const marginLeft = 10;
  const marginRight = 10;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 10;

  const colors = {
    headerBg: [37, 99, 235] as [number, number, number],     // blue-600
    headerText: [255, 255, 255] as [number, number, number],
    sectionBg: [239, 246, 255] as [number, number, number],   // blue-50
    sectionText: [30, 64, 175] as [number, number, number],   // blue-800
    border: [209, 213, 219] as [number, number, number],      // gray-300
    text: [17, 24, 39] as [number, number, number],           // gray-900
    label: [107, 114, 128] as [number, number, number],       // gray-500
  };

  // ═══════════════════════════════════════════
  // CABEÇALHO PRINCIPAL
  // ═══════════════════════════════════════════

  // Box superior - Prefeitura
  doc.setFillColor(...colors.headerBg);
  doc.rect(marginLeft, y, contentWidth, 22, 'F');

  doc.setTextColor(...colors.headerText);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Prefeitura Municipal de Ribeirão Preto - SP', marginLeft + 4, y + 7);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Secretaria Municipal da Fazenda', marginLeft + 4, y + 12);
  doc.text('https://www.ribeiraopreto.sp.gov.br/portal/', marginLeft + 4, y + 17);

  // Tipo de documento (direita)
  doc.setFontSize(7);
  doc.text('Série do Documento', pageWidth - marginRight - 45, y + 5);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Nota Fiscal de Serviço', pageWidth - marginRight - 45, y + 10);
  doc.text('Eletrônica - NFS-e', pageWidth - marginRight - 45, y + 15);

  // Número da NFS-e
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Número da Nota Fiscal', pageWidth - marginRight - 45, y + 19);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(dados.numeroNfse, pageWidth - marginRight - 20, y + 19, { align: 'center' });

  y += 25;

  // ═══════════════════════════════════════════
  // SEÇÃO: DADOS DO PRESTADOR
  // ═══════════════════════════════════════════

  function drawSectionHeader(title: string) {
    doc.setFillColor(...colors.sectionBg);
    doc.setDrawColor(...colors.border);
    doc.rect(marginLeft, y, contentWidth, 6, 'FD');
    doc.setTextColor(...colors.sectionText);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(title, marginLeft + 2, y + 4);
    y += 6;
  }

  function drawLabelValue(label: string, value: string, x: number, yPos: number, maxWidth?: number) {
    doc.setTextColor(...colors.label);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, yPos);
    doc.setTextColor(...colors.text);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    const displayVal = maxWidth ? doc.splitTextToSize(value, maxWidth)[0] : value;
    doc.text(displayVal || '—', x, yPos + 3.5);
  }

  drawSectionHeader('Dados do Prestador de Serviço');

  // Box prestador
  doc.setDrawColor(...colors.border);
  doc.rect(marginLeft, y, contentWidth, 24, 'D');

  // Dados do prestador (esquerda)
  doc.setTextColor(...colors.text);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(dados.prestador.razaoSocial, marginLeft + 3, y + 5);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(dados.prestador.endereco, marginLeft + 3, y + 9);
  doc.text(`CEP ${dados.prestador.cep} - Fone: ${dados.prestador.telefone} - ${dados.prestador.cidade}/${dados.prestador.uf}`, marginLeft + 3, y + 13);
  doc.text(dados.prestador.email, marginLeft + 3, y + 17);
  doc.text(`Inscrição Municipal ${dados.prestador.inscricaoMunicipal} - CPF/CNPJ ${formatCnpjCpf(dados.prestador.cnpj)}`, marginLeft + 3, y + 21);

  // Datas (direita)
  const rightCol = pageWidth - marginRight - 50;
  drawLabelValue('Data de Geração da NFS-e', dados.dataEmissao, rightCol, y + 2);
  drawLabelValue('Data de Competência', dados.competencia, rightCol, y + 9);
  drawLabelValue('Cód. de Autenticidade', dados.codigoAutenticidade, rightCol, y + 16);

  y += 26;

  // ═══════════════════════════════════════════
  // IDENTIFICAÇÃO DA NFS-e
  // ═══════════════════════════════════════════

  drawSectionHeader('Identificação da Nota Fiscal Eletrônica');
  doc.rect(marginLeft, y, contentWidth, 18, 'D');

  // Linha 1: Natureza, RPS
  const col1 = marginLeft + 3;
  const col2 = marginLeft + 60;
  const col3 = marginLeft + 100;
  const col4 = marginLeft + 140;

  drawLabelValue('Natureza da Operação', dados.naturezaOperacao, col1, y + 2);
  drawLabelValue('Número do RPS', dados.numeroRps || '—', col2, y + 2);
  drawLabelValue('Série do RPS', dados.serieRps || '—', col3, y + 2);
  drawLabelValue('Data de Emissão do RPS', dados.dataEmissaoRps || '—', col4, y + 2);

  // Linha 2: Local dos serviços
  drawLabelValue('Local dos Serviços', dados.localServicos, col1, y + 10);
  drawLabelValue('Município Incidência', dados.municipioIncidencia, col3, y + 10);

  y += 20;

  // ═══════════════════════════════════════════
  // DADOS DO TOMADOR
  // ═══════════════════════════════════════════

  drawSectionHeader('Dados do Tomador de Serviços');
  doc.rect(marginLeft, y, contentWidth, 28, 'D');

  drawLabelValue('CNPJ/CPF:', formatCnpjCpf(dados.tomador.cpfCnpj), col1, y + 2);
  drawLabelValue('IM:', dados.tomador.inscricaoMunicipal || '—', col3, y + 2);

  drawLabelValue('Razão Social:', dados.tomador.razaoSocial, col1, y + 8, 120);

  drawLabelValue('Endereço:', dados.tomador.endereco || '—', col1, y + 14);
  drawLabelValue('Número:', dados.tomador.numero || '—', col3, y + 14);

  drawLabelValue('Complemento:', dados.tomador.complemento || '—', col1, y + 20);
  drawLabelValue('Bairro:', dados.tomador.bairro || '—', col2, y + 20);
  drawLabelValue('CEP:', dados.tomador.cep || '—', col3, y + 20);
  drawLabelValue('Cidade/UF:', `${dados.tomador.cidade || '—'}/${dados.tomador.uf || '—'}`, col4, y + 20);

  y += 30;

  // ═══════════════════════════════════════════
  // DESCRIÇÃO DOS SERVIÇOS
  // ═══════════════════════════════════════════

  drawSectionHeader('Descrição dos Serviços');
  const descLines = doc.splitTextToSize(dados.servico.discriminacao, contentWidth - 6);
  const descHeight = Math.max(18, descLines.length * 4 + 6);
  doc.rect(marginLeft, y, contentWidth, descHeight, 'D');
  doc.setTextColor(...colors.text);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(descLines, marginLeft + 3, y + 5);

  y += descHeight + 2;

  // ═══════════════════════════════════════════
  // DETALHAMENTO DOS TRIBUTOS
  // ═══════════════════════════════════════════

  drawSectionHeader('Detalhamento dos Tributos');
  doc.rect(marginLeft, y, contentWidth, 8, 'D');

  // Header da tabela de tributos
  const tribCols = [
    { label: 'Atividade do Município', x: col1, w: 60 },
    { label: 'Alíquota', x: marginLeft + 95, w: 15 },
    { label: 'Item da LC116/2003', x: marginLeft + 112, w: 25 },
    { label: 'Cód. NBS', x: marginLeft + 138, w: 20 },
    { label: 'Cód. CNAE', x: marginLeft + 160, w: 25 },
  ];

  doc.setTextColor(...colors.label);
  doc.setFontSize(5.5);
  tribCols.forEach(c => doc.text(c.label, c.x, y + 3));

  doc.setTextColor(...colors.text);
  doc.setFontSize(7);
  doc.text(dados.servico.atividadeMunicipio || '—', col1, y + 7);
  doc.text(dados.servico.aliquota.toFixed(2).replace('.', ','), marginLeft + 95, y + 7);
  doc.text(dados.servico.itemListaServico || '—', marginLeft + 112, y + 7);
  doc.text(dados.servico.codigoNbs || '—', marginLeft + 138, y + 7);
  doc.text(dados.servico.codigoCnae || '—', marginLeft + 160, y + 7);

  y += 10;

  // ═══════════════════════════════════════════
  // TABELA DE VALORES (Linha 1)
  // ═══════════════════════════════════════════

  doc.rect(marginLeft, y, contentWidth, 14, 'D');

  const valCols1 = [
    { label: 'Vl. Total dos Serviços', value: formatCurrency(dados.valores.valorServicos), x: col1 },
    { label: 'Desconto Incondicionado', value: formatCurrency(dados.valores.descontoIncondicionado), x: marginLeft + 35 },
    { label: 'Deduções Base Cálculo', value: formatCurrency(dados.valores.deducoes), x: marginLeft + 65 },
    { label: 'Base de Cálculo', value: formatCurrency(dados.valores.baseCalculo), x: marginLeft + 95 },
    { label: 'Total do ISSQN', value: formatCurrency(dados.valores.totalIssqn), x: marginLeft + 120 },
    { label: 'ISSQN Retido', value: dados.valores.issRetido ? 'Sim' : 'Não', x: marginLeft + 145 },
    { label: 'Desconto Condicionado', value: formatCurrency(dados.valores.descontoCondicionado), x: marginLeft + 165 },
  ];

  valCols1.forEach(c => {
    doc.setTextColor(...colors.label);
    doc.setFontSize(5);
    doc.text(c.label, c.x, y + 3);
    doc.setTextColor(...colors.text);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(c.value, c.x, y + 8);
  });
  doc.setFont('helvetica', 'normal');

  y += 14;

  // TABELA DE VALORES (Linha 2 - retenções)
  doc.rect(marginLeft, y, contentWidth, 14, 'D');

  const valCols2 = [
    { label: 'PIS', value: formatCurrency(dados.valores.pis), x: col1 },
    { label: 'COFINS', value: formatCurrency(dados.valores.cofins), x: marginLeft + 25 },
    { label: 'INSS', value: formatCurrency(dados.valores.inss), x: marginLeft + 50 },
    { label: 'IRRF', value: formatCurrency(dados.valores.irrf), x: marginLeft + 72 },
    { label: 'CSLL', value: formatCurrency(dados.valores.csll), x: marginLeft + 93 },
    { label: 'Outras Retenções', value: formatCurrency(dados.valores.outrasRetencoes), x: marginLeft + 113 },
    { label: 'Vl. ISSQN Retido', value: formatCurrency(dados.valores.issRetidoValor), x: marginLeft + 143 },
    { label: 'Vl. Líquido da Nota Fiscal', value: formatCurrency(dados.valores.valorLiquido), x: marginLeft + 167 },
  ];

  valCols2.forEach(c => {
    doc.setTextColor(...colors.label);
    doc.setFontSize(5);
    doc.text(c.label, c.x, y + 3);
    doc.setTextColor(...colors.text);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(c.value, c.x, y + 8);
  });
  doc.setFont('helvetica', 'normal');

  y += 16;

  // ═══════════════════════════════════════════
  // INFORMAÇÕES ADICIONAIS / RODAPÉ SIMPLES NACIONAL
  // ═══════════════════════════════════════════

  drawSectionHeader('Informações Adicionais');

  let infoText = dados.informacoesComplementares || '';

  // Rodapé obrigatório para Simples Nacional
  if (dados.regimeTributario === 'simples_nacional') {
    const avisoSN = 'I - "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL"; e II - "NÃO GERA DIREITO A CRÉDITO FISCAL DE IPI."';
    infoText = infoText ? `${infoText}\n\n${avisoSN}` : avisoSN;
  }

  const infoLines = doc.splitTextToSize(infoText || '—', contentWidth - 6);
  const infoHeight = Math.max(12, infoLines.length * 4 + 4);
  doc.rect(marginLeft, y, contentWidth, infoHeight, 'D');
  doc.setTextColor(...colors.text);
  doc.setFontSize(7);
  doc.text(infoLines, marginLeft + 3, y + 5);

  y += infoHeight + 4;

  // ═══════════════════════════════════════════
  // RODAPÉ - LINK DE VERIFICAÇÃO
  // ═══════════════════════════════════════════

  doc.setTextColor(...colors.label);
  doc.setFontSize(6.5);
  doc.text(
    'Consulte a autenticidade deste documento acessando o site: https://www.issnetonline.com.br/ribeiraopreto/online',
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  return doc;
}
