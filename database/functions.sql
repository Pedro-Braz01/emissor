-- ============================================================================
-- FUNÇÕES ADICIONAIS PARA O SUPABASE
-- Execute este arquivo DEPOIS do schema.sql principal
-- ============================================================================

-- Função para incrementar contador de notas do mês
CREATE OR REPLACE FUNCTION incrementar_notas_mes(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE tenants
    SET notas_mes_atual = notas_mes_atual + 1
    WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para resetar contadores mensais (execute no início de cada mês)
CREATE OR REPLACE FUNCTION reset_contadores_mensais()
RETURNS void AS $$
BEGIN
    UPDATE tenants SET notas_mes_atual = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Agendamento do reset (requer pg_cron extension no Supabase)
-- Descomente se você habilitou pg_cron:
-- SELECT cron.schedule('reset-contadores', '0 0 1 * *', 'SELECT reset_contadores_mensais()');

-- Função para verificar se pode emitir (útil para RLS)
CREATE OR REPLACE FUNCTION pode_emitir(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_tenant tenants%ROWTYPE;
    v_licenca licencas%ROWTYPE;
BEGIN
    -- Busca tenant
    SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
    IF NOT FOUND OR NOT v_tenant.ativo THEN
        RETURN FALSE;
    END IF;
    
    -- Busca licença
    SELECT * INTO v_licenca FROM licencas WHERE tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Verifica status
    IF v_licenca.status IN ('BLOQUEADO', 'CANCELADO', 'SUSPENSO') THEN
        RETURN FALSE;
    END IF;
    
    IF NOT v_licenca.license_active THEN
        RETURN FALSE;
    END IF;
    
    -- Verifica validade
    IF v_licenca.status = 'TRIAL' AND v_licenca.trial_fim < CURRENT_DATE THEN
        RETURN FALSE;
    END IF;
    
    IF v_licenca.validade IS NOT NULL AND v_licenca.validade < CURRENT_DATE THEN
        RETURN FALSE;
    END IF;
    
    -- Verifica limite de notas
    IF v_tenant.notas_mes_atual >= v_tenant.max_notas_mes THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Trigger para atualizar contador de empresas
CREATE OR REPLACE FUNCTION update_empresas_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tenants SET empresas_ativas = empresas_ativas + 1 
        WHERE id = NEW.tenant_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tenants SET empresas_ativas = empresas_ativas - 1 
        WHERE id = OLD.tenant_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.ativo != NEW.ativo THEN
        IF NEW.ativo THEN
            UPDATE tenants SET empresas_ativas = empresas_ativas + 1 
            WHERE id = NEW.tenant_id;
        ELSE
            UPDATE tenants SET empresas_ativas = empresas_ativas - 1 
            WHERE id = NEW.tenant_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_empresas_count ON empresas;
CREATE TRIGGER trg_update_empresas_count
    AFTER INSERT OR UPDATE OR DELETE ON empresas
    FOR EACH ROW EXECUTE FUNCTION update_empresas_count();

-- Trigger para atualizar contador de usuários
CREATE OR REPLACE FUNCTION update_usuarios_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tenants SET usuarios_ativos = usuarios_ativos + 1 
        WHERE id = NEW.tenant_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tenants SET usuarios_ativos = usuarios_ativos - 1 
        WHERE id = OLD.tenant_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.ativo != NEW.ativo THEN
        IF NEW.ativo THEN
            UPDATE tenants SET usuarios_ativos = usuarios_ativos + 1 
            WHERE id = NEW.tenant_id;
        ELSE
            UPDATE tenants SET usuarios_ativos = usuarios_ativos - 1 
            WHERE id = NEW.tenant_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_usuarios_count ON usuarios;
CREATE TRIGGER trg_update_usuarios_count
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_usuarios_count();

-- ============================================================================
-- DADOS INICIAIS DE EXEMPLO
-- ============================================================================

-- Descomente e ajuste para criar seu usuário master:

/*
-- 1. Primeiro, crie um usuário no Supabase Authentication (Dashboard > Authentication > Users)

-- 2. Depois execute isso substituindo os valores:

INSERT INTO tenants (cnpj, nome, slug, email, plano, max_empresas, max_usuarios, max_notas_mes)
VALUES (
    '00000000000000',           -- Seu CNPJ
    'Sua Software House',        -- Nome da sua empresa
    'master',                    -- Slug único
    'seu@email.com',             -- Seu email
    'ENTERPRISE',                -- Plano (BASICO, PRO, ENTERPRISE)
    999,                         -- Max empresas
    999,                         -- Max usuários
    999999                       -- Max notas/mês
);

INSERT INTO licencas (tenant_id, status, license_active, validade)
SELECT id, 'ATIVO', true, '2099-12-31'
FROM tenants WHERE slug = 'master';

-- 3. Pega o UUID do usuário que você criou no Auth e substitua abaixo:

INSERT INTO usuarios (tenant_id, auth_user_id, email, nome, role)
SELECT 
    t.id,
    'UUID-DO-SEU-USUARIO-AUTH',  -- Substitua pelo UUID real
    'seu@email.com',
    'Seu Nome',
    'MASTER'
FROM tenants t WHERE t.slug = 'master';

-- 4. Crie uma empresa de exemplo:

INSERT INTO empresas (
    tenant_id, cnpj, razao_social, inscricao_municipal, 
    ambiente, serie_rps, regime_tributario
)
SELECT 
    t.id,
    '12345678000190',
    'Empresa Teste LTDA',
    '123456',
    'HOMOLOGACAO',
    '8',
    'SIMPLES_NACIONAL'
FROM tenants t WHERE t.slug = 'master';
*/
