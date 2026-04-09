/**
 * ============================================================================
 * NFSE SERVICE - SERVIÇO PRINCIPAL DE EMISSÃO
 * ============================================================================
 * Orquestra todo o fluxo de emissão de NFSe
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SoapClient, type SoapResponse, type Ambiente } from './soap-client';
import { XmlBuilder, type DadosNfse, type Prestador, type Tomador, type Servico } from './xml-builder';
import { XmlSigner, decryptPassword } from './xml-signer';

// ===================
// TIPOS
// ===================

export interface EmissaoInput {
  empresaId: string;
  tomador: {
    cpfCnpj: string;
    razaoSocial: string;
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
  };
  servico: {
    valorServicos: number;
    discriminacao: string;
    itemListaServico?: string;
    codigoCnae?: string;
    codigoNbs?: string;
    issRetido?: boolean;
    aliquota?: number;
  };
  retencoes?: {
    pis?: number;
    cofins?: number;
    inss?: number;
    irrf?: number;
    csll?: number;
  };
  competencia?: string;
}

export interface EmissaoResult {
  success: boolean;
  notaId?: string;
  numeroRps?: number;
  serieRps?: string;
  numeroNfse?: number;
  codigoVerificacao?: string;
  linkNfse?: string;
  xmlEnvio?: string;
  xmlRetorno?: string;
  error?: string;
  errors?: Array<{ codigo: string; mensagem: string }>;
}

export interface CancelamentoInput {
  empresaId: string;
  numeroNfse: number;
  codigoCancelamento?: string;
  motivo?: string;
}

// ===================
// NFSE SERVICE
// ===================

export class NfseService {
  private supabase: SupabaseClient;
  private soapClient: SoapClient;
  private encryptionKey: string;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    ambiente: Ambiente = 'homologacao',
    encryptionKey: string
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.soapClient = new SoapClient(ambiente);
    this.encryptionKey = encryptionKey;
  }

  /**
   * Emite uma NFSe
   */
  async emitir(input: EmissaoInput, userId: string, userNome: string, userIp?: string): Promise<EmissaoResult> {
    let notaId = '';

    try {
      // 1. Busca dados da empresa
      const { data: empresa, error: empresaError } = await this.supabase
        .from('empresas')
        .select(`
          *,
          certificados (
            id, pfx_data, pfx_password_encrypted, ativo, validade
          )
        `)
        .eq('id', input.empresaId)
        .single();

      if (empresaError || !empresa) {
        return { success: false, error: 'Empresa não encontrada' };
      }

      // 2. Verifica certificado
      const certificado = empresa.certificados?.find((c: any) => c.ativo);
      if (!certificado) {
        return { success: false, error: 'Certificado digital não encontrado' };
      }

      if (new Date(certificado.validade) < new Date()) {
        return { success: false, error: 'Certificado digital expirado' };
      }

      // 3. Obtém próximo número de RPS
      // 3a. Consulta a prefeitura para verificar o último RPS disponível
      const serieRps = empresa.serie_rps || ((this.soapClient as any).ambiente === 'producao' ? '1' : '8');

      try {
        const rpsDisponivelXml = XmlBuilder.consultarRpsDisponivel({
          cnpj: empresa.cnpj,
          inscricaoMunicipal: empresa.inscricao_municipal,
        });
        const rpsDisponivelResponse = await this.soapClient.consultarRpsDisponivel(rpsDisponivelXml);

        if (rpsDisponivelResponse.success && rpsDisponivelResponse.xml) {
          // Extrai o número do RPS disponível da resposta
          const rpsMatch = rpsDisponivelResponse.xml.match(/<Numero>(\d+)<\/Numero>/i);
          if (rpsMatch) {
            const rpsPrefeitura = parseInt(rpsMatch[1]);
            // Atualiza o último RPS da prefeitura no banco
            await this.supabase
              .from('empresas')
              .update({ ultimo_rps_prefeitura: rpsPrefeitura > 0 ? rpsPrefeitura - 1 : 0 })
              .eq('id', input.empresaId);
          }
        }
      } catch (rpsError) {
        // Se falhar a consulta à prefeitura, continua com o número local
        console.warn('Falha ao consultar RPS disponível na prefeitura, usando numeração local:', rpsError);
      }

      // 3b. Obtém próximo RPS do banco (já considera o último da prefeitura)
      const { data: rpsData } = await this.supabase.rpc('get_next_rps_number', {
        p_empresa_id: input.empresaId,
        p_serie: serieRps,
      });
      const numeroRps = rpsData || 1;

      // 4. Prepara dados do tomador
      let tomadorId: string | undefined;
      
      // Verifica se tomador já existe
      const { data: tomadorExistente } = await this.supabase
        .from('tomadores')
        .select('id')
        .eq('empresa_id', input.empresaId)
        .eq('cpf_cnpj', input.tomador.cpfCnpj.replace(/\D/g, ''))
        .single();

      if (tomadorExistente) {
        tomadorId = tomadorExistente.id;
      } else {
        // Cria novo tomador
        const { data: novoTomador } = await this.supabase
          .from('tomadores')
          .insert({
            empresa_id: input.empresaId,
            cpf_cnpj: input.tomador.cpfCnpj.replace(/\D/g, ''),
            razao_social: input.tomador.razaoSocial,
            email: input.tomador.email,
            telefone: input.tomador.telefone,
            logradouro: input.tomador.endereco?.logradouro,
            numero: input.tomador.endereco?.numero,
            complemento: input.tomador.endereco?.complemento,
            bairro: input.tomador.endereco?.bairro,
            cep: input.tomador.endereco?.cep,
            codigo_municipio: input.tomador.endereco?.codigoMunicipio,
            uf: input.tomador.endereco?.uf,
          })
          .select('id')
          .single();
        
        tomadorId = novoTomador?.id;
      }

      // 5. Calcula impostos
      const aliquotaIss = input.servico.aliquota || Number(empresa.aliquota_iss) || 0.05;
      const valorServicos = input.servico.valorServicos;
      const valorIss = valorServicos * aliquotaIss;
      const retPis = input.retencoes?.pis || 0;
      const retCofins = input.retencoes?.cofins || 0;
      const retInss = input.retencoes?.inss || 0;
      const retIrrf = input.retencoes?.irrf || 0;
      const retCsll = input.retencoes?.csll || 0;
      const totalRetencoes = retPis + retCofins + retInss + retIrrf + retCsll +
        (input.servico.issRetido ? valorIss : 0);
      const valorLiquido = valorServicos - totalRetencoes;

      // 6. Cria registro da nota (status processando)
      const competencia = input.competencia || new Date().toISOString().split('T')[0];

      const { data: nota, error: notaError } = await this.supabase
        .from('notas_fiscais')
        .insert({
          empresa_id: input.empresaId,
          tomador_id: tomadorId,
          tomador_razao_social: input.tomador.razaoSocial,
          tomador_cnpj_cpf: input.tomador.cpfCnpj,
          tomador_email: input.tomador.email || null,
          tomador_telefone: input.tomador.telefone || null,
          tomador_endereco: input.tomador.endereco?.logradouro || null,
          tomador_numero: input.tomador.endereco?.numero || null,
          tomador_complemento: input.tomador.endereco?.complemento || null,
          tomador_bairro: input.tomador.endereco?.bairro || null,
          tomador_cep: input.tomador.endereco?.cep || null,
          tomador_cidade: null,
          tomador_uf: input.tomador.endereco?.uf || null,
          numero_rps: numeroRps,
          serie_rps: serieRps,
          tipo_rps: 'RPS',
          data_emissao: new Date().toISOString().split('T')[0],
          competencia,
          status: 'pendente',
          valor_servicos: valorServicos,
          valor_iss: valorIss,
          aliquota_iss: aliquotaIss,
          valor_pis: retPis,
          valor_cofins: retCofins,
          valor_inss: retInss,
          valor_irrf: retIrrf,
          valor_csll: retCsll,
          valor_liquido: valorLiquido,
          valor_base_calculo: valorServicos,
          iss_retido: input.servico.issRetido || false,
          item_lista_servico: input.servico.itemListaServico || empresa.item_lista_servico,
          codigo_cnae: input.servico.codigoCnae || empresa.codigo_cnae,
          codigo_nbs: input.servico.codigoNbs || null,
          discriminacao: input.servico.discriminacao,
          municipio_prestacao: '3543402',
          municipio_incidencia: '3543402',
          exigibilidade_iss: 'exigivel',
          created_by: userId,
          created_by_ip: userIp,
        })
        .select('id')
        .single();

      if (notaError || !nota) {
        return { success: false, error: `Erro ao criar nota: ${notaError?.message}` };
      }

      notaId = nota.id;

      // 7. Monta dados para o XML
      const dadosNfse: DadosNfse = {
        rps: {
          numero: numeroRps,
          serie: serieRps,
          tipo: 1,
          dataEmissao: new Date().toISOString().split('T')[0],
          status: 1,
        },
        competencia,
        servico: {
          valorServicos,
          valorIss,
          valorPis: retPis,
          valorCofins: retCofins,
          valorInss: retInss,
          valorIr: retIrrf,
          valorCsll: retCsll,
          aliquota: aliquotaIss,
          issRetido: input.servico.issRetido || false,
          itemListaServico: input.servico.itemListaServico || empresa.item_lista_servico || '01.07',
          codigoCnae: input.servico.codigoCnae || empresa.codigo_cnae,
          codigoNbs: input.servico.codigoNbs,
          discriminacao: input.servico.discriminacao,
          codigoMunicipio: '3543402',
          exigibilidadeIss: 1,
          municipioIncidencia: '3543402',
        },
        prestador: {
          cnpj: empresa.cnpj,
          inscricaoMunicipal: empresa.inscricao_municipal,
        },
        tomador: {
          cpfCnpj: input.tomador.cpfCnpj,
          razaoSocial: input.tomador.razaoSocial,
          email: input.tomador.email,
          telefone: input.tomador.telefone,
          endereco: input.tomador.endereco,
        },
        regimeEspecialTributacao: empresa.regime_especial || 6,
        optanteSimplesNacional: empresa.optante_simples ?? true,
        incentivoFiscal: empresa.incentivo_fiscal ?? false,
      };

      // 8. Gera XML
      const xmlSemAssinatura = XmlBuilder.gerarNfse(dadosNfse);

      // 9. Assina XML
      const pfxBuffer = Buffer.from(certificado.pfx_data, 'base64');
      const pfxPassword = decryptPassword(certificado.pfx_password_encrypted, this.encryptionKey);
      
      const signer = new XmlSigner(pfxBuffer, pfxPassword);
      
      if (!signer.isValid()) {
        await this.updateNotaStatus(notaId!, 'REJEITADA', 'Certificado digital expirado');
        return { success: false, error: 'Certificado digital expirado' };
      }

      const { xml: xmlAssinado } = signer.sign(xmlSemAssinatura);

      // 10. Envia para o WebService
      const soapResponse = await this.soapClient.gerarNfse(xmlAssinado);

      // 11. Atualiza nota com resultado
      if (soapResponse.success && soapResponse.data) {
        const nfseData = soapResponse.data;

        await this.supabase
          .from('notas_fiscais')
          .update({
            status: 'emitida',
            numero_nfse: nfseData.numeroNfse,
            codigo_verificacao: nfseData.codigoVerificacao,
            xml_enviado: xmlAssinado,
            xml_retorno: soapResponse.xml,
          })
          .eq('id', notaId);

        // Registra evento de sucesso
        await this.registrarEvento(notaId, 'EMISSAO', true, '000', 'NFSe emitida com sucesso', xmlAssinado, soapResponse.xml, userId, userIp);

        return {
          success: true,
          notaId,
          numeroRps,
          serieRps,
          numeroNfse: parseInt(nfseData.numeroNfse),
          codigoVerificacao: nfseData.codigoVerificacao,
          xmlEnvio: xmlAssinado,
          xmlRetorno: soapResponse.xml,
        };

      } else {
        // Falha na emissão
        const errorMsg = soapResponse.errors?.map(e => e.mensagem).join('; ') || 'Erro desconhecido';

        await this.supabase
          .from('notas_fiscais')
          .update({
            status: 'erro',
            xml_enviado: xmlAssinado,
            xml_retorno: soapResponse.xml,
            mensagem_erro: errorMsg,
          })
          .eq('id', notaId);

        // Registra evento de erro
        await this.registrarEvento(
          notaId, 
          'EMISSAO', 
          false, 
          soapResponse.errors?.[0]?.codigo || 'E999',
          errorMsg,
          xmlAssinado, 
          soapResponse.xml, 
          userId, 
          userIp
        );

        return {
          success: false,
          notaId,
          numeroRps,
          serieRps,
          error: errorMsg,
          errors: soapResponse.errors,
          xmlEnvio: xmlAssinado,
          xmlRetorno: soapResponse.xml,
        };
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      
      if (notaId) {
        await this.updateNotaStatus(notaId, 'erro', errorMsg);
        await this.registrarEvento(notaId, 'ERRO', false, 'E999', errorMsg, undefined, undefined, userId, userIp);
      }

      return {
        success: false,
        notaId,
        error: errorMsg,
      };
    }
  }

  /**
   * Cancela uma NFSe
   */
  async cancelar(input: CancelamentoInput, userId: string, userIp?: string): Promise<EmissaoResult> {
    try {
      // 1. Busca a nota
      const { data: nota, error: notaError } = await this.supabase
        .from('notas_fiscais')
        .select(`
          *,
          empresas (
            cnpj,
            inscricao_municipal,
            certificados (
              id, pfx_data, pfx_password_encrypted, ativo, validade
            )
          )
        `)
        .eq('empresa_id', input.empresaId)
        .eq('numero_nfse', input.numeroNfse)
        .eq('status', 'emitida')
        .single();

      if (notaError || !nota) {
        return { success: false, error: 'Nota não encontrada ou não pode ser cancelada' };
      }

      const empresa = nota.empresas;
      const certificado = empresa.certificados?.find((c: any) => c.ativo);
      
      if (!certificado) {
        return { success: false, error: 'Certificado digital não encontrado' };
      }

      // 2. Monta XML de cancelamento
      const prestador: Prestador = {
        cnpj: empresa.cnpj,
        inscricaoMunicipal: empresa.inscricao_municipal,
      };

      const xmlCancelamento = XmlBuilder.cancelarNfse(
        prestador,
        input.numeroNfse,
        input.codigoCancelamento || '1',
        input.motivo
      );

      // 3. Assina XML
      const pfxBuffer = Buffer.from(certificado.pfx_data, 'base64');
      const pfxPassword = decryptPassword(certificado.pfx_password_encrypted, this.encryptionKey);
      const signer = new XmlSigner(pfxBuffer, pfxPassword);
      const { xml: xmlAssinado } = signer.sign(xmlCancelamento);

      // 4. Envia para o WebService
      const soapResponse = await this.soapClient.cancelarNfse(xmlAssinado);

      // 5. Atualiza nota
      if (soapResponse.success) {
        await this.supabase
          .from('notas_fiscais')
          .update({
            status: 'cancelada',
            mensagem_erro: input.motivo ? `Cancelamento: ${input.motivo}` : null,
          })
          .eq('id', nota.id);

        await this.registrarEvento(nota.id, 'CANCELAMENTO', true, '000', 'NFSe cancelada', xmlAssinado, soapResponse.xml, userId, userIp);

        return {
          success: true,
          notaId: nota.id,
          numeroNfse: input.numeroNfse,
        };
      } else {
        const errorMsg = soapResponse.errors?.map(e => e.mensagem).join('; ') || 'Erro ao cancelar';
        
        await this.registrarEvento(nota.id, 'CANCELAMENTO', false, soapResponse.errors?.[0]?.codigo || 'E999', errorMsg, xmlAssinado, soapResponse.xml, userId, userIp);

        return {
          success: false,
          notaId: nota.id,
          error: errorMsg,
          errors: soapResponse.errors,
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Consulta dados cadastrais do prestador
   */
  async consultarDadosCadastrais(empresaId: string): Promise<SoapResponse> {
    const { data: empresa } = await this.supabase
      .from('empresas')
      .select('cnpj, inscricao_municipal')
      .eq('id', empresaId)
      .single();

    if (!empresa) {
      return { success: false, errors: [{ codigo: 'E001', mensagem: 'Empresa não encontrada' }] };
    }

    const xml = XmlBuilder.consultarDadosCadastrais({
      cnpj: empresa.cnpj,
      inscricaoMunicipal: empresa.inscricao_municipal,
    });

    return this.soapClient.consultarDadosCadastrais(xml);
  }

  /**
   * Consulta próximo RPS disponível
   */
  async consultarRpsDisponivel(empresaId: string): Promise<SoapResponse> {
    const { data: empresa } = await this.supabase
      .from('empresas')
      .select('cnpj, inscricao_municipal')
      .eq('id', empresaId)
      .single();

    if (!empresa) {
      return { success: false, errors: [{ codigo: 'E001', mensagem: 'Empresa não encontrada' }] };
    }

    const xml = XmlBuilder.consultarRpsDisponivel({
      cnpj: empresa.cnpj,
      inscricaoMunicipal: empresa.inscricao_municipal,
    });

    return this.soapClient.consultarRpsDisponivel(xml);
  }

  // ===================
  // MÉTODOS AUXILIARES
  // ===================

  private async updateNotaStatus(notaId: string, status: string, motivo?: string) {
    await this.supabase
      .from('notas_fiscais')
      .update({
        status,
        mensagem_erro: motivo,
      })
      .eq('id', notaId);
  }

  private async registrarEvento(
    notaId: string,
    tipo: string,
    sucesso: boolean,
    codigo: string,
    mensagem: string,
    xmlEnvio?: string,
    xmlRetorno?: string,
    userId?: string,
    userIp?: string
  ) {
    await this.supabase.from('eventos_nota').insert({
      nota_id: notaId,
      tipo,
      sucesso,
      codigo_retorno: codigo,
      mensagem,
      xml_envio: xmlEnvio,
      xml_retorno: xmlRetorno,
      ip_origem: userIp,
      created_by: userId,
    });
  }
}

// ===================
// FACTORY
// ===================

export function createNfseService(
  supabaseUrl: string,
  supabaseKey: string,
  ambiente: Ambiente = 'homologacao',
  encryptionKey: string
): NfseService {
  return new NfseService(supabaseUrl, supabaseKey, ambiente, encryptionKey);
}

export default NfseService;
