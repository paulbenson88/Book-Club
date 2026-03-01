const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const crypto = require('crypto');

try { admin.initializeApp(); } catch (_) {}

setGlobalOptions({ region: 'us-central1', timeoutSeconds: 20, memoryMiB: 256, maxInstances: 2 });

const BOOK_META_TTL_MS = 0; // 0 = no expiry
const BOOK_META_COLLECTION = 'bookMeta';
const WHATSAPP_SECRETS = [
  'WHATSAPP_RAPIDAPI_KEY',
  'WHATSAPP_RAPIDAPI_HOST',
  'WHATSAPP_SESSION',
  'WHATSAPP_GROUP_CHAT_ID'
];

exports.sendSubmissionCall = onRequest({ secrets: WHATSAPP_SECRETS }, async (req, res) => {
  setCors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  try {
    const body = parseRequestBody(req);
    if (body && body.dryRun === true) {
      const cfg = getWhatsAppConfig();
      console.log('[sendSubmissionCall] dryRun', { ready: cfg.ready, host: cfg.host, hasApiKey: cfg.hasApiKey, hasSession: cfg.hasSession, hasChatId: cfg.hasChatId });
      return json(res, 200, { ok: cfg.ready, dryRun: true, type: 'submission_call', config: toPublicWhatsAppConfig(cfg) });
    }
    const submissionsUrl = String(body.submissionsUrl || process.env.BOOK_SUBMISSIONS_URL || 'https://docs.google.com/spreadsheets/d/1VCHJO67_pYjNWEceSRwb4jotF7GO3L8uFaLo3HUJmnk/edit').trim();
    const text = String(body.text || '').trim() || `📚 Book Club: submissions are open!\n\nPlease add your book suggestions here:\n${submissionsUrl}`;
    const sent = await sendRapidApiWhatsAppText(text);
    console.log('[sendSubmissionCall] sent', { ok: true, providerSuccess: sent && sent.success === true });
    return json(res, 200, { ok: true, type: 'submission_call', sent });
  } catch (e) {
    const info = classifySendError(e);
    console.error('[sendSubmissionCall] failed', info.detail);
    return json(res, info.status, { error: info.code, detail: info.detail });
  }
});

exports.sendPollPublished = onRequest({ secrets: WHATSAPP_SECRETS }, async (req, res) => {
  setCors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  try {
    const body = parseRequestBody(req);
    if (body && body.dryRun === true) {
      const cfg = getWhatsAppConfig();
      console.log('[sendPollPublished] dryRun', { ready: cfg.ready, host: cfg.host, hasApiKey: cfg.hasApiKey, hasSession: cfg.hasSession, hasChatId: cfg.hasChatId });
      return json(res, 200, { ok: cfg.ready, dryRun: true, type: 'poll_published', config: toPublicWhatsAppConfig(cfg) });
    }
    const pollUrl = String(body.pollUrl || process.env.BOOK_POLL_URL || 'https://paulbenson88.github.io/Book-Club/pages/voting_poll.html').trim();
    const text = String(body.text || '').trim() || `🗳️ Book Club voting is live!\n\nVote here:\n${pollUrl}`;
    const sent = await sendRapidApiWhatsAppText(text);
    console.log('[sendPollPublished] sent', { ok: true, providerSuccess: sent && sent.success === true });
    return json(res, 200, { ok: true, type: 'poll_published', sent });
  } catch (e) {
    const info = classifySendError(e);
    console.error('[sendPollPublished] failed', info.detail);
    return json(res, info.status, { error: info.code, detail: info.detail });
  }
});

