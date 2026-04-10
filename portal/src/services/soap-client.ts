/**
 * ============================================================================
 * SOAP CLIENT - WEBSERVICE NFSe RIBEIRÃO PRETO
 * ============================================================================
 * Comunicação real com o WebService da prefeitura
 * Padrão ABRASF 2.04
 */

// ===================
// CONFIGURAÇÕES
// ===================

export const WEBSERVICE_CONFIG = {
  // Homologação (testes)
  homologacao: {
    url: 'https://www.issnetonline.com.br/homologaabrasf/webservicenfse204/nfse.asmx',
    serieRps: '8',
  },
  // Produção (real)
  producao: {
    url: 'https://nfse.issnetonline.com.br/abrasf204/ribeiraopreto/nfse.asmx',
    serieRps: '1',
  },
};

export const ABRASF_CONFIG = {
  namespace: 'http://www.abrasf.org.br/nfse.xsd',
  versaoDados: '2.04',
  codigoMunicipio: '3543402', // Ribeirão Preto
};

// ===================
// TIPOS
// ===================

export interface SoapResponse {
  success: boolean;
  xml?: string;
  data?: any;
  errors?: Array<{
    codigo: string;
    mensagem: string;
    correcao?: string;
  }>;
  warnings?: Array<{
    codigo: string;
    mensagem: string;
  }>;
}

export type Ambiente = 'homologacao' | 'producao';

// ===================
// OPERAÇÕES SOAP
// ===================

type SoapOperation = 
  | 'GerarNfse'
  | 'RecepcionarLoteRps'
  | 'RecepcionarLoteRpsSincrono'
  | 'CancelarNfse'
  | 'SubstituirNfse'
  | 'ConsultarLoteRps'
  | 'ConsultarNfseRps'
  | 'ConsultarNfseFaixa'
  | 'ConsultarNfseServicoPrestado'
  | 'ConsultarNfseServicoTomado'
  | 'ConsultarDadosCadastrais'
  | 'ConsultarRpsDisponivel'
  | 'ConsultarUrlNfse';

// ===================
// CLIENTE SOAP
// ===================

export class SoapClient {
  private ambiente: Ambiente;
  private config: typeof WEBSERVICE_CONFIG.homologacao;
  private timeout: number;

  constructor(ambiente: Ambiente = 'homologacao', timeout: number = 60000) {
    this.ambiente = ambiente;
    this.config = WEBSERVICE_CONFIG[ambiente];
    this.timeout = timeout;
  }

