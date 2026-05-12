/**
 * Google Apps Script - Lead Sync (Facebook Lead Ads → CRM)
 * ─────────────────────────────────────────────────────────────
 * SCRIPT PROPERTIES necessárias:
 *   FB_PAGE_ID       → ID da sua página no Facebook
 *   FB_ACCESS_TOKEN  → Token de acesso da Meta (token de página permanente)
 *   CV_TOKEN         → Token do seu CRM
 *   CV_EMAIL         → E-mail de autenticação do CRM
 *   LAST_RUN         → 0
 *   SPREADSHEET_ID   → ID da planilha Google Sheets para log
 */

// ─── GATILHO ────────────────────────────────────────────────────────────────

function setup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runLeadSync')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('runLeadSync')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('✅ Gatilho de 30 min criado com sucesso.');
}

// ─── PRINCIPAL ───────────────────────────────────────────────────────────────

function runLeadSync() {
  const props = PropertiesService.getScriptProperties();

  const FB_PAGE_ID      = mustGetProp_(props, 'FB_PAGE_ID');
  const FB_ACCESS_TOKEN = mustGetProp_(props, 'FB_ACCESS_TOKEN');
  const CV_TOKEN        = mustGetProp_(props, 'CV_TOKEN');
  const CV_EMAIL        = mustGetProp_(props, 'CV_EMAIL');
  const SPREADSHEET_ID  = mustGetProp_(props, 'SPREADSHEET_ID');

  const lastRun = Number(props.getProperty('LAST_RUN') || 0);

  const sheet = getOrCreateSheet_(SPREADSHEET_ID, 'Log de Leads');
  ensureHeader_(sheet);

  const forms = fetchForms_(FB_PAGE_ID, FB_ACCESS_TOKEN);
  Logger.log(`📋 ${forms.length} formulário(s) encontrado(s).`);

  let allLeads = [];

  for (const form of forms) {
    try {
      Logger.log(`🔍 Buscando leads: ${form.name} (${form.id})`);
      const leads = fetchFacebookLeads_(form.id, FB_ACCESS_TOKEN);
      leads.forEach(l => {
        l._formId   = form.id;
        l._formName = form.name;
      });
      allLeads.push(...leads);
      Logger.log(`   → ${leads.length} lead(s) encontrado(s)`);
    } catch (err) {
      Logger.log(`❌ Erro ao buscar formulário ${form.name}: ${err.message}`);
      appendLog_(sheet, {
        data:      new Date(),
        campanha:  form.name,
        origem:    'Meta Ads',
        formId:    form.id,
        leadId:    '-',
        nome:      '-',
        telefone:  '-',
        status:    '❌ ERRO AO BUSCAR',
        detalhe:   err.message
      });
    }
  }

  const newLeads = allLeads
    .filter(l => {
      if (!l || !l.created_time) return false;
      const t = new Date(l.created_time).getTime();
      if (!Number.isFinite(t) || t <= lastRun) return false;

      const fieldData = Array.isArray(l.field_data) ? l.field_data : [];
      const nome = getFieldValue_(fieldData, 'nome_completo')
                || getFieldValue_(fieldData, 'full_name') || '';
      if (nome.toLowerCase().includes('test lead') || nome.toLowerCase().includes('dummy')) return false;

      return true;
    })
    .sort((a, b) =>
      new Date(a.created_time).getTime() - new Date(b.created_time).getTime()
    );

  if (!newLeads.length) {
    Logger.log('ℹ️ Sem novos leads.');
    return;
  }

  Logger.log(`🚀 ${newLeads.length} novo(s) lead(s) para enviar ao CRM.`);

  let maxSuccessfulTime = lastRun;

  for (const lead of newLeads) {
    const leadTime  = new Date(lead.created_time).getTime();
    const fieldData = Array.isArray(lead.field_data) ? lead.field_data : [];

    const nome     = getFieldValue_(fieldData, 'nome_completo')
                  || getFieldValue_(fieldData, 'full_name')
                  || 'Sem nome';
    const telefone = getFieldValue_(fieldData, 'telefone')
                  || getFieldValue_(fieldData, 'phone_number')
                  || '-';
    const email    = getFieldValue_(fieldData, 'email') || '-';

    try {
      sendToCrm_(lead, CV_TOKEN, CV_EMAIL, nome, telefone, email);
      maxSuccessfulTime = Math.max(maxSuccessfulTime, leadTime);
      Logger.log(`✅ Lead enviado: ${nome} | ${lead._formName}`);

      appendLog_(sheet, {
        data:      new Date(lead.created_time),
        campanha:  lead._formName,
        origem:    'Meta Ads',
        formId:    lead._formId,
        leadId:    lead.id,
        nome:      nome,
        telefone:  telefone,
        status:    '✅ ENVIADO',
        detalhe:   'Lead enviado com sucesso ao CRM'
      });

    } catch (err) {
      Logger.log(`❌ Erro ao enviar lead ${lead.id}: ${err.message}`);

      appendLog_(sheet, {
        data:      new Date(lead.created_time),
        campanha:  lead._formName,
        origem:    'Meta Ads',
        formId:    lead._formId,
        leadId:    lead.id,
        nome:      nome,
        telefone:  telefone,
        status:    '❌ ERRO AO ENVIAR',
        detalhe:   err.message
      });

      break;
    }
  }

  if (maxSuccessfulTime > lastRun) {
    props.setProperty('LAST_RUN', String(maxSuccessfulTime));
    Logger.log(`💾 LAST_RUN atualizado: ${new Date(maxSuccessfulTime).toISOString()}`);
  }
}