exports.sendWinnerAnnounced = onRequest({ secrets: WHATSAPP_SECRETS }, async (req, res) => {
  setCors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  try {
    const body = parseRequestBody(req);
    if (body && body.dryRun === true) {
      const cfg = getWhatsAppConfig();
      console.log('[sendWinnerAnnounced] dryRun', { ready: cfg.ready, host: cfg.host, hasApiKey: cfg.hasApiKey, hasSession: cfg.hasSession, hasChatId: cfg.hasChatId });
      return json(res, 200, { ok: cfg.ready, dryRun: true, type: 'winner_announced', config: toPublicWhatsAppConfig(cfg) });
    }
    const winnerTitle = String(body.winnerTitle || body.winner || '').trim();
    const suggestedBy = String(body.suggestedBy || '').trim();
    const pollUrl = String(body.pollUrl || process.env.BOOK_POLL_URL || 'https://paulbenson88.github.io/Book-Club/pages/voting_poll.html').trim();
    if (!winnerTitle) return json(res, 400, { error: 'missing_winner' });
    const byLine = suggestedBy ? `\nSuggested by: ${suggestedBy}` : '';
    const text = String(body.text || '').trim() || `🏆 Winner announced: ${winnerTitle}${byLine}\n\nThanks everyone for voting!\n${pollUrl}`;
    const sent = await sendRapidApiWhatsAppText(text);
    console.log('[sendWinnerAnnounced] sent', { ok: true, providerSuccess: sent && sent.success === true });
    return json(res, 200, { ok: true, type: 'winner_announced', sent });
  } catch (e) {
    const info = classifySendError(e);
    console.error('[sendWinnerAnnounced] failed', info.detail);
    return json(res, info.status, { error: info.code, detail: info.detail });
  }
});

exports.finalizeWinner = onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const winnerTitle = String(body.winnerTitle || '').trim();
    const month = String(body.month || '').trim();
    const suggestedBy = String(body.suggestedBy || '').trim();
    const author = String(body.author || '').trim();
    const removeFromSubmissions = body.removeFromSubmissions !== false;
    const addToBooksRead = body.addToBooksRead !== false;

    if (!winnerTitle) return json(res, 400, { error: 'missing_winner' });
    if (addToBooksRead && !month) return json(res, 400, { error: 'missing_month' });

    const cfg = getSheetsConfig();
    if (!cfg) return json(res, 500, { error: 'missing_sheets_config' });

    const sheets = await getSheetsClient(cfg);
    const spreadsheetId = cfg.spreadsheetId;

    let deletedRows = 0;
    if (removeFromSubmissions) {
      deletedRows = await deleteWinnerFromSubmissions({ sheets, spreadsheetId, tabName: cfg.submissionsTab, winnerTitle, author });
    }

    let appended = false;
    if (addToBooksRead) {
      appended = await appendBooksRead({ sheets, spreadsheetId, tabName: cfg.booksReadTab, month, winnerTitle, author, suggestedBy });
    }

    return json(res, 200, { ok: true, deletedRows, appended });
  } catch (e) {
    return json(res, 500, { error: 'server_error', detail: String(e) });
  }
});

// Resolve Goodreads link + description and cache results in Firestore
exports.resolveGoodreads = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });

  try {
    const q = String(req.query.q || '').trim();
    if (!q) return json(res, 400, { error: 'missing_query' });

    const key = normalizeBookKey(q);
    const cached = await getCachedBookMeta(key);
    if (cached && (cached.url || cached.description)) {
      return json(res, 200, cached);
    }

    const resolved = await resolveFromOpenLibrary(q);
    const payload = resolved || { url: '', description: '', summary: '', source: 'openlibrary' };
    if(!payload.summary && payload.description){
      payload.summary = toOneLiner(payload.description);
    }
    await saveBookMeta(key, payload, { query: q });
    return json(res, 200, payload);
  } catch (e) {
    return json(res, 500, { error: 'server_error', detail: String(e) });
  }
});

// Read cached metadata only (fast path for clients)
exports.getBookMeta = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });

  try {
    const q = String(req.query.q || '').trim();
    if (!q) return json(res, 400, { error: 'missing_query' });
    const key = normalizeBookKey(q);
    const cached = await getCachedBookMeta(key);
    return json(res, 200, cached || { url: '', description: '' });
  } catch (e) {
    return json(res, 500, { error: 'server_error', detail: String(e) });
  }
});

// Prewarm metadata (url/description/summary) for a list of books.
// Intended to run before voting starts so viewers only read cached data.
exports.warmBookMeta = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  try {
    const body = parseRequestBody(req);
    const list = Array.isArray(body && body.books) ? body.books : [];
    if (!list.length) return json(res, 200, { ok: true, warmed: 0, skipped: 0, failed: 0 });

    const dedup = new Map();
    for (const raw of list) {
      const q = String(raw || '').trim();
      if (!q) continue;
      const key = normalizeBookKey(q);
      if (!key) continue;
      if (!dedup.has(key)) dedup.set(key, q);
    }

    const maxBooks = Math.max(1, Math.min(200, parseInt(body && body.limit, 10) || 120));
    const targets = Array.from(dedup.entries()).slice(0, maxBooks);

    let warmed = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];

    for (const [key, query] of targets) {
      try {
        const cached = await getCachedBookMeta(key);
        if (cached && (cached.summary || cached.description || cached.url)) {
          skipped++;
          continue;
        }

        const resolved = await resolveFromOpenLibrary(query);
        const payload = resolved || { url: '', description: '', summary: '', source: 'openlibrary' };
        if (!payload.summary && payload.description) payload.summary = toOneLiner(payload.description);
        await saveBookMeta(key, payload, { query });
        warmed++;
      } catch (e) {
        failed++;
        failures.push({ book: query, error: String(e && e.message ? e.message : e || 'failed') });
      }
    }

    return json(res, 200, {
      ok: true,
      total: targets.length,
      warmed,
      skipped,
      failed,
      failures: failures.slice(0, 15)
    });
  } catch (e) {
    return json(res, 500, { error: 'server_error', detail: String(e) });
  }
});

