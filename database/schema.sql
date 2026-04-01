-- ============================================================================
-- EMISSOR NFSe - RIBEIRÃO PRETO
-- Schema PostgreSQL para Supabase
-- Versão: 2.0 - Produção
-- ============================================================================

-- ===================
-- EXTENSÕES
-- ===================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===================
-- ENUMS
-- ===================

-- Regimes tributários
CREATE TYPE regime_tributario AS ENUM (
    'SIMPLES_NACIONAL',
    'LUCRO_PRESUMIDO',
    'LUCRO_REAL',
    'MEI'
);

-- Status da nota fiscal
CREATE TYPE status_nota AS ENUM (
    'RASCUNHO',
    'AGUARDANDO',
    'PROCESSANDO',
    'EMITIDA',
    'REJEITADA',
    'CANCELADA',
    'SUBSTITUIDA'
);

-- Roles de usuário
CREATE TYPE user_role AS ENUM (
    'MASTER',      -- Dono do sistema (você)
    'ADMIN',       -- Admin do cliente
    'GERENTE',     -- Gerente
    'OPERADOR',    -- Emite notas
    'CONTADOR',    -- Só visualiza
    'VISUALIZADOR' -- Só lê
);

-- Status da licença
CREATE TYPE status_licenca AS ENUM (
    'TRIAL',
    'ATIVO',
    'SUSPENSO',
    'BLOQUEADO',
    'CANCELADO'
);

-- ===================
-- TABELAS
-- ===================

-- TENANTS (Clientes que pagam para usar)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identificação
    cnpj VARCHAR(14) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    -- Contato
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    responsavel VARCHAR(255),
    
    -- Plano
    plano VARCHAR(50) DEFAULT 'BASICO',
    max_empresas INTEGER DEFAULT 1,
    max_usuarios INTEGER DEFAULT 3,
    max_notas_mes INTEGER DEFAULT 100,
    
    -- Contadores (atualizados automaticamente)
    empresas_ativas INTEGER DEFAULT 0,
    usuarios_ativos INTEGER DEFAULT 0,
    notas_mes_atual INTEGER DEFAULT 0,
    
    -- Status
    ativo BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_cnpj ON tenants(cnpj);
CREATE INDEX idx_tenants_slug ON tenants(slug);

-- LICENÇAS (Controle de pagamento)
CREATE TABLE licencas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Status
    status status_licenca DEFAULT 'TRIAL',
    license_active BOOLEAN DEFAULT TRUE,
    
    -- Chave única (para verificação externa)
    license_key VARCHAR(64) UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    
    -- Datas
    trial_inicio DATE DEFAULT CURRENT_DATE,
    trial_fim DATE DEFAULT (CURRENT_DATE + INTERVAL '15 days'),
    validade DATE,
    
    -- Bloqueio
    blocked_at TIMESTAMPTZ,
    blocked_reason TEXT,
    
    -- Verificação
    last_check_at TIMESTAMPTZ,
    
    -- Integração futura com Stripe
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id)
);

-- USUÁRIOS
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Auth (link com Supabase Auth)
    auth_user_id UUID UNIQUE,
    
    -- Dados
    email VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    
    -- Permissões
    role user_role DEFAULT 'OPERADOR',
    empresas_permitidas UUID[] DEFAULT '{}',
    
    -- Status
    ativo BOOLEAN DEFAULT TRUE,
    ultimo_login TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_usuarios_tenant ON usuarios(tenant_id);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_auth ON usuarios(auth_user_id);

-- EMPRESAS (Prestadores de serviço)
CREATE TABLE empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identificação
    cnpj VARCHAR(14) NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    inscricao_municipal VARCHAR(15) NOT NULL,
    inscricao_estadual VARCHAR(20),
    
    -- Localização
    codigo_municipio VARCHAR(7) DEFAULT '3543402', -- Ribeirão Preto
    uf VARCHAR(2) DEFAULT 'SP',
    
    -- Endereço
    logradouro VARCHAR(255),
    numero VARCHAR(20),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cep VARCHAR(8),
    
    -- Contato
    telefone VARCHAR(20),
    email VARCHAR(255),
    email_contador VARCHAR(255),
    
    -- NFSe
    ambiente VARCHAR(20) DEFAULT 'HOMOLOGACAO', -- HOMOLOGACAO ou PRODUCAO
    serie_rps VARCHAR(5) DEFAULT '8', -- 8 para homolog, 1 para prod
    proximo_numero_rps BIGINT DEFAULT 1,
    
    -- Tributação
    regime_tributario regime_tributario DEFAULT 'SIMPLES_NACIONAL',
    optante_simples BOOLEAN DEFAULT TRUE,
    regime_especial INTEGER DEFAULT 6,
    incentivo_fiscal BOOLEAN DEFAULT FALSE,
    
    -- Alíquotas
    aliquota_iss DECIMAL(5,4) DEFAULT 0.05,
    aliquota_pis DECIMAL(5,4) DEFAULT 0.0065,
    aliquota_cofins DECIMAL(5,4) DEFAULT 0.03,
    aliquota_csll DECIMAL(5,4) DEFAULT 0.0,
    aliquota_irrf DECIMAL(5,4) DEFAULT 0.0,
    
    -- Classificação fiscal padrão
    item_lista_servico VARCHAR(5) DEFAULT '01.07',
    codigo_cnae VARCHAR(7),
    
    -- Status
    ativo BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES usuarios(id),
    
    UNIQUE(tenant_id, cnpj)
);

