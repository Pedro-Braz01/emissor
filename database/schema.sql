-- ============================================================
-- NFSe Emissor — Ribeirão Preto  (Multi-Tenant)
-- DDL COMPLETO — execute no SQL Editor do Supabase
-- Ordem: extensões → tabelas → índices → RLS → triggers
-- Idempotente: pode rodar várias vezes sem erro
-- ============================================================

-- 0. Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TABELA: empresas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.empresas (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj                  VARCHAR(18) NOT NULL UNIQUE,
  razao_social          VARCHAR(200) NOT NULL,
  nome_fantasia         VARCHAR(200),
  inscricao_municipal   VARCHAR(20) NOT NULL,
  regime_tributario     VARCHAR(30) NOT NULL DEFAULT 'simples_nacional'
                          CHECK (regime_tributario IN ('simples_nacional','lucro_presumido','lucro_real')),
  email_empresa         VARCHAR(200),
  email_contador        VARCHAR(200),
  telefone              VARCHAR(20),
  endereco_completo     TEXT,
  status_licenca        VARCHAR(20) NOT NULL DEFAULT 'pendente'
                          CHECK (status_licenca IN ('pendente','ativa','suspensa','cancelada')),
  -- Certificado digital (armazenado criptografado)
  certificado_digital_encrypted TEXT,
  certificado_senha_encrypted   TEXT,
  -- Toggles de envio automático
  envio_auto_contador   BOOLEAN NOT NULL DEFAULT false,
  envio_auto_emissor    BOOLEAN NOT NULL DEFAULT false,
  envio_auto_tomador    BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. TABELA: perfis_usuarios  (multi-tenant roles)
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

-- ============================================================
-- 3. TABELA: licencas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.licencas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  license_active      BOOLEAN NOT NULL DEFAULT true,
  plano               VARCHAR(20) NOT NULL DEFAULT 'basico'
                        CHECK (plano IN ('basico','profissional','enterprise')),
  data_expiracao      DATE,
  notas_mes_limite    INTEGER NOT NULL DEFAULT 50,
  notas_mes_atual     INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. TABELA: configuracoes_tributarias
-- ============================================================
CREATE TABLE IF NOT EXISTS public.configuracoes_tributarias (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id            UUID NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  aliquota_iss          NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  aliquota_pis          NUMERIC(5,2) NOT NULL DEFAULT 0.65,
  aliquota_cofins       NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  aliquota_csll         NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  aliquota_irrf         NUMERIC(5,2) NOT NULL DEFAULT 1.50,
  aliquota_inss         NUMERIC(5,2) NOT NULL DEFAULT 11.00,
  iss_retido_fonte      BOOLEAN NOT NULL DEFAULT false,
  codigo_servico        VARCHAR(10) NOT NULL DEFAULT '1.01',
  item_lista_servico    VARCHAR(10) NOT NULL DEFAULT '1',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. TABELA: notas_fiscais
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id                  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- RPS
  numero_rps                  INTEGER NOT NULL,
  serie_rps                   VARCHAR(5) NOT NULL DEFAULT '1',
  tipo_rps                    VARCHAR(10) NOT NULL DEFAULT 'RPS',
  -- Status
  status                      VARCHAR(20) NOT NULL DEFAULT 'pendente'
                                CHECK (status IN ('pendente','emitida','cancelada','substituida','erro')),
  numero_nfse                 VARCHAR(20),
  codigo_verificacao          VARCHAR(50),
  protocolo                   VARCHAR(50),
  -- Header NFS-e
  exigibilidade_iss           VARCHAR(30) DEFAULT 'exigivel',
  num_processo                VARCHAR(30),
  municipio_incidencia        VARCHAR(10) DEFAULT '3543402',
  municipio_prestacao         VARCHAR(10) DEFAULT '3543402',
  competencia                 DATE DEFAULT CURRENT_DATE,
  -- Tomador
  tomador_tipo_documento      VARCHAR(5) DEFAULT 'cnpj'
                                CHECK (tomador_tipo_documento IN ('cnpj','cpf','ext')),
  tomador_razao_social        VARCHAR(200) NOT NULL,
  tomador_cnpj_cpf            VARCHAR(18) NOT NULL,
  tomador_inscricao_municipal VARCHAR(20),
  tomador_email               VARCHAR(200),
  tomador_telefone            VARCHAR(20),
  tomador_cep                 VARCHAR(10),
  tomador_endereco            VARCHAR(200),
  tomador_numero              VARCHAR(20),
  tomador_complemento         VARCHAR(100),
  tomador_bairro              VARCHAR(100),
  tomador_cidade              VARCHAR(100),
  tomador_uf                  VARCHAR(2),
  -- Serviço
  codigo_cnae                 VARCHAR(10),
  item_lc116                  VARCHAR(10),
  atividade_municipal         VARCHAR(10),
  codigo_nbs                  VARCHAR(15),
  discriminacao               TEXT NOT NULL,
  informacoes_adicionais      TEXT,
  -- Valores
  valor_servicos              NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_deducoes              NUMERIC(15,2) NOT NULL DEFAULT 0,
  desconto_condicionado       NUMERIC(15,2) NOT NULL DEFAULT 0,
  desconto_incondicionado     NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_base_calculo          NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Impostos
  aliquota_iss                NUMERIC(5,2) NOT NULL DEFAULT 0,
  valor_iss                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_pis                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_cofins                NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_csll                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_irrf                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_inss                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  iss_retido                  BOOLEAN NOT NULL DEFAULT false,
  valor_liquido               NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Envio
  enviar_para_tomador         BOOLEAN NOT NULL DEFAULT false,
  -- XML / PDF
  xml_enviado                 TEXT,
  xml_retorno                 TEXT,
  pdf_url                     TEXT,
  mensagem_erro               TEXT,
  -- Audit
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  UUID REFERENCES auth.users(id),
  created_by_ip               VARCHAR(45),
  UNIQUE (empresa_id, numero_rps, serie_rps)
);

-- ============================================================
-- 6. TABELA: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id  UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao        VARCHAR(100) NOT NULL,
  detalhes    JSONB,
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_perfis_user_id        ON public.perfis_usuarios(user_id);
CREATE INDEX IF NOT EXISTS idx_perfis_empresa_id     ON public.perfis_usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_empresa_id      ON public.notas_fiscais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_status          ON public.notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_notas_created_at      ON public.notas_fiscais(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notas_competencia     ON public.notas_fiscais(competencia DESC);
CREATE INDEX IF NOT EXISTS idx_audit_empresa_id      ON public.audit_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at      ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licencas_empresa_id   ON public.licencas(empresa_id);

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.empresas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis_usuarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_tributarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;

-- Helper: retorna true se o user logado é super_admin em qualquer empresa
-- LANGUAGE plpgsql: validado em runtime (evita 42703 por cache de schema)
-- SEM STABLE: auth.uid() muda por sessão, não pode ser cacheado
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

-- Helper: retorna os empresa_ids que o user logado pode acessar
-- LANGUAGE plpgsql: validado em runtime (evita 42703 por cache de schema)
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

-- ── EMPRESAS ──────────────────────────────────────────────
-- Owner vê sua empresa + super_admin vê tudo
DROP POLICY IF EXISTS empresa_select_own ON public.empresas;
CREATE POLICY empresa_select_own ON public.empresas
  FOR SELECT USING (
    auth.uid() = user_id
    OR id IN (SELECT public.my_empresa_ids())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS empresa_insert_own ON public.empresas;
CREATE POLICY empresa_insert_own ON public.empresas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS empresa_update_own ON public.empresas;
CREATE POLICY empresa_update_own ON public.empresas
  FOR UPDATE USING (
    auth.uid() = user_id
    OR public.is_super_admin()
  );

-- ── PERFIS_USUARIOS ──────────────────────────────────────
DROP POLICY IF EXISTS perfil_select_own ON public.perfis_usuarios;
CREATE POLICY perfil_select_own ON public.perfis_usuarios
  FOR SELECT USING (
    user_id = auth.uid()
    OR empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS perfil_insert_owner ON public.perfis_usuarios;
CREATE POLICY perfil_insert_owner ON public.perfis_usuarios
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS perfil_update_owner ON public.perfis_usuarios;
CREATE POLICY perfil_update_owner ON public.perfis_usuarios
  FOR UPDATE USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS perfil_delete_owner ON public.perfis_usuarios;
CREATE POLICY perfil_delete_owner ON public.perfis_usuarios
  FOR DELETE USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

-- ── LICENÇAS ─────────────────────────────────────────────
DROP POLICY IF EXISTS licenca_select_own ON public.licencas;
CREATE POLICY licenca_select_own ON public.licencas
  FOR SELECT USING (
    empresa_id IN (SELECT public.my_empresa_ids())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS licenca_insert_own ON public.licencas;
CREATE POLICY licenca_insert_own ON public.licencas
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS licenca_update_own ON public.licencas;
CREATE POLICY licenca_update_own ON public.licencas
  FOR UPDATE USING (
    public.is_super_admin()
  );

-- ── CONFIGURAÇÕES TRIBUTÁRIAS ────────────────────────────
DROP POLICY IF EXISTS config_select_own ON public.configuracoes_tributarias;
DROP POLICY IF EXISTS config_upsert_own ON public.configuracoes_tributarias;
DROP POLICY IF EXISTS config_insert_own ON public.configuracoes_tributarias;
DROP POLICY IF EXISTS config_update_own ON public.configuracoes_tributarias;

CREATE POLICY config_select_own ON public.configuracoes_tributarias
  FOR SELECT USING (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

CREATE POLICY config_insert_own ON public.configuracoes_tributarias
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

CREATE POLICY config_update_own ON public.configuracoes_tributarias
  FOR UPDATE USING (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

-- ── NOTAS FISCAIS ────────────────────────────────────────
DROP POLICY IF EXISTS notas_select_own ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_insert_own ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_update_own ON public.notas_fiscais;

CREATE POLICY notas_select_own ON public.notas_fiscais
  FOR SELECT USING (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

CREATE POLICY notas_insert_own ON public.notas_fiscais
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

CREATE POLICY notas_update_own ON public.notas_fiscais
  FOR UPDATE USING (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

-- ── AUDIT LOGS ───────────────────────────────────────────
DROP POLICY IF EXISTS audit_select_own ON public.audit_logs;
DROP POLICY IF EXISTS audit_insert_own ON public.audit_logs;

CREATE POLICY audit_select_own ON public.audit_logs
  FOR SELECT USING (
    empresa_id IN (SELECT public.my_empresa_ids())
    OR public.is_super_admin()
  );

-- Permite insert de audit via app (service_role bypassa RLS,
-- mas esta policy permite insert via client quando necessário)
CREATE POLICY audit_insert_own ON public.audit_logs
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT public.my_empresa_ids())
  );

-- ============================================================
-- 9. TRIGGERS: updated_at automático
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
