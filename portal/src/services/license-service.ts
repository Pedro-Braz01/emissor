/**
 * ============================================================================
 * LICENSE SERVICE - VERIFICAÇÃO DE LICENÇAS
 * ============================================================================
 * Verifica se a licença está ativa antes de permitir emissão.
 * Usa a tabela `licencas` vinculada a `empresas` via empresa_id.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ===================
// TIPOS
// ===================

export interface LicenseStatus {
  ativo: boolean;
  status: 'TRIAL' | 'ATIVO' | 'SUSPENSO' | 'BLOQUEADO' | 'CANCELADO' | 'EXPIRADO';
  mensagem: string;
  vencimento?: Date;
  plano?: string;
  diasRestantes?: number;
  limitesUsados?: {
    notasMes: number;
    maxNotasMes: number;
  };
}

export interface GoogleSheetsConfig {
  sheetId: string;
  apiKey?: string;
  range?: string;
}

// ===================
// LICENSE SERVICE
// ===================

export class LicenseService {
  private supabase: SupabaseClient;
  private cache: Map<string, { status: LicenseStatus; expiry: number }> = new Map();
  private cacheTTL: number = 60000; // 1 minuto

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Verifica status da licença de uma empresa pelo empresa_id
   */
  async verificar(empresaId: string): Promise<LicenseStatus> {
    // Verifica cache
    const cached = this.cache.get(empresaId);
    if (cached && cached.expiry > Date.now()) {
      return cached.status;
    }

    try {
      // Busca licença da empresa
      const { data: licenca, error } = await this.supabase
        .from('licencas')
        .select('*')
        .eq('empresa_id', empresaId)
        .single();

      if (error || !licenca) {
        return this.buildStatus(false, 'BLOQUEADO', 'Licença não encontrada');
      }

      // Verifica se licença está ativa
      if (!licenca.license_active) {
        return this.buildStatus(false, 'BLOQUEADO', 'Licença desativada - aguardando ativação');
      }

      // Verifica validade/expiração
      if (licenca.data_expiracao) {
        const validade = new Date(licenca.data_expiracao);
        if (validade < new Date()) {
          return this.buildStatus(false, 'EXPIRADO', 'Licença expirada');
        }
        const diasRestantes = Math.ceil((validade.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        const status = this.buildStatus(
          true,
          'ATIVO',
          'Licença ativa',
          validade,
          licenca.plano,
          diasRestantes,
          {
            notasMes: licenca.notas_mes_atual || 0,
            maxNotasMes: licenca.notas_mes_limite || 50,
          }
        );

        this.cache.set(empresaId, { status, expiry: Date.now() + this.cacheTTL });
        return status;
      }

      // Licença ativa sem data de validade (permanente)
      const status = this.buildStatus(
        true,
        'ATIVO',
        'Licença ativa',
        undefined,
        licenca.plano,
        undefined,
        {
          notasMes: licenca.notas_mes_atual || 0,
          maxNotasMes: licenca.notas_mes_limite || 50,
        }
      );

      this.cache.set(empresaId, { status, expiry: Date.now() + this.cacheTTL });
      return status;

    } catch (error) {
      console.error('Erro ao verificar licença:', error);
      return this.buildStatus(false, 'BLOQUEADO', 'Erro ao verificar licença');
    }
  }

  /**
   * Verifica se pode emitir nota (licença + limites)
   */
  async podeEmitir(empresaId: string): Promise<{ pode: boolean; motivo: string }> {
    const licenca = await this.verificar(empresaId);

    if (!licenca.ativo) {
      return { pode: false, motivo: licenca.mensagem };
    }

    // Verifica limite de notas no mês
    if (licenca.limitesUsados) {
      if (licenca.limitesUsados.notasMes >= licenca.limitesUsados.maxNotasMes) {
        return {
          pode: false,
          motivo: `Limite de ${licenca.limitesUsados.maxNotasMes} notas/mês atingido. Faça upgrade do plano.`
        };
      }
    }

    return { pode: true, motivo: 'OK' };
  }

  /**
   * Incrementa contador de notas do mês
   */
  async incrementarNotasMes(empresaId: string): Promise<void> {
    // Incrementa diretamente na tabela licencas
    const { data: licenca } = await this.supabase
      .from('licencas')
      .select('notas_mes_atual')
      .eq('empresa_id', empresaId)
      .single();

    if (licenca) {
      await this.supabase
        .from('licencas')
        .update({ notas_mes_atual: (licenca.notas_mes_atual || 0) + 1 })
        .eq('empresa_id', empresaId);
    }

    this.cache.delete(empresaId); // Invalida cache
  }

  /**
   * Bloqueia uma licença (admin)
   */
  async bloquear(empresaId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('licencas')
      .update({ license_active: false })
      .eq('empresa_id', empresaId);

    if (!error) {
      this.cache.delete(empresaId);
    }

    return !error;
  }

  /**
   * Desbloqueia uma licença
   */
  async desbloquear(empresaId: string, novaValidade?: Date): Promise<boolean> {
    const updateData: Record<string, unknown> = {
      license_active: true,
    };

    if (novaValidade) {
      updateData.data_expiracao = novaValidade.toISOString().split('T')[0];
    }

    const { error } = await this.supabase
      .from('licencas')
      .update(updateData)
      .eq('empresa_id', empresaId);

    if (!error) {
      this.cache.delete(empresaId);
    }

    return !error;
  }

  // ===================
  // INTEGRAÇÃO GOOGLE SHEETS (OPCIONAL)
  // ===================

  /**
   * Verifica licença via Google Sheets público
   * A planilha deve ter colunas: CNPJ | Empresa | Status | Vencimento
   */
  async verificarViaGoogleSheets(
    cnpj: string,
    config: GoogleSheetsConfig
  ): Promise<LicenseStatus> {
    try {
      const range = config.range || 'A:G';
      const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:json&range=${range}`;

      const response = await fetch(url);
      const text = await response.text();

      const jsonText = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/)?.[1];
      if (!jsonText) {
        throw new Error('Formato inválido');
      }

      const data = JSON.parse(jsonText);
      const rows = data.table.rows;

      const cnpjLimpo = cnpj.replace(/\D/g, '');

      for (const row of rows) {
        const cells = row.c;
        if (!cells || !cells[0]) continue;

        const rowCnpj = String(cells[0].v || '').replace(/\D/g, '');

        if (rowCnpj === cnpjLimpo) {
          const status = String(cells[6]?.v || 'BLOQUEADO').toUpperCase();
          const vencimento = cells[5]?.v ? new Date(cells[5].v) : undefined;

          if (status === 'ATIVO') {
            if (vencimento && vencimento < new Date()) {
              return this.buildStatus(false, 'EXPIRADO', 'Licença expirada');
            }
            return this.buildStatus(true, 'ATIVO', 'Licença ativa', vencimento);
          } else if (status === 'TRIAL') {
            if (vencimento && vencimento < new Date()) {
              return this.buildStatus(false, 'EXPIRADO', 'Trial expirado');
            }
            return this.buildStatus(true, 'TRIAL', 'Período de trial', vencimento);
          } else {
            return this.buildStatus(false, status as LicenseStatus['status'], 'Licença não ativa');
          }
        }
      }

      return this.buildStatus(false, 'BLOQUEADO', 'CNPJ não encontrado na planilha de licenças');

    } catch (error) {
      console.error('Erro ao verificar licença via Google Sheets:', error);
      return this.buildStatus(true, 'ATIVO', 'Verificação offline - permitido temporariamente');
    }
  }

  // ===================
  // HELPERS
  // ===================

  private buildStatus(
    ativo: boolean,
    status: LicenseStatus['status'],
    mensagem: string,
    vencimento?: Date,
    plano?: string,
    diasRestantes?: number,
    limitesUsados?: LicenseStatus['limitesUsados']
  ): LicenseStatus {
    return {
      ativo,
      status,
      mensagem,
      vencimento,
      plano,
      diasRestantes,
      limitesUsados,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ===================
// FACTORY
// ===================

let instance: LicenseService | null = null;

export function getLicenseService(): LicenseService {
  if (!instance) {
    instance = new LicenseService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return instance;
}

export default LicenseService;