CREATE INDEX idx_empresas_tenant ON empresas(tenant_id);
CREATE INDEX idx_empresas_cnpj ON empresas(cnpj);

-- CERTIFICADOS DIGITAIS
CREATE TABLE certificados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    
    -- Dados criptografados
    pfx_data BYTEA NOT NULL,
    pfx_password_encrypted TEXT NOT NULL,
    
    -- Metadados
    nome_arquivo VARCHAR(255),
    thumbprint VARCHAR(64),
    subject VARCHAR(500),
    validade DATE NOT NULL,
    
    -- Status
    ativo BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_certificados_empresa ON certificados(empresa_id);

-- TOMADORES
CREATE TABLE tomadores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    
    -- Identificação
    cpf_cnpj VARCHAR(14) NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    inscricao_municipal VARCHAR(15),
    
    -- Endereço
    logradouro VARCHAR(255),
    numero VARCHAR(20),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cep VARCHAR(8),
    codigo_municipio VARCHAR(7),
    uf VARCHAR(2),
    
    -- Contato
    email VARCHAR(255),
    telefone VARCHAR(20),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(empresa_id, cpf_cnpj)
);

CREATE INDEX idx_tomadores_empresa ON tomadores(empresa_id);

-- NOTAS FISCAIS
CREATE TABLE notas_fiscais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id),
    tomador_id UUID REFERENCES tomadores(id),
    
    -- Identificação NFSe
    numero_nfse BIGINT,
    codigo_verificacao VARCHAR(20),
    link_nfse TEXT,
    
    -- Identificação RPS
    numero_rps BIGINT NOT NULL,
    serie_rps VARCHAR(5) NOT NULL,
    tipo_rps INTEGER DEFAULT 1,
    
    -- Datas
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    competencia DATE NOT NULL DEFAULT CURRENT_DATE,
    emitida_em TIMESTAMPTZ,
    
    -- Status
    status status_nota DEFAULT 'RASCUNHO',
    
    -- Valores
    valor_servicos DECIMAL(15,2) NOT NULL,
    valor_deducoes DECIMAL(15,2) DEFAULT 0,
    valor_pis DECIMAL(15,2) DEFAULT 0,
    valor_cofins DECIMAL(15,2) DEFAULT 0,
    valor_inss DECIMAL(15,2) DEFAULT 0,
    valor_ir DECIMAL(15,2) DEFAULT 0,
    valor_csll DECIMAL(15,2) DEFAULT 0,
    outras_retencoes DECIMAL(15,2) DEFAULT 0,
    valor_iss DECIMAL(15,2) DEFAULT 0,
    aliquota_iss DECIMAL(5,4),
    desconto_incondicionado DECIMAL(15,2) DEFAULT 0,
    desconto_condicionado DECIMAL(15,2) DEFAULT 0,
    
    -- Campos calculados
    base_calculo DECIMAL(15,2) GENERATED ALWAYS AS (
        valor_servicos - valor_deducoes - desconto_incondicionado
    ) STORED,
    valor_liquido DECIMAL(15,2) GENERATED ALWAYS AS (
        valor_servicos - valor_deducoes - valor_pis - valor_cofins - 
        valor_inss - valor_ir - valor_csll - outras_retencoes -
        CASE WHEN iss_retido THEN valor_iss ELSE 0 END
    ) STORED,
    
    -- ISS
    iss_retido BOOLEAN DEFAULT FALSE,
    responsavel_retencao INTEGER,
    
    -- Serviço
    item_lista_servico VARCHAR(5),
    codigo_cnae VARCHAR(7),
    codigo_tributacao_municipal VARCHAR(20),
    discriminacao TEXT NOT NULL,
    
    -- Local
    codigo_municipio_prestacao VARCHAR(7) DEFAULT '3543402',
    codigo_municipio_incidencia VARCHAR(7) DEFAULT '3543402',
    
    -- Exigibilidade
    exigibilidade_iss INTEGER DEFAULT 1,
    
    -- XMLs
    xml_envio TEXT,
    xml_retorno TEXT,
    
    -- Cancelamento
    motivo_cancelamento TEXT,
    cancelada_em TIMESTAMPTZ,
    
    -- Substituição
    nota_substituida_id UUID REFERENCES notas_fiscais(id),
    
    -- AUDITORIA
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES usuarios(id),
    created_by_nome VARCHAR(255),
    created_by_ip VARCHAR(45),
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(empresa_id, numero_rps, serie_rps)
);

