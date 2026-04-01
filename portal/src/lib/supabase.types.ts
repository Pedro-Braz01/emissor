// Tipos compartilhados — importe daqui tanto no server quanto no client
// Não contém nenhum import de next/headers ou "use client"

export type RegimeTributario = 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
export type StatusNota = 'pendente' | 'emitida' | 'cancelada' | 'substituida' | 'erro';

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
          endereco: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['empresas']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>;
      };

      licencas: {
        Row: {
          id: string;
          empresa_id: string;
          license_active: boolean;
          data_expiracao: string | null;
          plano: 'basico' | 'profissional' | 'enterprise';
          notas_mes_limite: number;
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
          tomador_razao_social: string;
          tomador_cnpj_cpf: string;
          tomador_email: string | null;
          tomador_inscricao_municipal: string | null;
          valor_servicos: number;
          valor_deducoes: number;
          valor_base_calculo: number;
          valor_iss: number;
          valor_pis: number;
          valor_cofins: number;
          valor_csll: number;
          valor_irrf: number;
          valor_liquido: number;
          discriminacao: string;
          codigo_municipio_prestacao: string;
          xml_enviado: string | null;
          xml_retorno: string | null;
          pdf_url: string | null;
          protocolo: string | null;
          mensagem_erro: string | null;
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
