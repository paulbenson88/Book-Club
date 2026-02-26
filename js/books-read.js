// Render Books Read from localStorage + seeded DOM rows.
(function(){
  function parseBookParts(raw){
    const s = String(raw||'').trim();
    if(s.includes(' - ')){
      const parts = s.split(' - ');
      return { title: parts[0].trim(), author: parts.slice(1).join(' - ').trim() };
    }
    const idx = s.lastIndexOf('-');
    if(idx > 0) return { title: s.slice(0, idx).trim(), author: s.slice(idx+1).trim() };
    return { title: s, author: '' };
  }
  function formatMonthFromDate(iso){
    try{ const d = new Date(iso); if(isNaN(d.getTime())) return ''; return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }); }catch(e){ return ''; }
  }
  function looksLikeDate(s){
    const v = String(s||'').trim();
    if(!v) return false;
    return /\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(v) || /\d{1,2}:\d{2}/.test(v);
  }
  function looksLikeMonthName(s){
    return /(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(String(s||''));
  }
  function looksLikeTitle(s){
    const v = String(s||'').trim();
    if(!v) return false;
    return /[a-zA-Z]/.test(v) && v.length > 2;
  }
  function normalizeEntry(item){
    const raw = item || {};
    const parts = parseBookParts(raw.title || raw.book || '');
    const month = raw.month || raw.chosenMonth || formatMonthFromDate(raw.date) || '';
    const author = raw.author || parts.author || '';
    const suggestedBy = raw.suggestedBy || raw.by || raw.suggester || '';
    return {
      month: String(month||'').trim(),
      title: String(parts.title || raw.title || raw.book || '').trim(),
      author: String(author||'').trim(),
      suggestedBy: String(suggestedBy||'').trim(),
      date: raw.date || ''
    };
  }
  function readSeedFromTable(){
    const rows = document.querySelectorAll('.books-read-table tbody tr');
    const seed = [];
    rows.forEach(tr=>{
      const tds = tr.querySelectorAll('td');
      if(tds.length < 4) return;
      seed.push({
        month: tds[0].textContent.trim(),
        title: tds[1].textContent.trim(),
        author: tds[2].textContent.trim(),
        suggestedBy: tds[3].textContent.trim()
      });
    });
    return seed;
  }
  function dedupe(list){
    const out = [];
    const seen = new Set();
    list.forEach(item=>{
      const key = (item.month+'|'+item.title).toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }
  function renderTable(list){
    const body = document.querySelector('.books-read-table tbody');
    if(!body) return;
    body.innerHTML = '';
    list.forEach(item=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.month || '—'}</td><td>${item.title || '—'}</td><td>${item.author || '—'}</td><td>${item.suggestedBy || '—'}</td>`;
      body.appendChild(tr);
    });
  }
  function renderMobile(list){
    const listEl = document.querySelector('.mobile-only .list-group');
    if(!listEl) return;
    listEl.innerHTML = '';
    list.forEach(item=>{
      const li = document.createElement('div');
      li.className = 'list-group-item';
      li.setAttribute('role','listitem');
      li.innerHTML = `
        <div class="d-flex w-100 flex-column">
          <div class="small text-muted">${item.month || '—'}</div>
          <h5 class="mb-1 mt-1">${item.title || '—'}</h5>
          <div class="small text-muted">Author: ${item.author || '—'}</div>
          <div class="small text-muted"><em>Suggested by:</em> ${item.suggestedBy || '—'}</div>
        </div>`;
      listEl.appendChild(li);
    });
  }

  async function fetchBooksReadCsv(){
    try{
      const url = window.booksReadCsvUrl || localStorage.getItem('booksReadCsvUrl') || '';
      if(!url) return null;
      const res = await fetch(url);
      if(!res.ok) return null;
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if(lines.length === 0) return null;
      const header = splitCsvLine(lines[0]).map(c => (c||'').toLowerCase());
      const hasHeader = header.some(c => c.includes('month') || c.includes('book') || c.includes('title') || c.includes('author') || c.includes('suggest'));
      let start = hasHeader ? 1 : 0;
      let idxMonth = 0, idxTitle = 1, idxAuthor = 2, idxSuggested = 3;
      if(hasHeader){
        const findIdx = (keys)=> header.findIndex(h => keys.some(k => h.includes(k)));
        const m = findIdx(['month']);
        const t = findIdx(['book','title']);
        const a = findIdx(['author']);
        const s = findIdx(['suggest']);
        if(m >= 0) idxMonth = m;
        if(t >= 0) idxTitle = t;
        if(a >= 0) idxAuthor = a;
        if(s >= 0) idxSuggested = s;
      }
      const rows = lines.slice(start).map(l => splitCsvLine(l));
      return rows.map(cols => {
        let month = (cols[idxMonth]||'').trim();
        let title = (cols[idxTitle]||'').trim();
        let author = (cols[idxAuthor]||'').trim();
        let suggestedBy = (cols[idxSuggested]||'').trim();

        // Heuristic: detect timestamp in month column and shift if next cell looks like month
        if(looksLikeDate(month) && looksLikeMonthName(cols[idxMonth+1])){
          month = String(cols[idxMonth+1]||'').trim();
          title = String(cols[idxMonth+2]||'').trim();
          author = String(cols[idxMonth+3]||'').trim();
          suggestedBy = String(cols[idxMonth+4]||'').trim();
        }

        // Heuristic: fix swapped columns from submissions CSV
        if(looksLikeDate(title) && suggestedBy && suggestedBy.includes(' - ') && looksLikeTitle(suggestedBy)){
          const parts = parseBookParts(suggestedBy);
          title = parts.title;
          author = parts.author;
          suggestedBy = author || '';
        }

        if(looksLikeDate(month) && !looksLikeMonthName(month)){
          const m = formatMonthFromDate(month);
          if(m) month = m;
        }

        return { month, title, author, suggestedBy };
      }).filter(r=> r.title);
    }catch(e){ return null; }
  }
  function splitCsvLine(line){
    const res = [];
    let cur = '', inQ = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"' ) { inQ = !inQ; continue; }
      if(ch === ',' && !inQ){ res.push(cur); cur=''; continue; }
      cur += ch;
    }
    res.push(cur);
    return res;
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const seed = readSeedFromTable().map(normalizeEntry).filter(e=> e.title);
    const csvRows = await fetchBooksReadCsv();
    const list = csvRows && csvRows.length ? csvRows.map(normalizeEntry) : seed;
    const combined = dedupe(list);
    renderTable(combined);
    renderMobile(combined);
  });
})();