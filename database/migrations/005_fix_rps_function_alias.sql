-- ============================================================================
-- Migration 005: Alias para função RPS (compatibilidade com nfse-service.ts)
-- ============================================================================

-- O nfse-service.ts chama get_next_rps_number mas a função definida é proximo_rps
-- Cria alias para manter compatibilidade
CREATE OR REPLACE FUNCTION public.get_next_rps_number(p_empresa_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN public.proximo_rps(p_empresa_id, '1');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Habilitar pg_cron para reset mensal de contadores (descomente no Supabase SQL Editor):
-- SELECT cron.schedule('reset-contadores-mensais', '0 0 1 * *', 'SELECT public.reset_contadores_mensais()');
