# 📘 GUIA COMPLETO - Emissor NFSe Ribeirão Preto

## 🎯 O que é este sistema?

Este é um sistema para **emitir Notas Fiscais de Serviço Eletrônicas (NFSe)** para a cidade de Ribeirão Preto, SP. Ele permite que você:

- ✅ Emita notas fiscais para seus clientes
- ✅ Gerencie múltiplas empresas
- ✅ Controle quem pode usar o sistema (licenças)
- ✅ Venda o serviço para outras empresas
- ✅ Bloqueie clientes que não pagaram

---

# 📋 ÍNDICE

1. [Para Iniciantes (nunca programou)](#parte-1-para-iniciantes)
2. [Para Intermediários](#parte-2-para-intermediários)
3. [Para Desenvolvedores](#parte-3-para-desenvolvedores)
4. [Gerenciamento de Licenças](#parte-4-gerenciamento-de-licenças)
5. [Solução de Problemas](#parte-5-solução-de-problemas)

---

# PARTE 1: PARA INICIANTES

## 📱 O que você precisa ter antes de começar

### Coisas OBRIGATÓRIAS:
1. **Computador** (Windows 10/11, Mac ou Linux)
2. **Internet** estável
3. **Certificado Digital A1** (arquivo .pfx) - você compra em certificadoras como Serasa, Certisign, etc
4. **Cadastro na Prefeitura** de Ribeirão Preto para emitir notas

### Contas GRATUITAS que você vai criar:
1. **Conta no Supabase** (banco de dados) - [supabase.com](https://supabase.com)
2. **Conta no Vercel** (hospedagem) - [vercel.com](https://vercel.com)
3. **Conta no GitHub** (código) - [github.com](https://github.com)

---

## 🔧 Passo 1: Instalar programas no seu computador

### 1.1 Instalar Node.js (necessário para o sistema)

1. Acesse: https://nodejs.org/pt-br/
2. Clique no botão verde grande "LTS" (versão estável)
3. Baixe e execute o instalador
4. Clique em "Next" em tudo até terminar

**Para verificar se instalou certo:**
1. Aperte `Windows + R`
2. Digite `cmd` e aperte Enter
3. Digite: `node --version`
4. Deve aparecer algo como `v20.10.0`

### 1.2 Instalar Git (para baixar o código)

1. Acesse: https://git-scm.com/download/win
2. Baixe e instale (pode clicar Next em tudo)

### 1.3 Instalar Visual Studio Code (para editar arquivos)

1. Acesse: https://code.visualstudio.com/
2. Baixe e instale

---

## 🌐 Passo 2: Criar conta no Supabase (seu banco de dados)

O Supabase é onde ficam guardados todos os dados das notas, clientes, etc.

### 2.1 Criar a conta

1. Acesse: https://supabase.com
2. Clique em **"Start your project"**
3. Faça login com sua conta do GitHub (ou crie uma)

### 2.2 Criar um novo projeto

1. Clique em **"New Project"**
2. Preencha:
   - **Name**: `nfse-ribeirao`
   - **Database Password**: crie uma senha forte e **ANOTE ELA**
   - **Region**: `South America (São Paulo)`
3. Clique em **"Create new project"**
4. Aguarde 2-3 minutos

### 2.3 Configurar o banco de dados

1. No menu lateral, clique em **"SQL Editor"**
2. Clique em **"New Query"**
3. Copie TODO o conteúdo do arquivo `database/schema.sql` (está neste projeto)
4. Cole na área de texto
5. Clique em **"Run"** (botão verde)
6. Deve aparecer "Success" embaixo

### 2.4 Anotar as credenciais

1. No menu lateral, clique em **"Settings"** (ícone de engrenagem)
2. Clique em **"API"**
3. Anote estes valores (você vai precisar):
   - **Project URL**: algo como `https://xxxx.supabase.co`
   - **anon public**: uma chave longa começando com `eyJ...`
   - **service_role**: outra chave (mais secreta)

---

## 🚀 Passo 3: Colocar o sistema no ar (Vercel)

### 3.1 Criar conta no Vercel

1. Acesse: https://vercel.com
2. Clique em **"Sign Up"**
3. Escolha **"Continue with GitHub"**

### 3.2 Subir o código para o GitHub

1. Crie uma conta no GitHub: https://github.com
2. Crie um novo repositório chamado `nfse-emissor`
3. No seu computador, abra o terminal na pasta do projeto
4. Execute:
```bash
git init
git add .
git commit -m "primeiro commit"
git remote add origin https://github.com/SEU-USUARIO/nfse-emissor.git
git push -u origin main
```

### 3.3 Conectar Vercel ao GitHub

1. Na Vercel, clique em **"Add New"** → **"Project"**
2. Selecione seu repositório `nfse-emissor`
3. Em **"Root Directory"**, coloque: `portal`
4. Em **"Environment Variables"**, adicione:

| Nome | Valor |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | (cole o Project URL do Supabase) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (cole a anon key) |
| `SUPABASE_SERVICE_KEY` | (cole a service_role key) |

5. Clique em **"Deploy"**
6. Aguarde 2-3 minutos
7. Você terá um link tipo: `https://nfse-emissor.vercel.app`

---

## 👤 Passo 4: Criar seu primeiro usuário

### 4.1 Criar o usuário admin no Supabase

1. No Supabase, vá em **"Authentication"** → **"Users"**
2. Clique em **"Add user"** → **"Create new user"**
3. Preencha seu email e senha
4. Clique em **"Create user"**

### 4.2 Vincular ao sistema

1. Vá em **"SQL Editor"**
2. Execute:
```sql
-- Substitua pelos seus dados reais
INSERT INTO tenants (nome, cnpj, slug, plano) VALUES
('Sua Software House', '00000000000000', 'sua-empresa', 'ENTERPRISE');

INSERT INTO licencas (tenant_id, license_active, validade) 
SELECT id, true, '2099-12-31' FROM tenants WHERE slug = 'sua-empresa';

INSERT INTO usuarios (tenant_id, auth_user_id, email, nome, role)
SELECT 
    t.id,
    (SELECT id FROM auth.users WHERE email = 'seu@email.com'),
    'seu@email.com',
    'Seu Nome',
    'MASTER'
FROM tenants t WHERE t.slug = 'sua-empresa';
```

---

## 🔑 Passo 5: Acessar o sistema

1. Abra o link da Vercel no navegador
2. Faça login com o email e senha que você criou
3. Pronto! Você está no sistema!

---

## 📜 Passo 6: Cadastrar seu certificado digital

1. No sistema, vá em **"Configurações"** → **"Certificado"**
2. Clique em **"Fazer upload"**
3. Selecione seu arquivo `.pfx`
4. Digite a senha do certificado
5. Clique em **"Salvar"**

---

## ✅ Passo 7: Testar uma emissão

### Modo Homologação (teste - não vale de verdade)

1. Vá em **"Emitir NFSe"**
2. Preencha os dados:
   - **CNPJ Tomador**: 11.111.111/0001-91 (teste)
   - **Razão Social**: Empresa Teste
   - **Valor**: 100,00
   - **Discriminação**: Serviço de teste
3. Clique em **"Emitir"**
4. Se aparecer o número da nota, funcionou!

---

# PARTE 2: PARA INTERMEDIÁRIOS

## 🏗️ Arquitetura do Sistema

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Vercel      │────▶│    Supabase     │◀────│  WebService     │
│   (Frontend)    │     │   (Database)    │     │  Prefeitura     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   Seu Cliente   │     │  Google Sheets  │
│   (Navegador)   │     │   (Licenças)    │
└─────────────────┘     └─────────────────┘
```

## 📁 Estrutura de Pastas

```
nfse-emissor/
├── portal/                 # Frontend Next.js
│   ├── src/
│   │   ├── app/           # Páginas
│   │   ├── components/    # Componentes React
│   │   ├── lib/           # Utilitários
│   │   └── services/      # Lógica de negócio
│   └── package.json
│
├── database/
│   └── schema.sql         # Estrutura do banco
│
├── docs/
│   └── *.md              # Documentação
│
└── scripts/
    └── *.sh              # Scripts de automação
```

## 🔄 Fluxo de Emissão

1. **Usuário preenche** formulário no portal
2. **Portal valida** os dados localmente
3. **Verifica licença** no banco de dados
4. **Monta XML** no padrão ABRASF 2.04
5. **Assina XML** com certificado digital
6. **Envia para prefeitura** via SOAP
7. **Processa retorno** (sucesso ou erro)
8. **Salva no banco** com auditoria
9. **Retorna para usuário**

---

# PARTE 3: PARA DESENVOLVEDORES

## 🛠️ Setup Local de Desenvolvimento

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/nfse-emissor.git
cd nfse-emissor

# Instale dependências do portal
cd portal
npm install

# Copie o arquivo de ambiente
cp .env.example .env.local

# Edite o .env.local com suas credenciais

# Rode o servidor de desenvolvimento
npm run dev

# Acesse http://localhost:3000
```

## 📝 Variáveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# Certificado (chave para criptografar certificados no banco)
CERTIFICATE_ENCRYPTION_KEY=gerar-com-openssl-rand-hex-32

# NFSe
NFSE_AMBIENTE=homologacao  # ou producao

# Email (opcional)
RESEND_API_KEY=re_xxx
```

## 🔗 Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/nfse/emitir` | Emitir nova NFSe |
| POST | `/api/nfse/cancelar` | Cancelar NFSe |
| GET | `/api/nfse/consultar` | Consultar notas |
| POST | `/api/auth/login` | Login |
| POST | `/api/licenca/verificar` | Verificar licença |

## 🧪 Testes

```bash
# Testes unitários
npm test

# Testes de integração
npm run test:integration

# Teste de emissão real (homologação)
npm run test:emissao
```

---

# PARTE 4: GERENCIAMENTO DE LICENÇAS

## 📊 Sistema de Licenças via Google Sheets

### Por que Google Sheets?
- ✅ Gratuito
- ✅ Você já sabe usar
- ✅ Pode editar do celular
- ✅ Não precisa de programação
- ✅ Funciona como banco de dados simples

### Configurar a Planilha de Licenças

1. Acesse: https://sheets.google.com
2. Crie uma nova planilha chamada: `NFSe - Controle de Licenças`
3. Crie estas colunas:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| CNPJ | Empresa | Email | Plano | Valor | Vencimento | Status |
| 12.345.678/0001-90 | Empresa ABC | contato@abc.com | BASICO | R$ 99 | 2024-02-15 | ATIVO |
| 98.765.432/0001-10 | Empresa XYZ | xyz@email.com | PRO | R$ 199 | 2024-01-20 | BLOQUEADO |

### Como o Sistema Usa a Planilha

O sistema verifica a planilha antes de cada emissão:
1. Busca o CNPJ da empresa
2. Verifica se Status = "ATIVO"
3. Verifica se Vencimento >= data atual
4. Se tudo OK, permite emitir
5. Se não, bloqueia e mostra mensagem

### Bloquear um Cliente

Para bloquear um cliente que não pagou:
1. Abra a planilha
2. Encontre a linha do cliente
3. Mude a coluna "Status" de "ATIVO" para "BLOQUEADO"
4. Pronto! Na próxima tentativa de emissão, ele será bloqueado

### Liberar um Cliente

1. Abra a planilha
2. Encontre a linha do cliente
3. Mude "Status" para "ATIVO"
4. Atualize a data de "Vencimento"
5. Pronto!

### Adicionar Novo Cliente

1. Adicione uma nova linha na planilha
2. Preencha CNPJ, Nome, Email, Plano, Valor
3. Coloque Vencimento = data de hoje + 30 dias
4. Coloque Status = "ATIVO"
5. Cadastre a empresa no sistema (portal)

---

## 💳 Preparação para Stripe (Futuro)

O sistema já está preparado para integração com Stripe:

```typescript
// Estrutura atual (manual via planilha)
interface Licenca {
  tenantId: string;
  status: 'ATIVO' | 'BLOQUEADO' | 'TRIAL';
  vencimento: Date;
  plano: 'BASICO' | 'PRO' | 'ENTERPRISE';
}

// Futura integração Stripe
interface LicencaStripe extends Licenca {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  metodoPagamento: 'cartao' | 'boleto' | 'pix';
}
```

Quando quiser integrar o Stripe:
1. Crie conta no Stripe
2. Configure webhooks
3. O sistema automaticamente:
   - Ativa licença quando pagamento confirmado
   - Bloqueia quando pagamento falha
   - Envia emails de cobrança

---

# PARTE 5: SOLUÇÃO DE PROBLEMAS

## ❌ Erros Comuns e Soluções

### "Certificado inválido"
**Causa:** Senha errada ou certificado expirado
**Solução:** 
1. Verifique a senha do certificado
2. Verifique a data de validade
3. Faça upload novamente

### "Licença inativa"
**Causa:** Cliente bloqueado ou vencido
**Solução:**
1. Abra a planilha de licenças
2. Verifique o Status e Vencimento
3. Atualize se necessário

### "Erro ao conectar com prefeitura"
**Causa:** WebService da prefeitura fora do ar
**Solução:**
1. Aguarde alguns minutos
2. Tente novamente
3. Se persistir, verifique status do serviço da prefeitura

### "CNPJ não autorizado"
**Causa:** Empresa não cadastrada na prefeitura
**Solução:**
1. Cadastre a empresa no portal da prefeitura
2. Solicite autorização para emissão
3. Aguarde liberação

### "RPS já utilizado"
**Causa:** Número de RPS repetido
**Solução:**
1. O sistema gerencia automaticamente
2. Se ocorrer, verifique a configuração da empresa
3. Atualize o próximo número de RPS

## 📞 Suporte

Se tiver problemas:
1. Verifique este guia primeiro
2. Consulte a documentação ABRASF 2.04
3. Entre em contato com o desenvolvedor

---

## 📋 Checklist de Instalação

### Iniciante
- [ ] Node.js instalado
- [ ] Git instalado
- [ ] VS Code instalado
- [ ] Conta Supabase criada
- [ ] Projeto Supabase criado
- [ ] Schema SQL executado
- [ ] Conta Vercel criada
- [ ] Projeto deployado
- [ ] Usuário admin criado
- [ ] Certificado cadastrado
- [ ] Primeira nota de teste emitida

### Produção
- [ ] Todos os passos de iniciante
- [ ] Ambiente mudado para "producao"
- [ ] Série RPS mudada para "1"
- [ ] Autorização da prefeitura obtida
- [ ] Planilha de licenças configurada
- [ ] Backup automático configurado
- [ ] Monitoramento ativado

---

*Última atualização: Janeiro 2024*
*Versão: 2.0*
