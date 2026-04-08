-- ============================================================
-- Migration 006: Colunas de configuração RPS/NFS-e na empresa
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Colunas necessárias para emissão correta de NFS-e
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS serie_rps VARCHAR(5) NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS optante_simples BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incentivo_fiscal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regime_especial INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS codigo_cnae VARCHAR(10),
  ADD COLUMN IF NOT EXISTS item_lista_servico VARCHAR(10),
  ADD COLUMN IF NOT EXISTS aliquota_iss NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_rps_prefeitura INTEGER DEFAULT 0;

-- Comentários
COMMENT ON COLUMN public.empresas.serie_rps IS 'Série do RPS: 8=homologação, 1=produção';
COMMENT ON COLUMN public.empresas.optante_simples IS 'Empresa optante pelo Simples Nacional';
COMMENT ON COLUMN public.empresas.incentivo_fiscal IS 'Empresa possui incentivo fiscal';
COMMENT ON COLUMN public.empresas.regime_especial IS 'Regime especial tributação: 1=ME Municipal, 2=Estimativa, 3=Soc.Profissionais, 4=Cooperativa, 5=MEI, 6=ME/EPP';
COMMENT ON COLUMN public.empresas.ultimo_rps_prefeitura IS 'Último RPS confirmado pela prefeitura via ConsultarRpsDisponivel';

-- Atualizar função proximo_rps para considerar ultimo_rps_prefeitura
-- Agora compara o MAX local com o último confirmado pela prefeitura e usa o maior
CREATE OR REPLACE FUNCTION public.proximo_rps(p_empresa_id UUID, p_serie VARCHAR DEFAULT '1')
RETURNS INTEGER AS $$
DECLARE
  v_max_local INTEGER;
  v_max_prefeitura INTEGER;
  v_max INTEGER;
BEGIN
  -- Maior RPS já usado localmente
  SELECT COALESCE(MAX(numero_rps), 0) INTO v_max_local
  FROM public.notas_fiscais
  WHERE empresa_id = p_empresa_id AND serie_rps = p_serie;

  -- Último RPS confirmado pela prefeitura
  SELECT COALESCE(ultimo_rps_prefeitura, 0) INTO v_max_prefeitura
  FROM public.empresas
  WHERE id = p_empresa_id;

  -- Usa o maior dos dois como base
  v_max := GREATEST(v_max_local, v_max_prefeitura);

  RETURN v_max + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar alias
CREATE OR REPLACE FUNCTION public.get_next_rps_number(p_empresa_id UUID, p_serie VARCHAR DEFAULT '1')
RETURNS INTEGER AS $$
BEGIN
  RETURN public.proximo_rps(p_empresa_id, p_serie);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sincronizar optante_simples com regime_tributario existente
UPDATE public.empresas
SET optante_simples = (regime_tributario = 'simples_nacional')
WHERE optante_simples IS NOT NULL;

-- ============================================================
-- DONE! Migration 006 aplicada com sucesso.
-- ============================================================
