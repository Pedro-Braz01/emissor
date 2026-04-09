-- ============================================================
-- TODAS AS MIGRATIONS UNIFICADAS (001 a 006)
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e execute.
-- Todas usam IF NOT EXISTS, seguro executar mais de uma vez.
-- ============================================================


-- ============================================================
-- MIGRATION 001: Atualiza schema existente para v2
-- ============================================================

-- Novas colunas em empresas
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS certificado_digital_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS certificado_senha_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS envio_auto_contador BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envio_auto_emissor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envio_auto_tomador BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_licenca VARCHAR(20) NOT NULL DEFAULT 'pendente';

-- Renomear endereco -> endereco_completo (se existir)
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

-- Check constraint status_licenca
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

-- Tabela perfis_usuarios
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

-- Novas colunas em licencas
ALTER TABLE public.licencas
  ADD COLUMN IF NOT EXISTS notas_mes_atual INTEGER NOT NULL DEFAULT 0;

-- Novas colunas em configuracoes_tributarias
ALTER TABLE public.configuracoes_tributarias
  ADD COLUMN IF NOT EXISTS aliquota_inss NUMERIC(5,2) NOT NULL DEFAULT 11.00;

-- Novas colunas em notas_fiscais
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

-- Habilitar RLS
ALTER TABLE public.empresas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis_usuarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_tributarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;

-- Helper functions para RLS
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

-- Policies EMPRESAS
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

-- Policies PERFIS
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

-- Policies LICENCAS
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

-- Policies CONFIG TRIBUTARIAS
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

-- Policies NOTAS FISCAIS
DROP POLICY IF EXISTS notas_select_own ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_insert_own ON public.notas_fiscais;
DROP POLICY IF EXISTS notas_update_own ON public.notas_fiscais;

CREATE POLICY notas_select_own ON public.notas_fiscais
  FOR SELECT USING (empresa_id IN (SELECT public.my_empresa_ids()));
CREATE POLICY notas_insert_own ON public.notas_fiscais
  FOR INSERT WITH CHECK (empresa_id IN (SELECT public.my_empresa_ids()));
CREATE POLICY notas_update_own ON public.notas_fiscais
  FOR UPDATE USING (empresa_id IN (SELECT public.my_empresa_ids()));

-- Policies AUDIT LOGS
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

-- Trigger updated_at
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

-- Trigger auto-setup ao criar empresa
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
-- MIGRATION 002: Coluna cnaes_cadastrados
-- ============================================================

ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS cnaes_cadastrados JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.empresas.cnaes_cadastrados IS 'CNAEs cadastrados da empresa (principal + secundarios do cartao CNPJ).';


-- ============================================================
-- MIGRATION 003: Tabelas certificados, tomadores, eventos_nota
-- ============================================================

CREATE TABLE IF NOT EXISTS public.certificados (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pfx_data                TEXT NOT NULL,
  pfx_password_encrypted  TEXT NOT NULL,
  ativo                   BOOLEAN NOT NULL DEFAULT true,
  validade                TIMESTAMPTZ NOT NULL,
  subject                 TEXT,
  serial_number           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificados_empresa ON public.certificados(empresa_id);
ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tomadores (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cpf_cnpj              VARCHAR(18) NOT NULL,
  razao_social          VARCHAR(200) NOT NULL,
  inscricao_municipal   VARCHAR(20),
  email                 VARCHAR(200),
  telefone              VARCHAR(20),
  logradouro            VARCHAR(200),
  numero                VARCHAR(20),
  complemento           VARCHAR(100),
  bairro                VARCHAR(100),
  cep                   VARCHAR(10),
  codigo_municipio      VARCHAR(10),
  uf                    VARCHAR(2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, cpf_cnpj)
);

CREATE INDEX IF NOT EXISTS idx_tomadores_empresa ON public.tomadores(empresa_id);
ALTER TABLE public.tomadores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.eventos_nota (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nota_id         UUID NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL,
  sucesso         BOOLEAN NOT NULL DEFAULT false,
  codigo_retorno  VARCHAR(20),
  mensagem        TEXT,
  xml_envio       TEXT,
  xml_retorno     TEXT,
  ip_origem       VARCHAR(45),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_nota_id ON public.eventos_nota(nota_id);
ALTER TABLE public.eventos_nota ENABLE ROW LEVEL SECURITY;

-- Fix status constraint
ALTER TABLE public.notas_fiscais DROP CONSTRAINT IF EXISTS notas_fiscais_status_check;
ALTER TABLE public.notas_fiscais ADD CONSTRAINT notas_fiscais_status_check
  CHECK (status IN (
    'pendente','emitida','cancelada','substituida','erro',
    'PENDENTE','EMITIDA','CANCELADA','SUBSTITUIDA','PROCESSANDO','REJEITADA','ERRO'
  ));

ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS data_emissao DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS outras_retencoes NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS tomador_id UUID REFERENCES public.tomadores(id);

-- RLS policies novas tabelas (DROP IF EXISTS para seguranca)
DROP POLICY IF EXISTS "certificados_empresa_policy" ON public.certificados;
CREATE POLICY "certificados_empresa_policy" ON public.certificados
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis_usuarios
      WHERE user_id = auth.uid() AND ativo = true
    )
  );