// ─── FACEBOOK ────────────────────────────────────────────────────────────────

function fetchForms_(pageId, accessToken) {
  const url =
    `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/leadgen_forms` +
    `?fields=id,name&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  const res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  const body = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`Facebook API (forms) ${code}: ${body}`);
  }

  const parsed = JSON.parse(body);
  return Array.isArray(parsed.data) ? parsed.data : [];
}

function fetchFacebookLeads_(formId, accessToken) {
  let url =
    `https://graph.facebook.com/v25.0/${encodeURIComponent(formId)}/leads` +
    `?fields=id,created_time,field_data&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  const all = [];
  let pageCount = 0;

  while (url && pageCount < 20) {
    const res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = res.getResponseCode();
    const body = res.getContentText();

    if (code < 200 || code >= 300) {
      throw new Error(`Facebook API ${code}: ${body}`);
    }

    const parsed = JSON.parse(body);
    const data   = Array.isArray(parsed.data) ? parsed.data : [];
    all.push(...data);

    url = parsed.paging && parsed.paging.next ? parsed.paging.next : null;
    pageCount++;
  }

  return all;
}

// ─── CRM ─────────────────────────────────────────────────────────────────────

function sendToCrm_(lead, cvToken, cvEmail, nome, telefone, email) {
  const payload = {
    nome: nome,
    email: email !== '-' ? email : 'sem@email.com',
    telefone: telefone !== '-' ? telefone : '11999999999',
    midia_principal: 'Meta Ads',
    midias: ['Meta Ads'],
    tags: ['Meta Ads'],
    observacoes: `Campanha: ${lead._formName} | Lead ID: ${lead.id}`
  };

  const res = UrlFetchApp.fetch(
    process.env.CRM_API_URL,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        token:  cvToken,
        email:  cvEmail,
        Accept: 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const code = res.getResponseCode();
  const body = res.getContentText();

  Logger.log(`📡 CRM RESPONSE: ${body}`);

  if (code < 200 || code >= 300) {
    throw new Error(`CRM ${code}: ${body}`);
  }
}

// ─── PLANILHA DE LOG ─────────────────────────────────────────────────────────

function getOrCreateSheet_(spreadsheetId, sheetName) {
  const ss  = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  return sheet;
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Data/Hora Lead',
      'Campanha',
      'Origem',
      'Form ID',
      'Lead ID',
      'Nome',
      'Telefone',
      'Status',
      'Detalhe'
    ]);

    const header = sheet.getRange(1, 1, 1, 9);
    header.setFontWeight('bold');
    header.setBackground('#4a90d9');
    header.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
}

function appendLog_(sheet, { data, campanha, origem, formId, leadId, nome, telefone, status, detalhe }) {
  sheet.appendRow([data, campanha, origem, formId, leadId, nome, telefone, status, detalhe]);

  const lastRow = sheet.getLastRow();
  const range   = sheet.getRange(lastRow, 1, 1, 9);
  if (status.includes('✅')) {
    range.setBackground('#d9ead3');
  } else if (status.includes('❌')) {
    range.setBackground('#f4cccc');
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getFieldValue_(fieldData, fieldName) {
  const field = fieldData.find(f => f && f.name === fieldName);
  if (!field || !Array.isArray(field.values) || !field.values.length) return null;
  return field.values[0];
}

function mustGetProp_(props, key) {
  const v = props.getProperty(key);
  if (!v) throw new Error(`❌ Propriedade ausente nas Script Properties: ${key}`);
  return v;
}