  /**
   * Monta o envelope SOAP completo
   */
  private buildSoapEnvelope(operation: SoapOperation, xmlDados: string): string {
    const cabecalho = `<cabecalho versao="1.00" xmlns="${ABRASF_CONFIG.namespace}"><versaoDados>${ABRASF_CONFIG.versaoDados}</versaoDados></cabecalho>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://nfse.abrasf.org.br">
  <soap:Body>
    <nfse:${operation}>
      <nfseCabecMsg><![CDATA[${cabecalho}]]></nfseCabecMsg>
      <nfseDadosMsg><![CDATA[${xmlDados}]]></nfseDadosMsg>
    </nfse:${operation}>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Envia requisição SOAP para o WebService
   */
  async send(operation: SoapOperation, xmlDados: string): Promise<SoapResponse> {
    const envelope = this.buildSoapEnvelope(operation, xmlDados);
    const soapAction = `http://nfse.abrasf.org.br/${operation}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': soapAction,
        },
        body: envelope,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          errors: [{
            codigo: `HTTP_${response.status}`,
            mensagem: `Erro HTTP: ${response.status} ${response.statusText}`,
          }],
        };
      }

      const xmlResponse = await response.text();
      return this.parseResponse(xmlResponse);

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            errors: [{
              codigo: 'TIMEOUT',
              mensagem: `Timeout após ${this.timeout / 1000} segundos`,
            }],
          };
        }
        return {
          success: false,
          errors: [{
            codigo: 'NETWORK_ERROR',
            mensagem: error.message,
          }],
        };
      }
      return {
        success: false,
        errors: [{
          codigo: 'UNKNOWN_ERROR',
          mensagem: 'Erro desconhecido',
        }],
      };
    }
  }

  /**
   * Parseia resposta do WebService
   */
  private parseResponse(xmlResponse: string): SoapResponse {
    const errors: SoapResponse['errors'] = [];
    const warnings: SoapResponse['warnings'] = [];

    // Extrai conteúdo do CDATA
    const resultMatch = xmlResponse.match(/<\w+Result[^>]*>([\s\S]*?)<\/\w+Result>/i);
    let resultXml = resultMatch ? resultMatch[1] : xmlResponse;
    
    // Remove CDATA wrapper se existir
    resultXml = resultXml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

    // Procura por mensagens de erro/alerta
    // O ISSNet pode retornar MensagemRetorno ou MensagemRetornoLote
    const mensagemRegex = /<MensagemRetorno>[\s\S]*?<Codigo>(.*?)<\/Codigo>[\s\S]*?<Mensagem>(.*?)<\/Mensagem>[\s\S]*?(?:<Correcao>([\s\S]*?)<\/Correcao>)?[\s\S]*?<\/MensagemRetorno>/gi;

    let match;
    while ((match = mensagemRegex.exec(resultXml)) !== null) {
      const codigo = match[1]?.trim();
      const mensagem = match[2]?.trim();
      const correcao = match[3]?.trim();

      // Códigos que começam com E são erros, A são alertas
      // Códigos numéricos ou outros formatos são tratados como erros
      if (codigo.startsWith('A')) {
        warnings.push({ codigo, mensagem });
      } else {
        // E-prefixados, numéricos, e qualquer outro formato = erro
        errors.push({ codigo, mensagem, correcao });
      }
    }

    // Verifica se tem NFSe gerada (CompNfse pode conter múltiplas notas)
    const nfseMatch = resultXml.match(/<CompNfse>([\s\S]*?)<\/CompNfse>/i);
    const nfseData = nfseMatch ? this.extractNfseData(nfseMatch[1]) : null;

    // Verifica também por erros em ListaMensagemRetorno (sem "Lote")
    if (errors.length === 0 && !nfseData) {
      const listaMsgMatch = resultXml.match(/<ListaMensagemRetorno>([\s\S]*?)<\/ListaMensagemRetorno>/i);
      if (listaMsgMatch) {
        // Re-parse com o contexto da lista
        const listaRegex = /<Codigo>(.*?)<\/Codigo>[\s\S]*?<Mensagem>(.*?)<\/Mensagem>/gi;
        let m;
        while ((m = listaRegex.exec(listaMsgMatch[1])) !== null) {
          errors.push({ codigo: m[1]?.trim(), mensagem: m[2]?.trim() });
        }
      }
    }

    // Sucesso se não tem erros E (tem NFSe OU é consulta/operação sem retorno esperado)
    const hasErrorList = resultXml.includes('<ListaMensagemRetornoLote>') || resultXml.includes('<ListaMensagemRetorno>');
    const success = errors.length === 0 && (nfseData !== null || !hasErrorList);

    return {
      success,
      xml: resultXml,
      data: nfseData,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Extrai dados da NFSe do XML de retorno
   */
  private extractNfseData(nfseXml: string): Record<string, any> | null {
    try {
      const extract = (tag: string, context?: string): string | null => {
        const xml = context || nfseXml;
        const match = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'i'));
        return match ? match[1] : null;
      };

      // Extrai bloco InfNfse para pegar Numero da NFSe (não do RPS)
      const infNfseMatch = nfseXml.match(/<InfNfse[\s\S]*?>([\s\S]*?)<\/InfNfse>/i);
      const infNfse = infNfseMatch ? infNfseMatch[1] : nfseXml;

      // Numero da NFS-e fica direto dentro de InfNfse, não dentro de IdentificacaoRps
      const numeroNfse = extract('Numero', infNfse);
      const codigoVerificacao = extract('CodigoVerificacao', infNfse);
      const dataEmissao = extract('DataEmissao', infNfse);

      // Extrai bloco Valores
      const valoresMatch = nfseXml.match(/<Valores>([\s\S]*?)<\/Valores>/i);
      const valores = valoresMatch ? valoresMatch[1] : '';

      // Extrai link/URL da NFSe se disponível
      const linkNfse = extract('LinkNfse') || extract('Link') || extract('OutrasInformacoes');

      return {
        numeroNfse,
        codigoVerificacao,
        dataEmissao,
        linkNfse,
        valorServicos: extract('ValorServicos', valores),
        valorIss: extract('ValorIss', valores),
        baseCalculo: extract('BaseCalculo', valores),
        aliquota: extract('Aliquota', valores),
        // XML completo da NFS-e retornada (para geração do PDF)
        xmlNfseCompleto: nfseXml,
      };
    } catch {
      return null;
    }
  }

  // ===================
  // MÉTODOS DE ALTO NÍVEL
  // ===================

  /**
   * Gera NFSe (emissão individual)
   */
  async gerarNfse(xmlAssinado: string): Promise<SoapResponse> {
    return this.send('GerarNfse', xmlAssinado);
  }

  /**
   * Envia lote de RPS de forma síncrona
   */
  async enviarLoteRpsSincrono(xmlAssinado: string): Promise<SoapResponse> {
    return this.send('RecepcionarLoteRpsSincrono', xmlAssinado);
  }

  /**
   * Envia lote de RPS de forma assíncrona
   */
  async enviarLoteRps(xmlAssinado: string): Promise<SoapResponse> {
    return this.send('RecepcionarLoteRps', xmlAssinado);
  }

  /**
   * Cancela NFSe
   */
  async cancelarNfse(xmlAssinado: string): Promise<SoapResponse> {
    return this.send('CancelarNfse', xmlAssinado);
  }

  /**
   * Substitui NFSe
   */
  async substituirNfse(xmlAssinado: string): Promise<SoapResponse> {
    return this.send('SubstituirNfse', xmlAssinado);
  }

  /**
   * Consulta lote de RPS
   */
  async consultarLoteRps(xml: string): Promise<SoapResponse> {
    return this.send('ConsultarLoteRps', xml);
  }

  /**
   * Consulta NFSe por RPS
   */
  async consultarNfseRps(xml: string): Promise<SoapResponse> {
    return this.send('ConsultarNfseRps', xml);
  }

  /**
   * Consulta NFSe por faixa
   */
  async consultarNfseFaixa(xml: string): Promise<SoapResponse> {
    return this.send('ConsultarNfseFaixa', xml);
  }

  /**
   * Consulta dados cadastrais do prestador
   */
  async consultarDadosCadastrais(xml: string): Promise<SoapResponse> {
    return this.send('ConsultarDadosCadastrais', xml);
  }

  /**
   * Consulta próximo RPS disponível
   */
  async consultarRpsDisponivel(xml: string): Promise<SoapResponse> {
    return this.send('ConsultarRpsDisponivel', xml);
  }

  /**
   * Consulta URL de visualização da NFSe
   */
  async consultarUrlNfse(xml: string): Promise<SoapResponse> {
    return this.send('ConsultarUrlNfse', xml);
  }
}

// ===================
// FACTORY
// ===================

let defaultClient: SoapClient | null = null;

export function createSoapClient(ambiente: Ambiente = 'homologacao'): SoapClient {
  return new SoapClient(ambiente);
}

export function getDefaultSoapClient(): SoapClient {
  if (!defaultClient) {
    const ambiente = (process.env.NFSE_AMBIENTE as Ambiente) || 'homologacao';
    defaultClient = new SoapClient(ambiente);
  }
  return defaultClient;
}