CREATE INDEX idx_notas_empresa ON notas_fiscais(empresa_id);
CREATE INDEX idx_notas_status ON notas_fiscais(status);
CREATE INDEX idx_notas_data ON notas_fiscais(data_emissao);
CREATE INDEX idx_notas_created_by ON notas_fiscais(created_by);
CREATE INDEX idx_notas_numero_nfse ON notas_fiscais(numero_nfse);

-- EVENTOS (Log de cada operação)
CREATE TABLE eventos_nota (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_id UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
    
    tipo VARCHAR(50) NOT NULL, -- EMISSAO, CANCELAMENTO, CONSULTA, etc
    sucesso BOOLEAN DEFAULT FALSE,
    codigo_retorno VARCHAR(10),
    mensagem TEXT,
    
    xml_envio TEXT,
    xml_retorno TEXT,
    
    ip_origem VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_eventos_nota ON eventos_nota(nota_id);

-- AUDIT LOG
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    tenant_id UUID REFERENCES tenants(id),
    usuario_id UUID REFERENCES usuarios(id),
    usuario_nome VARCHAR(255),
    usuario_email VARCHAR(255),
    
    tabela VARCHAR(100) NOT NULL,
    registro_id UUID,
    acao VARCHAR(50) NOT NULL,
    
    dados_antigos JSONB,
    dados_novos JSONB,
    
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    severidade VARCHAR(20) DEFAULT 'INFO',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_usuario ON audit_logs(usuario_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- LOGIN HISTORY
CREATE TABLE login_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES usuarios(id),
    email VARCHAR(255) NOT NULL,
    sucesso BOOLEAN NOT NULL,
    motivo_falha TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_login_usuario ON login_history(usuario_id);
CREATE INDEX idx_login_ip ON login_history(ip_address);

-- ===================
-- FUNÇÕES
-- ===================

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica trigger em todas as tabelas com updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON %s
                FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- Obtém tenant do usuário atual
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT tenant_id 
        FROM usuarios 
        WHERE auth_user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Obtém ID do usuário atual
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT id 
        FROM usuarios 
        WHERE auth_user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Verifica se licença está ativa
CREATE OR REPLACE FUNCTION is_license_active(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_licenca licencas%ROWTYPE;
BEGIN
    SELECT * INTO v_licenca
    FROM licencas
    WHERE tenant_id = p_tenant_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Verifica status
    IF v_licenca.status IN ('BLOQUEADO', 'CANCELADO', 'SUSPENSO') THEN
        RETURN FALSE;
    END IF;
    
    -- Verifica se está ativa
    IF NOT v_licenca.license_active THEN
        RETURN FALSE;
    END IF;
    
    -- Verifica validade
    IF v_licenca.validade IS NOT NULL AND v_licenca.validade < CURRENT_DATE THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Obtém próximo número de RPS
CREATE OR REPLACE FUNCTION get_next_rps_number(p_empresa_id UUID)
RETURNS BIGINT AS $$
DECLARE
    v_next BIGINT;
BEGIN
    UPDATE empresas
    SET proximo_numero_rps = proximo_numero_rps + 1
    WHERE id = p_empresa_id
    RETURNING proximo_numero_rps - 1 INTO v_next;
    
    RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE licencas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE tomadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_nota ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

-- Policies para TENANTS
CREATE POLICY "tenants_select" ON tenants FOR SELECT
    USING (id = get_current_tenant_id());

-- Policies para LICENÇAS
CREATE POLICY "licencas_select" ON licencas FOR SELECT
    USING (tenant_id = get_current_tenant_id());

-- Policies para USUÁRIOS
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT
    USING (tenant_id = get_current_tenant_id());

CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT
    WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE
    USING (tenant_id = get_current_tenant_id());

-- Policies para EMPRESAS
CREATE POLICY "empresas_all" ON empresas FOR ALL
    USING (tenant_id = get_current_tenant_id());

-- Policies para CERTIFICADOS
CREATE POLICY "certificados_all" ON certificados FOR ALL
    USING (EXISTS (
        SELECT 1 FROM empresas 
        WHERE empresas.id = certificados.empresa_id
        AND empresas.tenant_id = get_current_tenant_id()
    ));

-- Policies para TOMADORES
CREATE POLICY "tomadores_all" ON tomadores FOR ALL
    USING (EXISTS (
        SELECT 1 FROM empresas 
        WHERE empresas.id = tomadores.empresa_id
        AND empresas.tenant_id = get_current_tenant_id()
    ));

-- Policies para NOTAS FISCAIS
CREATE POLICY "notas_select" ON notas_fiscais FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM empresas 
        WHERE empresas.id = notas_fiscais.empresa_id
        AND empresas.tenant_id = get_current_tenant_id()
    ));

CREATE POLICY "notas_insert" ON notas_fiscais FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM empresas 
            WHERE empresas.id = notas_fiscais.empresa_id
            AND empresas.tenant_id = get_current_tenant_id()
        )
        AND is_license_active(get_current_tenant_id())
    );

