#!/bin/bash

echo "============================================"
echo "  NFSE EMISSOR - RIBEIRAO PRETO"
echo "  Setup Inicial"
echo "============================================"
echo

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Verifica Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERRO] Node.js não encontrado!${NC}"
    echo
    echo "Por favor, instale o Node.js:"
    echo "https://nodejs.org/pt-br/"
    echo
    exit 1
fi

echo -e "${GREEN}[OK] Node.js encontrado:${NC} $(node --version)"
echo

# Entra na pasta do portal
cd portal

# Instala dependências
echo "[INFO] Instalando dependências..."
echo
npm install

if [ $? -ne 0 ]; then
    echo
    echo -e "${RED}[ERRO] Falha ao instalar dependências!${NC}"
    exit 1
fi

# Copia .env.example se não existir .env.local
if [ ! -f .env.local ]; then
    if [ -f .env.example ]; then
        cp .env.example .env.local
        echo -e "${GREEN}[OK] Arquivo .env.local criado${NC}"
    fi
fi

echo
echo "============================================"
echo -e "${GREEN}  INSTALAÇÃO CONCLUÍDA!${NC}"
echo "============================================"
echo
echo "Próximos passos:"
echo
echo "1. Edite portal/.env.local com suas credenciais do Supabase"
echo
echo "2. Execute: cd portal && npm run dev"
echo
echo "3. Acesse: http://localhost:3000"
echo
