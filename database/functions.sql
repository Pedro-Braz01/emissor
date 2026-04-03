-- ============================================================================
-- FUNÇÕES ADICIONAIS PARA O SUPABASE
-- Execute DEPOIS do schema.sql
-- ============================================================================

-- ============================================================================
-- Função: incrementar contador de notas do mês
-- ============================================================================
CREATE OR REPLACE FUNCTION public.incrementar_notas_mes(p_empresa_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.licencas
  SET notas_mes_atual = notas_mes_atual + 1
  WHERE empresa_id = p_empresa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Função: resetar contadores mensais (agendar via pg_cron no 1º dia do mês)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reset_contadores_mensais()
RETURNS void AS $$
BEGIN
  UPDATE public.licencas SET notas_mes_atual = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Agendamento (requer pg_cron habilitado no Supabase):
-- SELECT cron.schedule('reset-contadores', '0 0 1 * *', 'SELECT public.reset_contadores_mensais()');

-- ============================================================================
-- Função: verificar se empresa pode emitir NFS-e
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pode_emitir(p_empresa_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_empresa  public.empresas%ROWTYPE;
  v_licenca  public.licencas%ROWTYPE;
BEGIN
  -- Busca empresa
  SELECT * INTO v_empresa FROM public.empresas WHERE id = p_empresa_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Verifica status da licença na empresa
  IF v_empresa.status_licenca NOT IN ('ativa') THEN
    RETURN FALSE;
  END IF;

  -- Busca licença
  SELECT * INTO v_licenca FROM public.licencas WHERE empresa_id = p_empresa_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Verifica se licença está ativa
  IF NOT v_licenca.license_active THEN
    RETURN FALSE;
  END IF;

  -- Verifica validade
  IF v_licenca.data_expiracao IS NOT NULL AND v_licenca.data_expiracao < CURRENT_DATE THEN
    RETURN FALSE;
  END IF;

  -- Verifica limite de notas no mês
  IF v_licenca.notas_mes_atual >= v_licenca.notas_mes_limite THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Função: próximo número de RPS disponível para a empresa
-- ============================================================================
CREATE OR REPLACE FUNCTION public.proximo_rps(p_empresa_id UUID, p_serie VARCHAR DEFAULT '1')
RETURNS INTEGER AS $$
DECLARE
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(numero_rps), 0) INTO v_max
  FROM public.notas_fiscais
  WHERE empresa_id = p_empresa_id AND serie_rps = p_serie;

  RETURN v_max + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Função: criar configurações tributárias default ao criar empresa
-- ============================================================================
CREATE OR REPLACE FUNCTION public.on_empresa_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Cria config tributária default
  INSERT INTO public.configuracoes_tributarias (empresa_id)
  VALUES (NEW.id)
  ON CONFLICT (empresa_id) DO NOTHING;

  -- Cria licença default (básico, 50 notas/mês)
  INSERT INTO public.licencas (empresa_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  -- Cria perfil owner para o criador
  INSERT INTO public.perfis_usuarios (user_id, empresa_id, role)
  VALUES (NEW.user_id, NEW.id, 'owner')
  ON CONFLICT (user_id, empresa_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_empresa_created ON public.empresas;
CREATE TRIGGER trg_empresa_created
  AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.on_empresa_created();
