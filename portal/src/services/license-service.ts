/**
 * ============================================================================
 * LICENSE SERVICE - VERIFICAÇÃO DE LICENÇAS
 * ============================================================================
 * Verifica se a licença está ativa antes de permitir emissão
 * Suporta verificação via:
 * 1. Banco de dados Supabase (padrão)
 * 2. Google Sheets (opcional, para gerenciamento fácil)
 * 3. Stripe (futuro)
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
    empresas: number;
    maxEmpresas: number;
    usuarios: number;
    maxUsuarios: number;
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
   * Verifica status da licença do tenant
   */
  async verificar(tenantId: string): Promise<LicenseStatus> {
    // Verifica cache
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiry > Date.now()) {
      return cached.status;
    }

    try {
      // Busca licença e tenant
      const { data, error } = await this.supabase
        .from('licencas')
        .select(`
          *,
          tenants (
            id,
            nome,
            plano,
            max_empresas,
            max_usuarios,
            max_notas_mes,
            empresas_ativas,
            usuarios_ativos,
            notas_mes_atual,
            ativo
          )
        `)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) {
        return this.buildStatus(false, 'BLOQUEADO', 'Licença não encontrada');
      }

      const licenca = data;
      const tenant = data.tenants;

      // Verifica se tenant está ativo
      if (!tenant.ativo) {
        return this.buildStatus(false, 'CANCELADO', 'Conta cancelada');
      }

      // Verifica status da licença
      if (licenca.status === 'BLOQUEADO') {
        return this.buildStatus(false, 'BLOQUEADO', licenca.blocked_reason || 'Licença bloqueada pelo administrador');
      }

      if (licenca.status === 'CANCELADO') {
        return this.buildStatus(false, 'CANCELADO', 'Licença cancelada');
      }

      if (licenca.status === 'SUSPENSO') {
        return this.buildStatus(false, 'SUSPENSO', 'Licença suspensa - verifique o pagamento');
      }

      // Verifica se está ativa
      if (!licenca.license_active) {
        return this.buildStatus(false, 'BLOQUEADO', 'Licença desativada');
      }

      // Verifica trial
      if (licenca.status === 'TRIAL') {
        const trialFim = new Date(licenca.trial_fim);
        if (trialFim < new Date()) {
          return this.buildStatus(false, 'EXPIRADO', 'Período de trial expirado');
        }
        const diasRestantes = Math.ceil((trialFim.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return this.buildStatus(
          true, 
          'TRIAL', 
          `Trial ativo - ${diasRestantes} dias restantes`,
          trialFim,
          tenant.plano,
          diasRestantes,
          this.buildLimites(tenant)
        );
      }

      // Verifica validade
      if (licenca.validade) {
        const validade = new Date(licenca.validade);
        if (validade < new Date()) {
          return this.buildStatus(false, 'EXPIRADO', 'Licença expirada');
        }
        const diasRestantes = Math.ceil((validade.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        const status = this.buildStatus(
          true,
          'ATIVO',
          'Licença ativa',
          validade,
          tenant.plano,
          diasRestantes,
          this.buildLimites(tenant)
        );

        // Salva no cache
        this.cache.set(tenantId, { status, expiry: Date.now() + this.cacheTTL });

        // Atualiza last_check
        this.supabase
          .from('licencas')
          .update({ last_check_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .then(() => {});

        return status;
      }

      // Licença ativa sem data de validade (permanente)
      const status = this.buildStatus(
        true,
        'ATIVO',
        'Licença ativa',
        undefined,
        tenant.plano,
        undefined,
        this.buildLimites(tenant)
      );

      this.cache.set(tenantId, { status, expiry: Date.now() + this.cacheTTL });
      return status;

    } catch (error) {
      console.error('Erro ao verificar licença:', error);
      return this.buildStatus(false, 'BLOQUEADO', 'Erro ao verificar licença');
    }
  }

  /**
   * Verifica se pode emitir nota (licença + limites)
   */
  async podeEmitir(tenantId: string): Promise<{ pode: boolean; motivo: string }> {
    const licenca = await this.verificar(tenantId);

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
  async incrementarNotasMes(tenantId: string): Promise<void> {
    await this.supabase.rpc('incrementar_notas_mes', { p_tenant_id: tenantId });
    this.cache.delete(tenantId); // Invalida cache
  }

  /**
   * Bloqueia uma licença (para você como admin)
   */
  async bloquear(tenantId: string, motivo: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('licencas')
      .update({
        status: 'BLOQUEADO',
        license_active: false,
        blocked_at: new Date().toISOString(),
        blocked_reason: motivo,
      })
      .eq('tenant_id', tenantId);

    if (!error) {
      this.cache.delete(tenantId);
    }

    return !error;
  }

  /**
   * Desbloqueia uma licença
   */
  async desbloquear(tenantId: string, novaValidade?: Date): Promise<boolean> {
    const updateData: any = {
      status: 'ATIVO',
      license_active: true,
      blocked_at: null,
      blocked_reason: null,
    };

    if (novaValidade) {
      updateData.validade = novaValidade.toISOString().split('T')[0];
    }

    const { error } = await this.supabase
      .from('licencas')
      .update(updateData)
      .eq('tenant_id', tenantId);

    if (!error) {
      this.cache.delete(tenantId);
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
      
      // Remove o wrapper do Google Visualization
      const jsonText = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/)?.[1];
      if (!jsonText) {
        throw new Error('Formato inválido');
      }

      const data = JSON.parse(jsonText);
      const rows = data.table.rows;

      // Procura o CNPJ
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      
      for (const row of rows) {
        const cells = row.c;
        if (!cells || !cells[0]) continue;

        const rowCnpj = String(cells[0].v || '').replace(/\D/g, '');
        
        if (rowCnpj === cnpjLimpo) {
          const empresa = cells[1]?.v || '';
          const status = String(cells[6]?.v || 'BLOQUEADO').toUpperCase();
          const vencimento = cells[5]?.v ? new Date(cells[5].v) : undefined;

          if (status === 'ATIVO') {
            // Verifica vencimento
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
            return this.buildStatus(false, status as any, 'Licença não ativa');
          }
        }
      }

      return this.buildStatus(false, 'BLOQUEADO', 'CNPJ não encontrado na planilha de licenças');

    } catch (error) {
      console.error('Erro ao verificar licença via Google Sheets:', error);
      // Em caso de erro na verificação, permite continuar (fail-open)
      // Você pode mudar para fail-close se preferir
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

  private buildLimites(tenant: any): LicenseStatus['limitesUsados'] {
    return {
      notasMes: tenant.notas_mes_atual || 0,
      maxNotasMes: tenant.max_notas_mes || 100,
      empresas: tenant.empresas_ativas || 0,
      maxEmpresas: tenant.max_empresas || 1,
      usuarios: tenant.usuarios_ativos || 0,
      maxUsuarios: tenant.max_usuarios || 3,
    };
  }

  /**
   * Limpa cache
   */
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
