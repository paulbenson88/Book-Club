const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const crypto = require('crypto');

try { admin.initializeApp(); } catch (_) {}

setGlobalOptions({ region: 'us-central1', timeoutSeconds: 20, memoryMiB: 256, maxInstances: 2 });

const BOOK_META_TTL_MS = 0; // 0 = no expiry
const BOOK_META_COLLECTION = 'bookMeta';

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

function json(res, status, obj) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  return res.status(status || 200).send(JSON.stringify(obj));
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
