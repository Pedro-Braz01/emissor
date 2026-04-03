// Tipos compartilhados — importe daqui tanto no server quanto no client
// Não contém nenhum import de next/headers ou "use client"

export type RegimeTributario = 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
export type StatusNota = 'pendente' | 'emitida' | 'cancelada' | 'substituida' | 'erro';
export type StatusLicenca = 'pendente' | 'ativa' | 'suspensa' | 'cancelada';
export type UserRole = 'super_admin' | 'owner' | 'emissor';

export type Database = {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string;
          user_id: string;
          cnpj: string;
          razao_social: string;
          nome_fantasia: string | null;
          inscricao_municipal: string;
          regime_tributario: RegimeTributario;
          email_empresa: string | null;
          email_contador: string | null;
          telefone: string | null;
          endereco_completo: string | null;
          status_licenca: StatusLicenca;
          certificado_digital_encrypted: string | null;
          certificado_senha_encrypted: string | null;
          envio_auto_contador: boolean;
          envio_auto_emissor: boolean;
          envio_auto_tomador: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['empresas']['Row'], 'id' | 'created_at' | 'updated_at' | 'status_licenca'>;
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>;
      };

      perfis_usuarios: {
        Row: {
          id: string;
          user_id: string;
          empresa_id: string;
          role: UserRole;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['perfis_usuarios']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['perfis_usuarios']['Insert']>;
      };

      licencas: {
        Row: {
          id: string;
          empresa_id: string;
          license_active: boolean;
          data_expiracao: string | null;
          plano: 'basico' | 'profissional' | 'enterprise';
          notas_mes_limite: number;
          notas_mes_atual: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['licencas']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['licencas']['Insert']>;
      };

      configuracoes_tributarias: {
        Row: {
          id: string;
          empresa_id: string;
          aliquota_iss: number;
          aliquota_pis: number;
          aliquota_cofins: number;
          aliquota_csll: number;
          aliquota_irrf: number;
          aliquota_inss: number;
          iss_retido_fonte: boolean;
          codigo_servico: string;
          item_lista_servico: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['configuracoes_tributarias']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['configuracoes_tributarias']['Insert']>;
      };

      notas_fiscais: {
        Row: {
          id: string;
          empresa_id: string;
          numero_rps: number;
          serie_rps: string;
          tipo_rps: string;
          status: StatusNota;
          numero_nfse: string | null;
          codigo_verificacao: string | null;
          protocolo: string | null;
          // Header
          exigibilidade_iss: string | null;
          num_processo: string | null;
          municipio_incidencia: string | null;
          municipio_prestacao: string | null;
          competencia: string | null;
          // Tomador
          tomador_tipo_documento: string | null;
          tomador_razao_social: string;
          tomador_cnpj_cpf: string;
          tomador_inscricao_municipal: string | null;
          tomador_email: string | null;
          tomador_telefone: string | null;
          tomador_cep: string | null;
          tomador_endereco: string | null;
          tomador_numero: string | null;
          tomador_complemento: string | null;
          tomador_bairro: string | null;
          tomador_cidade: string | null;
          tomador_uf: string | null;
          // Serviço
          codigo_cnae: string | null;
          item_lc116: string | null;
          atividade_municipal: string | null;
          codigo_nbs: string | null;
          discriminacao: string;
          informacoes_adicionais: string | null;
          // Valores
          valor_servicos: number;
          valor_deducoes: number;
          desconto_condicionado: number;
          desconto_incondicionado: number;
          valor_base_calculo: number;
          // Impostos
          aliquota_iss: number;
          valor_iss: number;
          valor_pis: number;
          valor_cofins: number;
          valor_csll: number;
          valor_irrf: number;
          valor_inss: number;
          iss_retido: boolean;
          valor_liquido: number;
          // Envio
          enviar_para_tomador: boolean;
          // XML/PDF
          xml_enviado: string | null;
          xml_retorno: string | null;
          pdf_url: string | null;
          mensagem_erro: string | null;
          // Audit
          created_at: string;
          created_by: string | null;
          created_by_ip: string | null;
        };
        Insert: Omit<Database['public']['Tables']['notas_fiscais']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notas_fiscais']['Insert']>;
      };

      audit_logs: {
        Row: {
          id: string;
          empresa_id: string;
          user_id: string | null;
          acao: string;
          detalhes: Record<string, unknown> | null;
          ip: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>;
        Update: never;
      };
    };
  };
};
