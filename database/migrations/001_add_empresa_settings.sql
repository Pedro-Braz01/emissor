-- ============================================================
-- Migration 001: Atualiza schema existente para v2
-- Execute no SQL Editor do Supabase
-- IMPORTANTE: Se você está criando do zero, execute schema.sql + functions.sql
--             Esta migration é apenas para atualizar um banco que já tinha o schema antigo.
-- ============================================================

-- ============================================================
-- PASSO 1: Novas colunas em empresas
-- ============================================================
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS certificado_digital_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS certificado_senha_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS envio_auto_contador BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envio_auto_emissor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envio_auto_tomador BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_licenca VARCHAR(20) NOT NULL DEFAULT 'pendente';

-- Renomear endereco → endereco_completo (se a coluna antiga existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'endereco'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'endereco_completo'
  ) THEN
    ALTER TABLE public.empresas RENAME COLUMN endereco TO endereco_completo;
  END IF;
END $$;

-- Adicionar check constraint se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'empresas_status_licenca_check'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_status_licenca_check
      CHECK (status_licenca IN ('pendente','ativa','suspensa','cancelada'));
  END IF;
END $$;

-- ============================================================
-- PASSO 2: Criar tabela perfis_usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfis_usuarios (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  role                  VARCHAR(20) NOT NULL DEFAULT 'emissor'
                          CHECK (role IN ('super_admin','owner','emissor')),
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_perfis_user_id    ON public.perfis_usuarios(user_id);
CREATE INDEX IF NOT EXISTS idx_perfis_empresa_id ON public.perfis_usuarios(empresa_id);

-- ============================================================
-- PASSO 3: Novas colunas em licencas
-- ============================================================
ALTER TABLE public.licencas
  ADD COLUMN IF NOT EXISTS notas_mes_atual INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- PASSO 4: Novas colunas em configuracoes_tributarias
-- ============================================================
ALTER TABLE public.configuracoes_tributarias
  ADD COLUMN IF NOT EXISTS aliquota_inss NUMERIC(5,2) NOT NULL DEFAULT 11.00;

-- ============================================================
-- PASSO 5: Novas colunas em notas_fiscais
-- ============================================================
ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS tomador_telefone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tomador_cep VARCHAR(10),
  ADD COLUMN IF NOT EXISTS tomador_endereco VARCHAR(200),
  ADD COLUMN IF NOT EXISTS tomador_numero VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tomador_complemento VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tomador_bairro VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tomador_cidade VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tomador_uf VARCHAR(2),
  ADD COLUMN IF NOT EXISTS tomador_tipo_documento VARCHAR(5) DEFAULT 'cnpj',
  ADD COLUMN IF NOT EXISTS exigibilidade_iss VARCHAR(30) DEFAULT 'exigivel',
  ADD COLUMN IF NOT EXISTS num_processo VARCHAR(30),
  ADD COLUMN IF NOT EXISTS municipio_incidencia VARCHAR(10) DEFAULT '3543402',
  ADD COLUMN IF NOT EXISTS municipio_prestacao VARCHAR(10) DEFAULT '3543402',
  ADD COLUMN IF NOT EXISTS competencia DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS codigo_cnae VARCHAR(10),
  ADD COLUMN IF NOT EXISTS item_lc116 VARCHAR(10),
  ADD COLUMN IF NOT EXISTS atividade_municipal VARCHAR(10),
  ADD COLUMN IF NOT EXISTS codigo_nbs VARCHAR(15),
  ADD COLUMN IF NOT EXISTS informacoes_adicionais TEXT,
  ADD COLUMN IF NOT EXISTS desconto_condicionado NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_incondicionado NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aliquota_iss NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_inss NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iss_retido BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enviar_para_tomador BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- PASSO 6: Habilitar RLS em todas as tabelas
-- ============================================================
ALTER TABLE public.empresas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis_usuarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_tributarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PASSO 7: Helper functions para RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.perfis_usuarios
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND ativo = true
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.my_empresa_ids()
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
    SELECT pf.empresa_id
    FROM public.perfis_usuarios pf
    WHERE pf.user_id = auth.uid() AND pf.ativo = true
    UNION
    SELECT e.id
    FROM public.empresas e
    WHERE e.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PASSO 8: Recriar policies (DROP IF EXISTS + CREATE)
-- ============================================================

-- ── EMPRESAS ──
DROP POLICY IF EXISTS empresa_select_own ON public.empresas;
DROP POLICY IF EXISTS empresa_insert_own ON public.empresas;
DROP POLICY IF EXISTS empresa_update_own ON public.empresas;

CREATE POLICY empresa_select_own ON public.empresas
  FOR SELECT USING (
    auth.uid() = user_id
    OR id IN (SELECT public.my_empresa_ids())
    OR public.is_super_admin()
  );
CREATE POLICY empresa_insert_own ON public.empresas
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY empresa_update_own ON public.empresas
  FOR UPDATE USING (
    auth.uid() = user_id OR public.is_super_admin()
  );

-- ── PERFIS ──
DROP POLICY IF EXISTS perfil_select_own ON public.perfis_usuarios;
DROP POLICY IF EXISTS perfil_insert_owner ON public.perfis_usuarios;
DROP POLICY IF EXISTS perfil_update_owner ON public.perfis_usuarios;
DROP POLICY IF EXISTS perfil_delete_owner ON public.perfis_usuarios;

CREATE POLICY perfil_select_own ON public.perfis_usuarios
  FOR SELECT USING (
    user_id = auth.uid()
    OR empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );
CREATE POLICY perfil_insert_owner ON public.perfis_usuarios
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );
CREATE POLICY perfil_update_owner ON public.perfis_usuarios
  FOR UPDATE USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );
