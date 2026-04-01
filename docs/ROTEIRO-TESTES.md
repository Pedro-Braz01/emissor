# 🧪 ROTEIRO DE TESTES - HOMOLOGAÇÃO

## Pré-requisitos

1. ✅ Sistema instalado e rodando (`npm run dev`)
2. ✅ Conta no Supabase configurada
3. ✅ Usuário admin criado
4. ✅ Empresa cadastrada no sistema
5. ✅ Certificado digital A1 (.pfx) cadastrado
6. ✅ Cadastro de homologação na prefeitura de Ribeirão Preto

---

## Configuração para Homologação

### No Supabase, verifique que a empresa está configurada assim:

```sql
UPDATE empresas 
SET 
    ambiente = 'HOMOLOGACAO',
    serie_rps = '8'
WHERE id = 'uuid-da-sua-empresa';
```

### No arquivo `.env.local`:

```env
NFSE_AMBIENTE=homologacao
```

---

## Teste 1: Consultar Dados Cadastrais

**Objetivo**: Verificar se o certificado e a conexão estão funcionando.

1. No sistema, vá em **Configurações** > **Empresa**
2. Clique em **"Consultar dados na prefeitura"**
3. Se funcionar, você verá os dados da empresa retornados pela prefeitura

**Esperado**: Retorno com dados da empresa (razão social, CNPJ, situação cadastral)

---

## Teste 2: Emissão Simples

**Objetivo**: Emitir uma NFSe básica.

### Dados de teste:

| Campo | Valor |
|-------|-------|
| **Tomador** | |
| CPF/CNPJ | 11.111.111/0001-91 |
| Razão Social | EMPRESA TESTE HOMOLOGACAO |
| Email | teste@teste.com |
| **Serviço** | |
| Valor | R$ 100,00 |
| Discriminação | Serviço de teste de integração em ambiente de homologação. Nota sem valor fiscal. |
| Item Lista | 01.07 |

### Passos:

1. Vá em **Emitir NFSe**
2. Preencha os dados acima
3. Clique em **Emitir**
4. Aguarde o processamento

**Esperado**: 
- Mensagem "NFSe XXXX emitida com sucesso!"
- Código de verificação retornado

---

## Teste 3: Emissão com ISS Retido

**Objetivo**: Verificar cálculo com ISS retido na fonte.

### Dados de teste:

| Campo | Valor |
|-------|-------|
| **Tomador** | |
| CNPJ | 22.222.222/0001-82 |
| Razão Social | TOMADOR COM RETENCAO |
| **Serviço** | |
| Valor | R$ 1.000,00 |
| ISS Retido | ✅ Sim |
| Discriminação | Serviço com retenção de ISS na fonte para teste. |

**Esperado**: 
- NFSe emitida
- Valor líquido = Valor - ISS

---

## Teste 4: Consulta de NFSe

**Objetivo**: Verificar se as notas emitidas podem ser consultadas.

1. Vá em **Consultar Notas**
2. Verifique se as notas dos testes anteriores aparecem
3. Clique em uma nota para ver detalhes
4. Se tiver link, tente abrir no site da prefeitura

**Esperado**: Notas listadas com todos os dados

---

## Teste 5: Cancelamento (CUIDADO)

**Objetivo**: Testar o cancelamento de NFSe.

⚠️ **Atenção**: Só cancele notas de teste em homologação!

1. Vá em **Consultar Notas**
2. Encontre uma nota emitida
3. Clique no botão de cancelar (X vermelho)
4. Informe o motivo: "Teste de cancelamento em homologação"
5. Confirme

**Esperado**: 
- Mensagem "NFSe cancelada com sucesso"
- Status muda para "CANCELADA"

---

## Teste 6: Emissão em Lote (se implementado)

**Objetivo**: Testar importação de múltiplas notas.

1. Crie um arquivo Excel com este formato:

| cpf_cnpj | razao_social | valor | discriminacao |
|----------|--------------|-------|---------------|
| 11111111000191 | Empresa A | 100 | Serviço teste 1 |
| 22222222000182 | Empresa B | 200 | Serviço teste 2 |
| 33333333000173 | Empresa C | 300 | Serviço teste 3 |

2. Vá em **Importar Lote**
3. Faça upload do arquivo
4. Confira os dados
5. Clique em **Processar**

**Esperado**: Todas as notas emitidas em sequência

---

## Erros Comuns

### "Certificado inválido"
- Verifique a senha do certificado
- Verifique se o certificado não está expirado
- Faça upload novamente

### "CNPJ não autorizado"
- A empresa precisa estar cadastrada na prefeitura para homologação
- Solicite o cadastro de homologação no portal da prefeitura

### "RPS já utilizado"
- O número de RPS já foi usado antes
- Verifique o próximo número de RPS nas configurações da empresa

### "Erro ao conectar com WebService"
- Verifique sua conexão com internet
- O WebService da prefeitura pode estar fora do ar
- Tente novamente em alguns minutos

### "Licença inativa"
- Verifique o status da licença no sistema
- Se você é o admin, vá em Licenças e verifique

---

## Checklist Final de Homologação

Antes de ir para produção, confirme:

- [ ] Emissão simples funcionando
- [ ] Emissão com ISS retido funcionando
- [ ] Consulta de notas funcionando
- [ ] Cancelamento funcionando
- [ ] Certificado digital válido
- [ ] Todos os dados da empresa corretos
- [ ] Emails sendo enviados (se configurado)

---

## Migração para Produção

Quando tudo estiver testado:

1. **No Supabase**, atualize a empresa:
```sql
UPDATE empresas 
SET 
    ambiente = 'PRODUCAO',
    serie_rps = '1',
    proximo_numero_rps = 1
WHERE id = 'uuid-da-sua-empresa';
```

2. **No `.env.local`**:
```env
NFSE_AMBIENTE=producao
```

3. **Reinicie o servidor**

4. **Faça uma emissão de teste real** com valor baixo

---

## Suporte

Se encontrar problemas:

1. Verifique os logs no console do navegador (F12)
2. Verifique os logs do servidor (terminal onde roda `npm run dev`)
3. Consulte a documentação ABRASF 2.04
4. Verifique o manual de integração da prefeitura
