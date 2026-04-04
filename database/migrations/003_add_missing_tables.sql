-- ============================================================
-- Migration 003: Tabelas faltantes para fluxo completo de emissão
-- tomadores, certificados, eventos_nota + fix status constraint
-- ============================================================

-- 1. TABELA: certificados (certificados digitais A1)
CREATE TABLE IF NOT EXISTS public.certificados (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pfx_data                TEXT NOT NULL,          -- Base64 encoded PFX binary
  pfx_password_encrypted  TEXT NOT NULL,          -- AES-256-GCM encrypted password
  ativo                   BOOLEAN NOT NULL DEFAULT true,
  validade                TIMESTAMPTZ NOT NULL,   -- Certificate expiry date
  subject                 TEXT,                   -- Certificate subject (CN)
  serial_number           TEXT,                   -- Certificate serial
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificados_empresa ON public.certificados(empresa_id);
ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

-- 2. TABELA: tomadores (clientes/tomadores de serviço)
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

-- 3. TABELA: eventos_nota (histórico de eventos de cada nota)
CREATE TABLE IF NOT EXISTS public.eventos_nota (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nota_id         UUID NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL, -- EMISSAO, CANCELAMENTO, CONSULTA, ERRO
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

-- 4. Fix status constraint: NfseService usa UPPERCASE
ALTER TABLE public.notas_fiscais DROP CONSTRAINT IF EXISTS notas_fiscais_status_check;
ALTER TABLE public.notas_fiscais ADD CONSTRAINT notas_fiscais_status_check
  CHECK (status IN (
    'pendente','emitida','cancelada','substituida','erro',
    'PENDENTE','EMITIDA','CANCELADA','SUBSTITUIDA','PROCESSANDO','REJEITADA','ERRO'
  ));

-- 5. Adicionar coluna data_emissao se não existir
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS data_emissao DATE DEFAULT CURRENT_DATE;

-- 6. Adicionar coluna outras_retencoes se não existir
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS outras_retencoes NUMERIC(15,2) NOT NULL DEFAULT 0;

-- 7. Adicionar coluna tomador_id para referência ao cadastro de tomadores
ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS tomador_id UUID REFERENCES public.tomadores(id);

-- 8. RLS policies para as novas tabelas
CREATE POLICY "certificados_empresa_policy" ON public.certificados
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis_usuarios
      WHERE user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "tomadores_empresa_policy" ON public.tomadores
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis_usuarios
      WHERE user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "eventos_nota_policy" ON public.eventos_nota
  FOR ALL USING (
    nota_id IN (
      SELECT nf.id FROM public.notas_fiscais nf
      JOIN public.perfis_usuarios pu ON pu.empresa_id = nf.empresa_id
      WHERE pu.user_id = auth.uid() AND pu.ativo = true
    )
  );
