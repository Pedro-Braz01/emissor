-- ============================================================================
-- Migration 004: Solicitações de vínculo de usuário a empresa
-- ============================================================================
-- Quando um usuário tenta cadastrar com CNPJ já existente, cria uma solicitação
-- para o owner da empresa aprovar ou rejeitar.

CREATE TABLE IF NOT EXISTS public.solicitacoes_vinculo (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  email_solicitante VARCHAR(200) NOT NULL,
  nome_solicitante  VARCHAR(200),
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  respondido_por  UUID REFERENCES auth.users(id),
  respondido_em   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_solicitacoes_empresa ON public.solicitacoes_vinculo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON public.solicitacoes_vinculo(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_email ON public.solicitacoes_vinculo(email_solicitante);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_solicitacoes
  BEFORE UPDATE ON public.solicitacoes_vinculo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.solicitacoes_vinculo ENABLE ROW LEVEL SECURITY;

-- Owners e super_admins podem ver solicitações da empresa
CREATE POLICY solicitacoes_select ON public.solicitacoes_vinculo
  FOR SELECT USING (
    empresa_id IN (SELECT empresa_id FROM public.perfis_usuarios WHERE user_id = auth.uid() AND ativo = true AND role IN ('owner', 'super_admin'))
    OR public.is_super_admin()
  );

-- Owners e super_admins podem atualizar (aprovar/rejeitar)
CREATE POLICY solicitacoes_update ON public.solicitacoes_vinculo
  FOR UPDATE USING (
    empresa_id IN (SELECT empresa_id FROM public.perfis_usuarios WHERE user_id = auth.uid() AND ativo = true AND role IN ('owner', 'super_admin'))
    OR public.is_super_admin()
  );

-- Inserção é feita via service_role (público via API)
CREATE POLICY solicitacoes_insert ON public.solicitacoes_vinculo
  FOR INSERT WITH CHECK (true);
