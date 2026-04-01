# MODELO DE PLANILHA - CONTROLE DE LICENÇAS

## Como usar o Google Sheets para gerenciar licenças

### Passo 1: Criar a Planilha

1. Acesse: https://sheets.google.com
2. Clique em "+ Nova Planilha"
3. Renomeie para: "NFSe - Controle de Licenças"

### Passo 2: Criar as Colunas

Na primeira linha, crie estas colunas:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| CNPJ | Empresa | Email | Plano | Valor | Vencimento | Status |

### Passo 3: Preencher os Dados

Exemplo de dados:

| CNPJ | Empresa | Email | Plano | Valor | Vencimento | Status |
|------|---------|-------|-------|-------|------------|--------|
| 12.345.678/0001-90 | Empresa ABC | contato@abc.com | BASICO | R$ 99 | 2024-03-15 | ATIVO |
| 98.765.432/0001-10 | Empresa XYZ | xyz@email.com | PRO | R$ 199 | 2024-02-20 | ATIVO |
| 11.222.333/0001-44 | Empresa 123 | empresa123@mail.com | BASICO | R$ 99 | 2024-01-10 | BLOQUEADO |

### Passo 4: Publicar na Web (para o sistema ler)

1. Menu: Arquivo > Compartilhar > Publicar na web
2. Selecione "Página inteira" e "CSV"
3. Clique em "Publicar"
4. Copie o ID da planilha da URL:
   - URL: https://docs.google.com/spreadsheets/d/1ABC123XYZ.../edit
   - ID: 1ABC123XYZ...

### Passo 5: Configurar no Sistema

No arquivo `.env.local` do portal, adicione:

```
GOOGLE_SHEETS_LICENSE_ID=1ABC123XYZ...
```

---

## Como Gerenciar

### Bloquear um Cliente
1. Encontre a linha do cliente
2. Mude a coluna "Status" de "ATIVO" para "BLOQUEADO"
3. Pronto! Na próxima vez que ele tentar emitir, será bloqueado

### Liberar um Cliente
1. Encontre a linha do cliente
2. Mude a coluna "Status" de "BLOQUEADO" para "ATIVO"
3. Atualize a coluna "Vencimento" para uma data futura
4. Pronto!

### Adicionar Novo Cliente
1. Adicione uma nova linha
2. Preencha todos os campos
3. Coloque Status = "ATIVO"

---

## Valores de Status Válidos

- **ATIVO** - Cliente pode usar normalmente
- **TRIAL** - Cliente em período de teste
- **BLOQUEADO** - Cliente bloqueado (não pode emitir)
- **SUSPENSO** - Pagamento pendente
- **CANCELADO** - Contrato cancelado

---

## Dicas

1. **Formato de data**: Use AAAA-MM-DD (ex: 2024-03-15)
2. **CNPJ**: Pode ser com ou sem pontuação
3. **Status**: Use MAIÚSCULAS
4. **Backup**: O Google Sheets salva automaticamente e tem histórico de versões
5. **Acesso**: Você pode editar pelo celular usando o app Google Sheets
