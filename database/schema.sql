-- ============================================================
-- NFSe Emissor — Ribeirão Preto
-- Schema completo para Supabase (PostgreSQL)
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABELA: empresas
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
  endereco              TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: licencas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.licencas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  license_active      BOOLEAN NOT NULL DEFAULT true,
  plano               VARCHAR(20) NOT NULL DEFAULT 'basico'
                        CHECK (plano IN ('basico','profissional','enterprise')),
  data_expiracao      DATE,
  notas_mes_limite    INTEGER NOT NULL DEFAULT 50,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: configuracoes_tributarias
-- ============================================================
CREATE TABLE IF NOT EXISTS public.configuracoes_tributarias (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id            UUID NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  aliquota_iss          NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  aliquota_pis          NUMERIC(5,2) NOT NULL DEFAULT 0.65,
  aliquota_cofins       NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  aliquota_csll         NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  aliquota_irrf         NUMERIC(5,2) NOT NULL DEFAULT 1.50,
  iss_retido_fonte      BOOLEAN NOT NULL DEFAULT false,
  codigo_servico        VARCHAR(10) NOT NULL DEFAULT '1.01',
  item_lista_servico    VARCHAR(10) NOT NULL DEFAULT '1',
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: notas_fiscais
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id                  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero_rps                  INTEGER NOT NULL,
  serie_rps                   VARCHAR(5) NOT NULL DEFAULT '1',
  tipo_rps                    VARCHAR(10) NOT NULL DEFAULT 'RPS',
  status                      VARCHAR(20) NOT NULL DEFAULT 'pendente'
                                CHECK (status IN ('pendente','emitida','cancelada','substituida','erro')),
  numero_nfse                 VARCHAR(20),
  codigo_verificacao          VARCHAR(50),
  protocolo                   VARCHAR(50),
  tomador_razao_social        VARCHAR(200) NOT NULL,
  tomador_cnpj_cpf            VARCHAR(18) NOT NULL,
  tomador_email               VARCHAR(200),
  tomador_inscricao_municipal VARCHAR(20),
  valor_servicos              NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_deducoes              NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_base_calculo          NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_iss                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_pis                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_cofins                NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_csll                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_irrf                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_liquido               NUMERIC(15,2) NOT NULL DEFAULT 0,
  discriminacao               TEXT NOT NULL,
  codigo_municipio_prestacao  VARCHAR(10) NOT NULL DEFAULT '3543402',
  xml_enviado                 TEXT,
  xml_retorno                 TEXT,
  pdf_url                     TEXT,
  mensagem_erro               TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  created_by                  UUID REFERENCES auth.users(id),
  created_by_ip               VARCHAR(45),
  UNIQUE (empresa_id, numero_rps, serie_rps)
);

-- ============================================================
-- TABELA: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id  UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao        VARCHAR(100) NOT NULL,
  detalhes    JSONB,
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notas_empresa_id      ON public.notas_fiscais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_status          ON public.notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_notas_created_at      ON public.notas_fiscais(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_empresa_id      ON public.audit_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at      ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licencas_empresa_id   ON public.licencas(empresa_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.empresas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_tributarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;

-- Empresas: usuário só vê/edita sua própria empresa
CREATE POLICY "empresa_select_own" ON public.empresas
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "empresa_insert_own" ON public.empresas
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "empresa_update_own" ON public.empresas
  FOR UPDATE USING (auth.uid() = user_id);

-- Licenças: usuário só vê licença da sua empresa
CREATE POLICY "licenca_select_own" ON public.licencas
  FOR SELECT USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
  );

-- Configurações: usuário só vê/edita config da sua empresa
CREATE POLICY "config_select_own" ON public.configuracoes_tributarias
  FOR SELECT USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
  );
CREATE POLICY "config_upsert_own" ON public.configuracoes_tributarias
  FOR ALL USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
  );

-- Notas: usuário só vê notas da sua empresa
CREATE POLICY "notas_select_own" ON public.notas_fiscais
  FOR SELECT USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
  );
CREATE POLICY "notas_insert_own" ON public.notas_fiscais
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
  );
CREATE POLICY "notas_update_own" ON public.notas_fiscais
  FOR UPDATE USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
  );

-- Audit logs: somente leitura pelo usuário dono
CREATE POLICY "audit_select_own" ON public.audit_logs
  FOR SELECT USING (
    empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid())
  );

-- ============================================================
-- FUNÇÃO: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_licencas_updated_at
  BEFORE UPDATE ON public.licencas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_config_updated_at
  BEFORE UPDATE ON public.configuracoes_tributarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- DADOS DE EXEMPLO (remova em produção)
-- ============================================================
-- Após criar seu usuário pelo Supabase Auth, insira sua empresa:
-- INSERT INTO public.empresas (user_id, cnpj, razao_social, inscricao_municipal, regime_tributario)
-- VALUES ('SEU_USER_ID_AQUI', '00.000.000/0001-00', 'Minha Empresa Ltda', '123456', 'simples_nacional');
