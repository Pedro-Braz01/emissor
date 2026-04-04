-- ============================================================
-- Migration 002: Adicionar coluna cnaes_cadastrados na tabela empresas
-- Armazena os CNAEs cadastrados pela empresa (do cartão CNPJ)
-- Formato: [{"codigo": "6920601", "descricao": "Atividades de contabilidade", "padrao": true}, ...]
-- ============================================================

ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS cnaes_cadastrados JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.empresas.cnaes_cadastrados IS 'CNAEs cadastrados da empresa (principal + secundários do cartão CNPJ). Um pode ser marcado como padrão.';