CREATE POLICY perfil_delete_owner ON public.perfis_usuarios
  FOR DELETE USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

-- ── LICENÇAS ──
DROP POLICY IF EXISTS licenca_select_own ON public.licencas;
DROP POLICY IF EXISTS licenca_insert_own ON public.licencas;
DROP POLICY IF EXISTS licenca_update_own ON public.licencas;

CREATE POLICY licenca_select_own ON public.licencas
  FOR SELECT USING (
    empresa_id IN (SELECT public.my_empresa_ids())
    OR public.is_super_admin()
  );
CREATE POLICY licenca_insert_own ON public.licencas
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );
CREATE POLICY licenca_update_own ON public.licencas
  FOR UPDATE USING (public.is_super_admin());

-- ── CONFIG TRIBUTÁRIAS ──
DROP POLICY IF EXISTS config_select_own ON public.configuracoes_tributarias;
DROP POLICY IF EXISTS config_upsert_own ON public.configuracoes_tributarias;
DROP POLICY IF EXISTS config_insert_own ON public.configuracoes_tributarias;
DROP POLICY IF EXISTS config_update_own ON public.configuracoes_tributarias;

CREATE POLICY config_select_own ON public.configuracoes_tributarias
  FOR SELECT USING (empresa_id IN (SELECT public.my_empresa_ids()));
CREATE POLICY config_insert_own ON public.configuracoes_tributarias
  FOR INSERT WITH CHECK (empresa_id IN (SELECT public.my_empresa_ids()));
CREATE POLICY config_update_own ON public.configuracoes_tributarias
  FOR UPDATE USING (empresa_id IN (SELECT public.my_empresa_ids()));

-- ── NOTAS FISCAIS ──
DROP POLICY IF EXISTS notas_select_own ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_insert_own ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_update_own ON public.notas_fiscais;

CREATE POLICY notas_select_own ON public.notas_fiscais
  FOR SELECT USING (empresa_id IN (SELECT public.my_empresa_ids()));
CREATE POLICY notas_insert_own ON public.notas_fiscais
  FOR INSERT WITH CHECK (empresa_id IN (SELECT public.my_empresa_ids()));
CREATE POLICY notas_update_own ON public.notas_fiscais
  FOR UPDATE USING (empresa_id IN (SELECT public.my_empresa_ids()));

-- ── AUDIT LOGS ──
DROP POLICY IF EXISTS audit_select_own ON public.audit_logs;
DROP POLICY IF EXISTS audit_insert_own ON public.audit_logs;

CREATE POLICY audit_select_own ON public.audit_logs
  FOR SELECT USING (
    empresa_id IN (SELECT public.my_empresa_ids())
    OR public.is_super_admin()
  );
CREATE POLICY audit_insert_own ON public.audit_logs
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

-- ============================================================
-- PASSO 9: Triggers para updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresas_updated_at ON public.empresas;
CREATE TRIGGER trg_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_perfis_updated_at ON public.perfis_usuarios;
CREATE TRIGGER trg_perfis_updated_at
  BEFORE UPDATE ON public.perfis_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_licencas_updated_at ON public.licencas;
CREATE TRIGGER trg_licencas_updated_at
  BEFORE UPDATE ON public.licencas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_config_updated_at ON public.configuracoes_tributarias;
CREATE TRIGGER trg_config_updated_at
  BEFORE UPDATE ON public.configuracoes_tributarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PASSO 10: Trigger auto-setup ao criar empresa
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_empresa_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.configuracoes_tributarias (empresa_id)
  VALUES (NEW.id) ON CONFLICT (empresa_id) DO NOTHING;

  INSERT INTO public.licencas (empresa_id)
  VALUES (NEW.id) ON CONFLICT DO NOTHING;

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

-- ============================================================
-- DONE! Migration 001 aplicada com sucesso.
-- ============================================================