function json(res, status, obj) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  return res.status(status || 200).send(JSON.stringify(obj));
}

function setCors(res, methods) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', methods || 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
}

function parseRequestBody(req) {
  const body = req && req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body || '{}'); } catch (_) { return {}; }
  }
  return body;
}

async function sendRapidApiWhatsAppText(text) {
  const cfg = getWhatsAppConfig();
  if (!cfg.hasApiKey) throw new Error('Missing WHATSAPP_RAPIDAPI_KEY');
  if (!cfg.hasSession) throw new Error('Missing WHATSAPP_SESSION');
  if (!cfg.hasChatId) throw new Error('Missing WHATSAPP_GROUP_CHAT_ID');

  const basePayload = { chatId: cfg.chatId, text: String(text || '').trim() };
  const sessions = getSessionCandidates(cfg.session);
  const configuredPath = normalizeRapidApiPath(process.env.WHATSAPP_SEND_TEXT_PATH || '');
  const paths = [
    configuredPath,
    '/v1/sessions/{session}/messages/text',
    '/v1/sessions/{session}/messages/send-text',
    '/v1/sessions/{session}/messages/sendText',
    '/v1/sessions/{session}/messages/send',
    `/v1/messages/text`,
    `/v1/messages/send-text`,
    `/v1/messages/sendText`
  ].filter(Boolean);

  let lastErr = 'unknown_error';
  for (const pathTemplate of paths) {
    const usesPathSession = pathTemplate.includes('{session}');
    const scopedSessions = usesPathSession ? sessions : [sessions[0]];
    for (const sessionCandidate of scopedSessions) {
      const encodedSession = encodeURIComponent(sessionCandidate);
      const path = usesPathSession ? pathTemplate.replace('{session}', encodedSession) : pathTemplate;
      const bodyCandidates = usesPathSession
        ? [basePayload]
        : [
            { ...basePayload, session: sessionCandidate },
            { ...basePayload, session: encodedSession },
            { chat_id: cfg.chatId, text: basePayload.text, session: sessionCandidate, reply_to: '', mentions: [] },
            { chatId: cfg.chatId, text: basePayload.text, session: sessionCandidate, reply_to: '', mentions: [] }
          ];

      for (const payload of bodyCandidates) {
        const url = `https://${cfg.host}${path}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'x-rapidapi-key': cfg.apiKey,
            'x-rapidapi-host': cfg.host,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        let data = null;
        let textBody = '';
        try { data = await resp.json(); } catch (_) {
          try { textBody = await resp.text(); } catch (_) { textBody = ''; }
        }

        if (resp.ok) return data || { success: true, path };

        const detail = data && data.error
          ? JSON.stringify(data.error)
          : (data && data.message ? String(data.message) : (textBody ? textBody.slice(0, 240) : `HTTP ${resp.status}`));

        if (resp.status === 429) {
          lastErr = `429 on ${path}${detail ? ` :: ${detail}` : ''}`;
          continue;
        }
        if (resp.status === 403 || resp.status === 404 || resp.status === 422) {
          lastErr = `${resp.status} on ${path}${detail ? ` :: ${detail}` : ''}`;
          continue;
        }
        if (resp.status === 401) {
          throw new Error(`RapidAPI send failed: HTTP ${resp.status} (path=${path})`);
        }
        throw new Error(`RapidAPI send failed: ${detail} (path=${path})`);
      }
    }
  }

  throw new Error(`RapidAPI send failed: ${lastErr}`);
}

function classifySendError(err) {
  const detail = String(err && err.message ? err.message : err || 'send_failed');
  if (/Too many requests|HTTP\s*429|429\s+on/i.test(detail)) {
    return { status: 429, code: 'rate_limited', detail: 'WhatsApp provider is rate-limiting requests. Please try again later.' };
  }
  if (/HTTP\s*403/i.test(detail)) {
    return { status: 403, code: 'provider_forbidden', detail: 'WhatsApp provider rejected the API key or access for this route.' };
  }
  if (/HTTP\s*401/i.test(detail)) {
    return { status: 401, code: 'provider_unauthorized', detail: 'WhatsApp provider API key is invalid or expired.' };
  }
  if (/404\s+on/i.test(detail)) {
    return { status: 502, code: 'provider_route_not_found', detail };
  }
  if (/422\s+on/i.test(detail)) {
    return { status: 400, code: 'provider_validation_failed', detail };
  }
  return { status: 500, code: 'send_failed', detail };
}

function getSessionCandidates(rawSession) {
  const base = String(rawSession || '').trim();
  if (!base) return [''];
  const out = [base];
  const m = base.match(/([0-9]{10,}_[a-z0-9]+)$/i);
  if (m && m[1] && !out.includes(m[1])) out.push(m[1]);
  return out;
}

function getWhatsAppConfig() {
  const host = normalizeRapidApiHost(process.env.WHATSAPP_RAPIDAPI_HOST || 'whatsapp-messaging-bot.p.rapidapi.com');
  const apiKey = String(process.env.WHATSAPP_RAPIDAPI_KEY || '').trim();
  const session = String(process.env.WHATSAPP_SESSION || '').trim();
  const chatId = String(process.env.WHATSAPP_GROUP_CHAT_ID || '').trim();
  const hasApiKey = !!apiKey;
  const hasSession = !!session;
  const hasChatId = !!chatId;
  return {
    host,
    apiKey,
    session,
    chatId,
    hasApiKey,
    hasSession,
    hasChatId,
    ready: hasApiKey && hasSession && hasChatId
  };
}

function normalizeRapidApiHost(rawHost) {
  const fallback = 'whatsapp-messaging-bot.p.rapidapi.com';
  const src = String(rawHost || '').trim();
  if (!src) return fallback;

  let h = src.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  const match = h.match(/([a-z0-9.-]+\.rapidapi\.com)/i);
  if (match && match[1]) h = match[1].toLowerCase();

  if (h === 'rapidapi.com') return fallback;
  return h;
}

function normalizeRapidApiPath(rawPath) {
  const p = String(rawPath || '').trim();
  if (!p) return '';
  const noHost = p.replace(/^https?:\/\/[^/]+/i, '').trim();
  if (!noHost) return '';
  return noHost.startsWith('/') ? noHost : `/${noHost}`;
}

function toPublicWhatsAppConfig(cfg) {
  return {
    host: cfg && cfg.host ? cfg.host : '',
    hasApiKey: !!(cfg && cfg.hasApiKey),
    hasSession: !!(cfg && cfg.hasSession),
    hasChatId: !!(cfg && cfg.hasChatId),
    ready: !!(cfg && cfg.ready)
  };
}

function normalizeBookKey(s) {
  try {
    const parts = parseBookParts(s);
    const t = String(parts.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const a = String(parts.author || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return a ? `${t} - ${a}` : t;
  } catch (_) { return String(s || '').toLowerCase().trim(); }
}

function bookMetaDocId(key) {
  return crypto.createHash('sha1').update(key).digest('hex');
}

async function getCachedBookMeta(key) {
  try {
    if (!key) return null;
    const db = admin.firestore();
    const docId = bookMetaDocId(key);
    const snap = await db.collection(BOOK_META_COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const updatedAt = Number(data.updatedAt || 0);
    if (BOOK_META_TTL_MS && updatedAt && (Date.now() - updatedAt > BOOK_META_TTL_MS)) return null;
    return { url: data.url || '', description: data.description || '', summary: data.summary || '', source: data.source || 'cache' };
  } catch (_) { return null; }
}

async function saveBookMeta(key, meta, opts) {
  try {
    if (!key) return;
    const db = admin.firestore();
    const docId = bookMetaDocId(key);
    const payload = {
      key,
      url: meta.url || '',
      description: meta.description || '',
      summary: meta.summary || '',
      source: meta.source || 'openlibrary',
      updatedAt: Date.now(),
      lastQuery: (opts && opts.query) ? String(opts.query) : ''
    };
    await db.collection(BOOK_META_COLLECTION).doc(docId).set(payload, { merge: true });
  } catch (_) {}
}

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs || 4000);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(id);
  }
}

async function resolveFromOpenLibrary(bookStr) {
  try {
    const parts = parseBookParts(bookStr);
    const title = parts.title || bookStr;
    const author = parts.author || '';
    const qs = new URLSearchParams({ title, author, limit: '5' });
    const searchUrl = `https://openlibrary.org/search.json?${qs.toString()}`;
    const sres = await fetchWithTimeout(searchUrl, 3500);
    if (!sres.ok) return { url: '', description: '' };
    const sj = await sres.json();
    const docs = Array.isArray(sj && sj.docs) ? sj.docs : [];
    if (!docs.length) return { url: '', description: '' };

    let description = '';
    let url = '';

    const doc = docs[0];
    if (doc) {
      // Goodreads direct id
      if (Array.isArray(doc.id_goodreads) && doc.id_goodreads.length) {
        const id = String(doc.id_goodreads[0]).replace(/[^0-9]/g, '');
        if (id) url = `https://www.goodreads.com/book/show/${id}`;
      }
      // Work description
      const workKey = (doc.key && String(doc.key).startsWith('/works/')) ? doc.key : (Array.isArray(doc.work_key) && doc.work_key[0] ? (`/works/${doc.work_key[0]}`) : '');
      if (workKey) {
        try {
          const wres = await fetchWithTimeout(`https://openlibrary.org${workKey}.json`, 3500);
          if (wres.ok) {
            const wj = await wres.json();
            let desc = wj && wj.description;
            if (desc && typeof desc === 'object' && desc.value) desc = desc.value;
            if (!desc && wj && wj.first_sentence) {
              desc = typeof wj.first_sentence === 'string' ? wj.first_sentence : (wj.first_sentence && wj.first_sentence.value) || '';
            }
            if (desc) description = String(desc);
            if (!url && Array.isArray(wj && wj.links)) {
              const gl = wj.links.find(l => l && l.url && /goodreads\.com/i.test(l.url));
              if (gl && gl.url) url = gl.url;
            }
          }
        } catch (_) {}
      }
      // Editions for Goodreads or ISBN fallback
      if (!url) {
        const eds = Array.isArray(doc.edition_key) ? doc.edition_key.slice(0, 3) : [];
        for (const ed of eds) {
          try {
            const eres = await fetchWithTimeout(`https://openlibrary.org/books/${ed}.json`, 3000);
            if (!eres.ok) continue;
            const ej = await eres.json();
            const ids = (ej && ej.identifiers) || {};
            const gr = ids.goodreads || ids['goodreads'];
            if (Array.isArray(gr) && gr.length) {
              const id = String(gr[0]).replace(/[^0-9]/g, '');
              if (id) { url = `https://www.goodreads.com/book/show/${id}`; break; }
            }
            const isbn13 = Array.isArray(ids.isbn_13) && ids.isbn_13[0];
            const isbn10 = Array.isArray(ids.isbn_10) && ids.isbn_10[0];
            const isbn = (isbn13 || isbn10 || '').toString().replace(/[^0-9Xx]/g, '');
            if (isbn) { url = `https://www.goodreads.com/book/isbn/${isbn}`; break; }
          } catch (_) {}
        }
      }
    }

    const summary = description ? toOneLiner(description) : '';
    return { url: url || '', description: description || '', summary, source: 'openlibrary' };
  } catch (_) {
    return { url: '', description: '', summary: '' };
  }
}

function toOneLiner(text){
  try{
    const s = String(text||'').replace(/\s+/g,' ').trim();
    if(!s) return '';
    const parts = s.match(/[^.!?]+[.!?]/g) || [s];
    let out = parts[0].trim();
    if(out.length > 200) out = out.slice(0, 199).replace(/[\s,;:]+$/,'') + '…';
    return out;
  }catch(_){ return ''; }
}

function getSheetsConfig() {
  const spreadsheetId = process.env.SUBMISSIONS_SHEET_ID || process.env.SHEETS_SPREADSHEET_ID || '1VCHJO67_pYjNWEceSRwb4jotF7GO3L8uFaLo3HUJmnk';
  const submissionsTab = process.env.SUBMISSIONS_TAB_NAME || 'Form Responses 1';
  const booksReadTab = process.env.BOOKS_READ_TAB_NAME || 'Read';
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!spreadsheetId || !saRaw) return null;
  return { spreadsheetId, submissionsTab, booksReadTab, saRaw };
}

async function getSheetsClient(cfg) {
  const creds = parseServiceAccount(cfg.saRaw);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

function parseServiceAccount(raw) {
  // Accept raw JSON or base64 JSON
  try {
    if (raw.trim().startsWith('{')) return JSON.parse(raw);
  } catch (_) {}
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (_) {}
  throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
}

function normalizeTitle(s) {
  try {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  } catch (_) { return String(s || '').toLowerCase(); }
}

function leftOfDash(s) {
  return String(s || '').split(' - ')[0].split(' — ')[0].trim();
}

async function deleteWinnerFromSubmissions({ sheets, spreadsheetId, tabName, winnerTitle, author }) {
  const tab = await resolveSheetId(sheets, spreadsheetId, tabName);
  if (!tab) return 0;

  const range = `${tabName}!A:Z`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = resp.data.values || [];
  if (values.length === 0) return 0;

  const header = values[0].map(v => String(v || '').toLowerCase());
  const hasHeader = header.some(h => h.includes('timestamp') || h.includes('book') || h.includes('title'));
  const startRowIndex = hasHeader ? 1 : 0; // zero-based index into values

  let titleCol = hasHeader ? header.findIndex(h => h.includes('book') || h.includes('title')) : -1;
  let authorCol = hasHeader ? header.findIndex(h => h.includes('author')) : -1;
  // If no header, guess by timestamp in first column
  if (titleCol < 0) {
    const firstVal = String((values[startRowIndex] || [])[0] || '').toLowerCase();
    const looksLikeTimestamp = /\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}|\d{1,2}:\d{2}|am|pm/.test(firstVal);
    titleCol = looksLikeTimestamp ? 1 : 0;
  }
  if (authorCol < 0) authorCol = titleCol + 1;

  const targetTitle = normalizeTitle(leftOfDash(winnerTitle));
  const targetAuthor = normalizeTitle(author || '').replace(/\s+/g, ' ').trim();

  const matches = [];
  for (let i = startRowIndex; i < values.length; i++) {
    const row = values[i] || [];
    const primaryTitle = normalizeTitle(leftOfDash(row[titleCol] || ''));
    const primaryAuthor = normalizeTitle(row[authorCol] || '');
    let matched = false;
    if (primaryTitle && primaryTitle === targetTitle) {
      if (targetAuthor && primaryAuthor && primaryAuthor !== targetAuthor) {
        matched = false;
      } else {
        matched = true;
      }
    }
    if (!matched) {
      // Fallback: scan all cells for the title text (ignoring author suffixes)
      for (let c = 0; c < row.length; c++) {
        const cellTitle = normalizeTitle(leftOfDash(row[c] || ''));
        if (cellTitle && cellTitle === targetTitle) { matched = true; break; }
      }
    }
    if (matched) matches.push(i);
  }

  if (matches.length === 0) return 0;

  // Delete rows from bottom to top to keep indices stable.
  const requests = matches.sort((a, b) => b - a).map(idx => ({
    deleteDimension: {
      range: {
        sheetId: tab.sheetId,
        dimension: 'ROWS',
        startIndex: idx,
        endIndex: idx + 1
      }
    }
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests }
  });

  return matches.length;
}

async function appendBooksRead({ sheets, spreadsheetId, tabName, month, winnerTitle, author, suggestedBy }) {
  const parts = parseBookParts(winnerTitle);
  const title = parts.title || winnerTitle;
  const authorVal = author || parts.author || '';
  const values = [[month, title, authorVal, suggestedBy || '']];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:D`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
  return true;
}

async function resolveSheetId(sheets, spreadsheetId, tabName) {
  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetsArr = info.data.sheets || [];
  const match = sheetsArr.find(s => s.properties && s.properties.title === tabName);
  if (!match) throw new Error(`Sheet tab not found: ${tabName}`);
  return { sheetId: match.properties.sheetId, title: match.properties.title };
}

function parseBookParts(s) {
  const raw = String(s || '').trim();
  if (raw.includes(' - ')) {
    const parts = raw.split(' - ');
    return { title: parts[0].trim(), author: parts.slice(1).join(' - ').trim() };
  }
  const idx = raw.lastIndexOf('-');
  if (idx > 0) return { title: raw.slice(0, idx).trim(), author: raw.slice(idx + 1).trim() };
  return { title: raw, author: '' };
}
