const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { google } = require('googleapis');

try { admin.initializeApp(); } catch (_) {}

setGlobalOptions({ region: 'us-central1', timeoutSeconds: 20, memoryMiB: 256, maxInstances: 2 });

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

function json(res, status, obj) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  return res.status(status || 200).send(JSON.stringify(obj));
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
