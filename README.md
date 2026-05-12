# Meta Lead Ads → CRM Integration

Integração automática de leads do **Facebook/Instagram Lead Ads** para qualquer CRM via API REST.

O projeto tem duas abordagens complementares:

- **Webhook em tempo real** (Node.js/Express) — recebe o lead no momento em que ele é gerado
- **Polling via Google Apps Script** — varredura a cada 30 minutos como fallback ou uso standalone (sem necessidade de servidor)

---

## Stack

- Node.js + Express
- Axios
- dotenv
- Google Apps Script (alternativa serverless)

---

## Estrutura

```
├── server.js                  # Entry point
├── src/app.js                 # Configuração do Express
├── routes/webhookRoutes.js    # GET e POST /webhook
├── controllers/
│   └── webhookController.js   # Verificação Meta + processamento
├── services/
│   └── crmService.js          # Envio para o CRM via Axios
├── utils/
│   └── formatLead.js          # Normaliza o payload da Meta
├── apps-script/
│   └── leadSync.gs            # Google Apps Script (polling)
├── .env.example
└── .gitignore
```

---

## Como usar

### 1. Clone e instale

```bash
git clone https://github.com/seu-usuario/meta-crm-integration.git
cd meta-crm-integration
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env`:

```env
PORT=3000
CRM_API_URL=https://api.seucrm.com/leads
CRM_API_TOKEN=seu_token_aqui
VERIFY_TOKEN=seu_token_meta
```

### 3. Rode o servidor

```bash
npm start
```

### 4. Configure o Webhook na Meta

No [Meta for Developers](https://developers.facebook.com/), aponte o webhook para:

```
https://seu-dominio.com/webhook
```

Use o mesmo valor de `VERIFY_TOKEN` definido no `.env`.

---

## Google Apps Script (alternativa serverless)

O arquivo `apps-script/leadSync.gs` roda direto no Google Apps Script, sem precisar de servidor.

### Configuração

1. Acesse [script.google.com](https://script.google.com) e crie um novo projeto
2. Cole o conteúdo de `leadSync.gs`
3. Em **Configurações do projeto → Propriedades do script**, adicione:

| Chave | Valor |
|---|---|
| `FB_PAGE_ID` | ID da sua página no Facebook |
| `FB_ACCESS_TOKEN` | Token de acesso permanente da Meta |
| `CV_TOKEN` | Token do seu CRM |
| `CV_EMAIL` | E-mail de autenticação do CRM |
| `SPREADSHEET_ID` | ID da planilha Google Sheets para log |
| `LAST_RUN` | `0` (inicializar assim) |

4. Execute `setup()` uma vez para criar o gatilho de 30 minutos

---

## Customização

O arquivo `utils/formatLead.js` é onde você adapta o payload recebido da Meta para o formato esperado pelo seu CRM:

```js
module.exports = function formatLead(data) {
  return {
    nome: data?.name || '',
    email: data?.email || '',
    telefone: data?.phone || '',
    origem: 'Meta Ads'
  };
};
```

---

## Licença

MIT
