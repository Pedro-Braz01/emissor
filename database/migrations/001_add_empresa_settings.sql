-- ============================================================
-- Migration 001: Adiciona campos para configurações da empresa
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adiciona coluna user_id se não existir (necessária para vincular empresa ao usuário)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Campos de certificado digital e toggles de email
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS certificado_digital_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS certificado_senha_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS envio_auto_contador BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envio_auto_emissor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS envio_auto_tomador BOOLEAN NOT NULL DEFAULT false;

-- 3. Campos extras nas notas fiscais
ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS tomador_telefone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tomador_endereco TEXT,
  ADD COLUMN IF NOT EXISTS enviar_para_tomador BOOLEAN NOT NULL DEFAULT false;

-- 4. Habilita RLS em todas as tabelas (idempotente)
ALTER TABLE public.empresas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_tributarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;

-- 5. Policies para empresas (só cria se não existir)
-- SELECT: usuário vê sua própria empresa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'empresa_select_own' AND tablename = 'empresas') THEN
    EXECUTE 'CREATE POLICY empresa_select_own ON public.empresas FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- INSERT: usuário cria empresa para si mesmo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'empresa_insert_own' AND tablename = 'empresas') THEN
    EXECUTE 'CREATE POLICY empresa_insert_own ON public.empresas FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- UPDATE: usuário atualiza sua própria empresa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'empresa_update_own' AND tablename = 'empresas') THEN
    EXECUTE 'CREATE POLICY empresa_update_own ON public.empresas FOR UPDATE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- 6. Policies para licenças
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'licenca_select_own' AND tablename = 'licencas') THEN
    EXECUTE 'CREATE POLICY licenca_select_own ON public.licencas FOR SELECT USING (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'licenca_insert_own' AND tablename = 'licencas') THEN
    EXECUTE 'CREATE POLICY licenca_insert_own ON public.licencas FOR INSERT WITH CHECK (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

-- 7. Policies para configurações tributárias
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'config_select_own' AND tablename = 'configuracoes_tributarias') THEN
    EXECUTE 'CREATE POLICY config_select_own ON public.configuracoes_tributarias FOR SELECT USING (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'config_insert_own' AND tablename = 'configuracoes_tributarias') THEN
    EXECUTE 'CREATE POLICY config_insert_own ON public.configuracoes_tributarias FOR INSERT WITH CHECK (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'config_update_own' AND tablename = 'configuracoes_tributarias') THEN
    EXECUTE 'CREATE POLICY config_update_own ON public.configuracoes_tributarias FOR UPDATE USING (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

-- 8. Policies para notas fiscais
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notas_select_own' AND tablename = 'notas_fiscais') THEN
    EXECUTE 'CREATE POLICY notas_select_own ON public.notas_fiscais FOR SELECT USING (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notas_insert_own' AND tablename = 'notas_fiscais') THEN
    EXECUTE 'CREATE POLICY notas_insert_own ON public.notas_fiscais FOR INSERT WITH CHECK (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notas_update_own' AND tablename = 'notas_fiscais') THEN
    EXECUTE 'CREATE POLICY notas_update_own ON public.notas_fiscais FOR UPDATE USING (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;

-- 9. Policies para audit_logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_select_own' AND tablename = 'audit_logs') THEN
    EXECUTE 'CREATE POLICY audit_select_own ON public.audit_logs FOR SELECT USING (empresa_id IN (SELECT id FROM public.empresas WHERE user_id = auth.uid()))';
  END IF;
END $$;
