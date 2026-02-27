const { google } = require('googleapis');

async function main(){
  const cfg = getSheetsConfig();
  if(!cfg){
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_JSON or sheet id.');
    process.exit(1);
  }

  const projectId = cfg.projectId || process.env.FIREBASE_PROJECT_ID || '';
  const resolverBase = (process.env.GOODREADS_RESOLVER_URL || (projectId ? `https://us-central1-${projectId}.cloudfunctions.net/resolveGoodreads` : '')).replace(/\/$/, '');
  if(!resolverBase){
    console.error('Missing GOODREADS_RESOLVER_URL or project id.');
    process.exit(1);
  }

  const sheets = await getSheetsClient(cfg);
  const range = `${cfg.submissionsTab}!A:Z`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.spreadsheetId, range });
  const values = resp.data.values || [];
  if(!values.length){
    console.log('No submissions found.');
    return;
  }

  const header = values[0].map(v => String(v || '').toLowerCase());
  const hasHeader = header.some(h => h.includes('timestamp') || h.includes('book') || h.includes('title'));
  const startRowIndex = hasHeader ? 1 : 0;

  let titleCol = hasHeader ? header.findIndex(h => h.includes('book') || h.includes('title')) : -1;
  let authorCol = hasHeader ? header.findIndex(h => h.includes('author')) : -1;
  if(titleCol < 0){
    const firstVal = String((values[startRowIndex] || [])[0] || '').toLowerCase();
    const looksLikeTimestamp = /\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}|\d{1,2}:\d{2}|am|pm/.test(firstVal);
    titleCol = looksLikeTimestamp ? 1 : 0;
  }
  if(authorCol < 0) authorCol = titleCol + 1;

  const books = [];
  for(let i = startRowIndex; i < values.length; i++){
    const row = values[i] || [];
    const title = String(row[titleCol] || '').trim();
    if(!title) continue;
    const author = String(row[authorCol] || '').trim();
    const bookStr = author ? `${title} - ${author}` : title;
    books.push(bookStr);
  }

  const uniq = new Map();
  for(const b of books){
    const key = normalizeBookKey(b);
    if(!key) continue;
    if(!uniq.has(key)) uniq.set(key, b);
  }

  const list = Array.from(uniq.values());
  console.log(`Found ${list.length} unique books. Starting backfill...`);

  let ok = 0, fail = 0;
  for(let i = 0; i < list.length; i++){
    const book = list[i];
    const url = `${resolverBase}?q=${encodeURIComponent(book)}&withDesc=1`;
    try{
      const resp = await fetchWithTimeout(url, 8000);
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await resp.json().catch(()=>null);
      ok++;
      if((i+1) % 10 === 0) console.log(`Processed ${i+1}/${list.length}`);
    }catch(e){
      fail++;
      console.warn(`Failed: ${book} -> ${String(e)}`);
    }
    await sleep(350);
  }

  console.log(`Backfill complete. ok=${ok}, fail=${fail}`);
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function normalizeBookKey(s){
  try{
    const parts = parseBookParts(s);
    const t = String(parts.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const a = String(parts.author || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return a ? `${t} - ${a}` : t;
  }catch(_){ return String(s || '').toLowerCase().trim(); }
}

function parseBookParts(s){
  const raw = String(s || '').trim();
  if(raw.includes(' - ')){
    const parts = raw.split(' - ');
    return { title: parts[0].trim(), author: parts.slice(1).join(' - ').trim() };
  }
  const idx = raw.lastIndexOf('-');
  if(idx > 0) return { title: raw.slice(0, idx).trim(), author: raw.slice(idx + 1).trim() };
  return { title: raw, author: '' };
}

function getSheetsConfig(){
  const spreadsheetId = process.env.SUBMISSIONS_SHEET_ID || process.env.SHEETS_SPREADSHEET_ID || '1VCHJO67_pYjNWEceSRwb4jotF7GO3L8uFaLo3HUJmnk';
  const submissionsTab = process.env.SUBMISSIONS_TAB_NAME || 'Form Responses 1';
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if(!spreadsheetId || !saRaw) return null;
  const creds = parseServiceAccount(saRaw);
  return { spreadsheetId, submissionsTab, creds, projectId: creds.project_id || '' };
}

async function getSheetsClient(cfg){
  const auth = new google.auth.GoogleAuth({
    credentials: cfg.creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

function parseServiceAccount(raw){
  try{ if(raw.trim().startsWith('{')) return JSON.parse(raw); }catch(_){}
  try{
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  }catch(_){ }
  throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
}

async function fetchWithTimeout(url, timeoutMs){
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs || 4000);
  try{ return await fetch(url, { signal: ctrl.signal, redirect: 'follow' }); }
  finally{ clearTimeout(id); }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
