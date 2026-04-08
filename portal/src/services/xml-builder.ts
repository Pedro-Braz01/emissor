/**
 * ============================================================================
 * XML BUILDER - PADRÃO ABRASF 2.04
 * ============================================================================
 * Constrói os XMLs para todas as operações do WebService
 * Específico para Ribeirão Preto - Código IBGE: 3543402
 */

// ===================
// CONFIGURAÇÕES
// ===================

const NAMESPACE = 'http://www.abrasf.org.br/nfse.xsd';
const CODIGO_MUNICIPIO = '3543402';

// ===================
// TIPOS
// ===================

export interface Prestador {
  cnpj: string;
  inscricaoMunicipal: string;
}

export interface Tomador {
  cpfCnpj: string;
  razaoSocial: string;
  inscricaoMunicipal?: string;
  email?: string;
  telefone?: string;
  endereco?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    codigoMunicipio?: string;
    uf?: string;
    cep?: string;
  };
}

export interface Servico {
  valorServicos: number;
  valorDeducoes?: number;
  valorPis?: number;
  valorCofins?: number;
  valorInss?: number;
  valorIr?: number;
  valorCsll?: number;
  outrasRetencoes?: number;
  valorIss?: number;
  aliquota: number;
  descontoIncondicionado?: number;
  descontoCondicionado?: number;
  issRetido: boolean;
  responsavelRetencao?: number;
  itemListaServico: string;
  codigoCnae?: string;
  codigoTributacaoMunicipio?: string;
  codigoNbs?: string;
  discriminacao: string;
  codigoMunicipio?: string;
  exigibilidadeIss?: number;
  municipioIncidencia?: string;
}

export interface Rps {
  numero: number;
  serie: string;
  tipo?: number;
  dataEmissao: string;
  status?: number;
}

export interface DadosNfse {
  rps: Rps;
  competencia: string;
  servico: Servico;
  prestador: Prestador;
  tomador: Tomador;
  regimeEspecialTributacao?: number;
  optanteSimplesNacional: boolean;
  incentivoFiscal: boolean;
  informacoesComplementares?: string;
}

// ===================
// HELPERS
// ===================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDecimal(value: number | undefined, decimals: number = 2): string {
  if (value === undefined || value === null) return '0.00';
  return value.toFixed(decimals);
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

function removeNonNumeric(value: string): string {
  return value.replace(/\D/g, '');
}

// ===================
// XML BUILDER CLASS
// ===================

export class XmlBuilder {
  