DROP POLICY IF EXISTS "tomadores_empresa_policy" ON public.tomadores;
CREATE POLICY "tomadores_empresa_policy" ON public.tomadores
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis_usuarios
      WHERE user_id = auth.uid() AND ativo = true
    )
  );

DROP POLICY IF EXISTS "eventos_nota_policy" ON public.eventos_nota;
CREATE POLICY "eventos_nota_policy" ON public.eventos_nota
  FOR ALL USING (
    nota_id IN (
      SELECT nf.id FROM public.notas_fiscais nf
      JOIN public.perfis_usuarios pu ON pu.empresa_id = nf.empresa_id
      WHERE pu.user_id = auth.uid() AND pu.ativo = true
    )
  );


-- ============================================================
-- MIGRATION 004: Solicitacoes de vinculo
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_solicitacoes_empresa ON public.solicitacoes_vinculo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON public.solicitacoes_vinculo(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_email ON public.solicitacoes_vinculo(email_solicitante);

DROP TRIGGER IF EXISTS set_updated_at_solicitacoes ON public.solicitacoes_vinculo;
CREATE TRIGGER set_updated_at_solicitacoes
  BEFORE UPDATE ON public.solicitacoes_vinculo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.solicitacoes_vinculo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitacoes_select ON public.solicitacoes_vinculo;
CREATE POLICY solicitacoes_select ON public.solicitacoes_vinculo
  FOR SELECT USING (
    empresa_id IN (SELECT empresa_id FROM public.perfis_usuarios WHERE user_id = auth.uid() AND ativo = true AND role IN ('owner', 'super_admin'))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS solicitacoes_update ON public.solicitacoes_vinculo;
CREATE POLICY solicitacoes_update ON public.solicitacoes_vinculo
  FOR UPDATE USING (
    empresa_id IN (SELECT empresa_id FROM public.perfis_usuarios WHERE user_id = auth.uid() AND ativo = true AND role IN ('owner', 'super_admin'))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS solicitacoes_insert ON public.solicitacoes_vinculo;
CREATE POLICY solicitacoes_insert ON public.solicitacoes_vinculo
  FOR INSERT WITH CHECK (true);


-- ============================================================
-- MIGRATION 005: Alias get_next_rps_number
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_next_rps_number(p_empresa_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN public.proximo_rps(p_empresa_id, '1');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ============================================================
-- MIGRATION 006: Colunas RPS/NFS-e na empresa + funcao atualizada
-- ============================================================

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS serie_rps VARCHAR(5) NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS optante_simples BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incentivo_fiscal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regime_especial INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS codigo_cnae VARCHAR(10),
  ADD COLUMN IF NOT EXISTS item_lista_servico VARCHAR(10),
  ADD COLUMN IF NOT EXISTS aliquota_iss NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_rps_prefeitura INTEGER DEFAULT 0;

COMMENT ON COLUMN public.empresas.serie_rps IS 'Serie do RPS: 8=homologacao, 1=producao';
COMMENT ON COLUMN public.empresas.optante_simples IS 'Empresa optante pelo Simples Nacional';
COMMENT ON COLUMN public.empresas.incentivo_fiscal IS 'Empresa possui incentivo fiscal';
COMMENT ON COLUMN public.empresas.regime_especial IS 'Regime especial tributacao: 1=ME Municipal, 2=Estimativa, 3=Soc.Profissionais, 4=Cooperativa, 5=MEI, 6=ME/EPP';
COMMENT ON COLUMN public.empresas.ultimo_rps_prefeitura IS 'Ultimo RPS confirmado pela prefeitura via ConsultarRpsDisponivel';

-- Funcao proximo_rps atualizada (compara local vs prefeitura)
CREATE OR REPLACE FUNCTION public.proximo_rps(p_empresa_id UUID, p_serie VARCHAR DEFAULT '1')
RETURNS INTEGER AS $$
DECLARE
  v_max_local INTEGER;
  v_max_prefeitura INTEGER;
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(numero_rps), 0) INTO v_max_local
  FROM public.notas_fiscais
  WHERE empresa_id = p_empresa_id AND serie_rps = p_serie;

  SELECT COALESCE(ultimo_rps_prefeitura, 0) INTO v_max_prefeitura
  FROM public.empresas
  WHERE id = p_empresa_id;

  v_max := GREATEST(v_max_local, v_max_prefeitura);

  RETURN v_max + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar alias com parametro serie
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
-- TODAS AS MIGRATIONS APLICADAS COM SUCESSO!
-- ============================================================