CREATE POLICY "notas_update" ON notas_fiscais FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM empresas 
        WHERE empresas.id = notas_fiscais.empresa_id
        AND empresas.tenant_id = get_current_tenant_id()
    ));

-- Policies para EVENTOS
CREATE POLICY "eventos_all" ON eventos_nota FOR ALL
    USING (EXISTS (
        SELECT 1 FROM notas_fiscais n
        JOIN empresas e ON e.id = n.empresa_id
        WHERE n.id = eventos_nota.nota_id
        AND e.tenant_id = get_current_tenant_id()
    ));

-- Policies para AUDIT
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
    USING (tenant_id = get_current_tenant_id());

CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Policies para LOGIN HISTORY
CREATE POLICY "login_select" ON login_history FOR SELECT
    USING (usuario_id IN (
        SELECT id FROM usuarios WHERE tenant_id = get_current_tenant_id()
    ));

-- ===================
-- DADOS INICIAIS
-- ===================

-- Insere configuração inicial (você como MASTER)
-- IMPORTANTE: Execute isso DEPOIS de criar seu usuário no Supabase Auth

/*
-- Descomente e execute manualmente após criar usuário no Auth:

INSERT INTO tenants (cnpj, nome, slug, email, plano, max_empresas, max_usuarios, max_notas_mes)
VALUES ('00000000000000', 'Master Admin', 'master', 'seu@email.com', 'ENTERPRISE', 999, 999, 999999);

INSERT INTO licencas (tenant_id, status, license_active, validade)
SELECT id, 'ATIVO', true, '2099-12-31' FROM tenants WHERE slug = 'master';

-- Depois de criar usuário no Auth, execute:
INSERT INTO usuarios (tenant_id, auth_user_id, email, nome, role)
SELECT 
    t.id,
    (SELECT id FROM auth.users WHERE email = 'seu@email.com'),
    'seu@email.com',
    'Seu Nome',
    'MASTER'
FROM tenants t WHERE t.slug = 'master';
*/

-- ===================
-- COMENTÁRIOS
-- ===================

COMMENT ON TABLE tenants IS 'Empresas clientes que pagam para usar o sistema';
COMMENT ON TABLE licencas IS 'Controle de licenciamento e pagamento';
COMMENT ON TABLE usuarios IS 'Usuários do sistema com suas permissões';
COMMENT ON TABLE empresas IS 'Prestadores de serviço que emitem NFSe';
COMMENT ON TABLE certificados IS 'Certificados digitais A1 criptografados';
COMMENT ON TABLE tomadores IS 'Clientes dos prestadores';
COMMENT ON TABLE notas_fiscais IS 'Notas fiscais emitidas';
COMMENT ON TABLE eventos_nota IS 'Log de operações em cada nota';
COMMENT ON TABLE audit_logs IS 'Auditoria completa do sistema';
COMMENT ON COLUMN notas_fiscais.created_by IS 'Usuário que emitiu a nota';
COMMENT ON COLUMN notas_fiscais.created_by_nome IS 'Nome do usuário (para histórico)';