  /**
   * Monta XML para GerarNfse (emissão individual)
   */
  static gerarNfse(dados: DadosNfse): string {
    const { rps, competencia, servico, prestador, tomador } = dados;
    const ns = NAMESPACE;

    // Monta valores
    const baseCalculo = servico.valorServicos - (servico.valorDeducoes || 0) - (servico.descontoIncondicionado || 0);
    const valorIss = servico.valorIss || baseCalculo * servico.aliquota;

    // Helper: só inclui tag se valor > 0 (ABRASF 2.04: omitir tags opcionais com valor zero)
    const optTag = (tag: string, value: number | undefined, decimals = 2): string => {
      if (!value || value <= 0) return '';
      return `<${tag}>${formatDecimal(value, decimals)}</${tag}>`;
    };

    // ValTotTributos: soma de todos os tributos (ABRASF 2.04)
    const valTotTributos = (servico.valorPis || 0) + (servico.valorCofins || 0) +
      (servico.valorInss || 0) + (servico.valorIr || 0) + (servico.valorCsll || 0) +
      (servico.outrasRetencoes || 0) + valorIss;

    // Monta bloco <Valores> - todas as tags incluídas (padrão Ribeirão Preto)
    const valoresXml = [
      `<ValorServicos>${formatDecimal(servico.valorServicos)}</ValorServicos>`,
      `<ValorDeducoes>${formatDecimal(servico.valorDeducoes || 0)}</ValorDeducoes>`,
      `<ValorPis>${formatDecimal(servico.valorPis || 0)}</ValorPis>`,
      `<ValorCofins>${formatDecimal(servico.valorCofins || 0)}</ValorCofins>`,
      `<ValorInss>${formatDecimal(servico.valorInss || 0)}</ValorInss>`,
      `<ValorIr>${formatDecimal(servico.valorIr || 0)}</ValorIr>`,
      `<ValorCsll>${formatDecimal(servico.valorCsll || 0)}</ValorCsll>`,
      `<OutrasRetencoes>${formatDecimal(servico.outrasRetencoes || 0)}</OutrasRetencoes>`,
      `<ValTotTributos>${formatDecimal(valTotTributos)}</ValTotTributos>`,
      `<ValorIss>${formatDecimal(valorIss)}</ValorIss>`,
      `<Aliquota>${formatDecimal(servico.aliquota, 4)}</Aliquota>`,
      `<DescontoIncondicionado>${formatDecimal(servico.descontoIncondicionado || 0)}</DescontoIncondicionado>`,
      `<DescontoCondicionado>${formatDecimal(servico.descontoCondicionado || 0)}</DescontoCondicionado>`,
    ].join('\n          ');

    // MunicipioIncidencia: obrigatório quando ExigibilidadeISS é 1, 3, 5, 6 ou 7
    const exigibilidade = servico.exigibilidadeIss || 1;
    const precisaMunicipioIncidencia = [1, 3, 5, 6, 7].includes(exigibilidade);

    return `<GerarNfseEnvio xmlns="${ns}">
  <Rps>
    <InfDeclaracaoPrestacaoServico Id="rps${rps.numero}">
      <Rps>
        <IdentificacaoRps>
          <Numero>${rps.numero}</Numero>
          <Serie>${escapeXml(rps.serie)}</Serie>
          <Tipo>${rps.tipo || 1}</Tipo>
        </IdentificacaoRps>
        <DataEmissao>${formatDate(rps.dataEmissao)}</DataEmissao>
        <Status>${rps.status || 1}</Status>
      </Rps>
      <Competencia>${formatDate(competencia)}</Competencia>
      <Servico>
        <Valores>
          ${valoresXml}
        </Valores>
        <IssRetido>${servico.issRetido ? 1 : 2}</IssRetido>
        ${servico.issRetido && servico.responsavelRetencao ? `<ResponsavelRetencao>${servico.responsavelRetencao}</ResponsavelRetencao>` : ''}
        <ItemListaServico>${escapeXml(servico.itemListaServico)}</ItemListaServico>
        ${servico.codigoCnae ? `<CodigoCnae>${servico.codigoCnae}</CodigoCnae>` : ''}
        ${servico.codigoTributacaoMunicipio ? `<CodigoTributacaoMunicipio>${servico.codigoTributacaoMunicipio}</CodigoTributacaoMunicipio>` : ''}
        ${servico.codigoNbs ? `<CodigoNbs>${servico.codigoNbs}</CodigoNbs>` : ''}
        <Discriminacao>${escapeXml(servico.discriminacao)}</Discriminacao>
        <CodigoMunicipio>${servico.codigoMunicipio || CODIGO_MUNICIPIO}</CodigoMunicipio>
        <ExigibilidadeISS>${exigibilidade}</ExigibilidadeISS>
        ${precisaMunicipioIncidencia ? `<MunicipioIncidencia>${servico.municipioIncidencia || CODIGO_MUNICIPIO}</MunicipioIncidencia>` : ''}
      </Servico>
      <Prestador>
        <CpfCnpj>
          <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
        </CpfCnpj>
        <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
      </Prestador>
      <TomadorServico>
        ${this.buildTomadorXml(tomador)}
      </TomadorServico>
      ${dados.regimeEspecialTributacao ? `<RegimeEspecialTributacao>${dados.regimeEspecialTributacao}</RegimeEspecialTributacao>` : ''}
      <OptanteSimplesNacional>${dados.optanteSimplesNacional ? 1 : 2}</OptanteSimplesNacional>
      <IncentivoFiscal>${dados.incentivoFiscal ? 1 : 2}</IncentivoFiscal>
      ${dados.informacoesComplementares ? `<InformacoesComplementares>${escapeXml(dados.informacoesComplementares)}</InformacoesComplementares>` : ''}
    </InfDeclaracaoPrestacaoServico>
  </Rps>
</GerarNfseEnvio>`;
  }

  /**
   * Monta XML do tomador
   */
  private static buildTomadorXml(tomador: Tomador): string {
    const cpfCnpj = removeNonNumeric(tomador.cpfCnpj);
    const isCnpj = cpfCnpj.length === 14;

    let xml = `<IdentificacaoTomador>
          <CpfCnpj>
            ${isCnpj ? `<Cnpj>${cpfCnpj}</Cnpj>` : `<Cpf>${cpfCnpj}</Cpf>`}
          </CpfCnpj>
          ${tomador.inscricaoMunicipal ? `<InscricaoMunicipal>${tomador.inscricaoMunicipal}</InscricaoMunicipal>` : ''}
        </IdentificacaoTomador>
        <RazaoSocial>${escapeXml(tomador.razaoSocial)}</RazaoSocial>`;

    // Endereço
    if (tomador.endereco && tomador.endereco.logradouro) {
      const end = tomador.endereco;
      xml += `
        <Endereco>
          <Endereco>${escapeXml(end.logradouro || '')}</Endereco>
          <Numero>${escapeXml(end.numero || 'S/N')}</Numero>
          ${end.complemento ? `<Complemento>${escapeXml(end.complemento)}</Complemento>` : ''}
          <Bairro>${escapeXml(end.bairro || '')}</Bairro>
          <CodigoMunicipio>${end.codigoMunicipio || CODIGO_MUNICIPIO}</CodigoMunicipio>
          <Uf>${end.uf || 'SP'}</Uf>
          <Cep>${removeNonNumeric(end.cep || '')}</Cep>
        </Endereco>`;
    }

    // Contato
    if (tomador.email || tomador.telefone) {
      xml += `
        <Contato>
          ${tomador.telefone ? `<Telefone>${removeNonNumeric(tomador.telefone)}</Telefone>` : ''}
          ${tomador.email ? `<Email>${escapeXml(tomador.email)}</Email>` : ''}
        </Contato>`;
    }

    return xml;
  }

  /**
   * Monta XML para CancelarNfse
   */
  static cancelarNfse(
    prestador: Prestador,
    numeroNfse: number,
    codigoCancelamento: string = '1',
    motivo?: string
  ): string {
    return `<CancelarNfseEnvio xmlns="${NAMESPACE}">
  <Pedido>
    <InfPedidoCancelamento Id="cancel${numeroNfse}">
      <IdentificacaoNfse>
        <Numero>${numeroNfse}</Numero>
        <CpfCnpj>
          <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
        </CpfCnpj>
        <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
        <CodigoMunicipio>${CODIGO_MUNICIPIO}</CodigoMunicipio>
      </IdentificacaoNfse>
      <CodigoCancelamento>${codigoCancelamento}</CodigoCancelamento>
      ${motivo ? `<MotivoCancelamentoNfse>${escapeXml(motivo)}</MotivoCancelamentoNfse>` : ''}
    </InfPedidoCancelamento>
  </Pedido>
</CancelarNfseEnvio>`;
  }

  /**
   * Monta XML para ConsultarNfseRps
   */
  static consultarNfseRps(
    prestador: Prestador,
    numeroRps: number,
    serieRps: string,
    tipoRps: number = 1
  ): string {
    return `<ConsultarNfseRpsEnvio xmlns="${NAMESPACE}">
  <IdentificacaoRps>
    <Numero>${numeroRps}</Numero>
    <Serie>${escapeXml(serieRps)}</Serie>
    <Tipo>${tipoRps}</Tipo>
  </IdentificacaoRps>
  <Prestador>
    <CpfCnpj>
      <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
  </Prestador>
</ConsultarNfseRpsEnvio>`;
  }

  /**
   * Monta XML para ConsultarDadosCadastrais
   */
  static consultarDadosCadastrais(prestador: Prestador): string {
    return `<ConsultarDadosCadastraisEnvio xmlns="${NAMESPACE}">
  <Prestador>
    <CpfCnpj>
      <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
  </Prestador>
</ConsultarDadosCadastraisEnvio>`;
  }

  /**
   * Monta XML para ConsultarRpsDisponivel
   */
  static consultarRpsDisponivel(prestador: Prestador): string {
    return `<ConsultarRpsDisponivelEnvio xmlns="${NAMESPACE}">
  <Prestador>
    <CpfCnpj>
      <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
  </Prestador>
</ConsultarRpsDisponivelEnvio>`;
  }

  /**
   * Monta XML para ConsultarNfseFaixa
   */
  static consultarNfseFaixa(
    prestador: Prestador,
    numeroInicial: number,
    numeroFinal: number,
    pagina: number = 1
  ): string {
    return `<ConsultarNfseFaixaEnvio xmlns="${NAMESPACE}">
  <Prestador>
    <CpfCnpj>
      <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
  </Prestador>
  <Faixa>
    <NumeroNfseInicial>${numeroInicial}</NumeroNfseInicial>
    <NumeroNfseFinal>${numeroFinal}</NumeroNfseFinal>
  </Faixa>
  <Pagina>${pagina}</Pagina>
</ConsultarNfseFaixaEnvio>`;
  }

  /**
   * Monta XML para ConsultarNfseServicoPrestado
   */
  static consultarNfseServicoPrestado(
    prestador: Prestador,
    dataInicial: string,
    dataFinal: string,
    pagina: number = 1
  ): string {
    return `<ConsultarNfseServicoPrestadoEnvio xmlns="${NAMESPACE}">
  <Prestador>
    <CpfCnpj>
      <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
  </Prestador>
  <PeriodoEmissao>
    <DataInicial>${formatDate(dataInicial)}</DataInicial>
    <DataFinal>${formatDate(dataFinal)}</DataFinal>
  </PeriodoEmissao>
  <Pagina>${pagina}</Pagina>
</ConsultarNfseServicoPrestadoEnvio>`;
  }

  /**
   * Monta XML para ConsultarUrlNfse
   */
  static consultarUrlNfse(
    prestador: Prestador,
    numeroNfse: number,
    codigoTributacaoMunicipio?: string
  ): string {
    return `<ConsultarUrlNfseEnvio xmlns="${NAMESPACE}">
  <Prestador>
    <CpfCnpj>
      <Cnpj>${removeNonNumeric(prestador.cnpj)}</Cnpj>
    </CpfCnpj>
    <InscricaoMunicipal>${removeNonNumeric(prestador.inscricaoMunicipal)}</InscricaoMunicipal>
  </Prestador>
  <NumeroNfse>${numeroNfse}</NumeroNfse>
  ${codigoTributacaoMunicipio ? `<CodigoTributacaoMunicipio>${codigoTributacaoMunicipio}</CodigoTributacaoMunicipio>` : ''}
</ConsultarUrlNfseEnvio>`;
  }
}

export default XmlBuilder;
