// Clean DOM-ready voting script (no stray markdown/code-fence text)
(function(){
  const STORAGE_KEY = 'slotMachineState';
  let slotBooks = [], slotNames = [];
  let spinning = [false,false,false];
  let intervals = [null,null,null];
  let chosenIdxs = [null,null,null];
  let offsets = [0,0,0];
  let chosenSet = new Set();
  let localStateSpun = false;
  // If user taps SPIN before books finish loading, remember and start as soon as ready
  let pendingSpin = false;
  // BroadcastChannel for reliable same-origin cross-tab messaging (fallbacks to storage events remain)
  let _bc = null;
  try { _bc = new BroadcastChannel('book-club'); } catch(e) { _bc = null; }

  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({spun:!!localStateSpun, chosenIdxs})); }
  function loadState(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
  function getAvailableIndices(){ const a=[]; for(let i=0;i<slotBooks.length;i++) if(!chosenSet.has(i)) a.push(i); return a; }

  // Publish pollChoices derived from chosenIdxs
  function publishPoll(){
    try{
      const pollChoices = chosenIdxs.map(idx => {
        if(idx == null) return null;
        return { book: slotBooks[idx] || '', name: slotNames[idx] || '' };
      }).filter(Boolean);
      localStorage.setItem('pollChoices', JSON.stringify(pollChoices));
      try{ localStorage.setItem('pollPublishedAt', (new Date()).toISOString()); }catch(e){}
      console.log('[voting] publishPoll called, pollChoices=', pollChoices);
      // Push to Firestore if bridge available
      try{ if(window.fbSyncAvailable && typeof window.fbPublishPoll === 'function') window.fbPublishPoll(pollChoices); }catch(e){}
      // Notify same-window listeners via custom event
      try{ window.dispatchEvent(new CustomEvent('pollPublished', { detail: { pollChoices, publishedAt: localStorage.getItem('pollPublishedAt') } })); }catch(e){}
      // Broadcast the published pollChoices for cross-tab delivery
      try{ if(_bc) _bc.postMessage({ type: 'pollPublished', pollChoices, publishedAt: localStorage.getItem('pollPublishedAt') }); }catch(e){}
      // Clearing any reset flag because we now have new poll choices
      try{ localStorage.removeItem('slotMachineReset'); }catch(e){}
    }catch(e){}
  }

  function clearPoll(){
    try{ localStorage.removeItem('pollChoices'); }catch(e){}
    try{ localStorage.removeItem('pollPublishedAt'); }catch(e){}
    // Clear remote as well
    try{ if(window.fbSyncAvailable && typeof window.fbClearPoll === 'function') window.fbClearPoll(); }catch(e){}
    try{ window.dispatchEvent(new Event('pollCleared')); }catch(e){}
    try{ if(_bc) _bc.postMessage({ type: 'pollCleared' }); }catch(e){}
  }

  // Expose admin helpers so admin page can trigger publish/clear explicitly
  try{ window.adminPublishPoll = publishPoll; window.adminClearPoll = clearPoll; }catch(e){}

  // Announce a final winner to viewers, clear the poll choices, and broadcast the event
  function announceWinner(book, suggestedBy){
    try{
      const payload = { book: String(book||'').trim(), suggestedBy: String(suggestedBy||'').trim(), when: (new Date()).toISOString() };
      try{ localStorage.setItem('pollWinner', JSON.stringify(payload)); }catch(e){}
      try{ localStorage.removeItem('pollChoices'); }catch(e){}
      try{ localStorage.removeItem('pollPublishedAt'); }catch(e){}
      // Push to Firestore
      try{ if(window.fbSyncAvailable && typeof window.fbAnnounceWinner === 'function') window.fbAnnounceWinner(payload.book, payload.suggestedBy); }catch(e){}
      try{ window.dispatchEvent(new CustomEvent('pollWinner', { detail: payload })); }catch(e){}
      try{ if(_bc) _bc.postMessage({ type: 'pollWinner', winner: payload }); }catch(e){}
      // also notify same-window listeners that pollChoices were cleared
      try{ window.dispatchEvent(new Event('pollCleared')); }catch(e){}
      console.log('[voting] announceWinner', payload);
    }catch(e){ console.warn('[voting] announceWinner failed', e); }
  }

  // Start a fresh voting session: clear winner, clear pollChoices and reset machine
  function startNewSession(){
    try{
      try{ localStorage.removeItem('pollWinner'); }catch(e){}
      try{ localStorage.removeItem('pollChoices'); }catch(e){}
      try{ localStorage.removeItem('pollPublishedAt'); }catch(e){}
      // Clear remote as well
      try{ if(window.fbSyncAvailable && typeof window.fbClearPoll === 'function') window.fbClearPoll(); }catch(e){}
      try{ localStorage.removeItem('finalized'); }catch(e){}
      try{ window.dispatchEvent(new Event('pollCleared')); }catch(e){}
      try{ if(_bc) _bc.postMessage({ type: 'pollCleared' }); }catch(e){}
      // Attempt to call resetMachine if available
      try{ if(typeof resetMachine === 'function') resetMachine(); }catch(e){}
      console.log('[voting] startNewSession invoked');
    }catch(e){ console.warn('[voting] startNewSession failed', e); }
  }

  // Expose winner/session helpers to admin page
  try{ window.adminAnnounceWinner = announceWinner; window.adminStartNewSession = startNewSession; }catch(e){}

  // DOM variables (assigned after DOM ready)
  let slotScrolls, slotReels, slotStopBtns, slotRespinBtns, slotSpinBtn, slotResultDiv, slotLoadingDiv;

  function parseCSV(text){
    const lines = text.split(/\r?\n/);
    const out = [];
    for(const line of lines){
      const cols = []; let cur = ""; let inQuotes = false;
      for(let i=0;i<line.length;i++){
        const ch = line[i];
        if(ch === '"'){
          if(inQuotes && line[i+1] === '"'){ cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if(ch === ',' && !inQuotes){ cols.push(cur); cur = ""; }
        else cur += ch;
      }
      cols.push(cur);
      out.push(cols);
    }
    return out;
  }

  function renderScrollList(reelIdx, offset=0, stopped=false){
    const scroll = slotScrolls[reelIdx]; if(!scroll) return;
    scroll.innerHTML = '';
    const list = document.createElement('div'); list.className = 'slot-scroll-list';
    if(stopped){
      const item = document.createElement('div'); item.className = 'slot-scroll-item'; item.style.borderBottom='none'; item.textContent = slotBooks[offset] || '';
      list.appendChild(item);
    } else {
      const available = getAvailableIndices();
      if(!available || available.length === 0){
        const item = document.createElement('div'); item.className = 'slot-scroll-item'; item.textContent = '—'; list.appendChild(item);
      } else {
        for(let i=0;i<5;i++){
          const idxInAvailable = (offset + i) % available.length;
          const originalIdx = available[idxInAvailable];
          const item = document.createElement('div'); item.className = 'slot-scroll-item'; item.textContent = slotBooks[originalIdx] || '';
          list.appendChild(item);
        }
      }
    }
    scroll.appendChild(list);
  }

  function renderIdle(reelIdx){
    const scroll = slotScrolls[reelIdx]; if(!scroll) return;
    scroll.innerHTML = '';
    const list = document.createElement('div'); list.className = 'slot-scroll-list';
    const item = document.createElement('div'); item.className = 'slot-scroll-item';
    item.style.borderBottom = 'none'; item.style.textAlign = 'center'; item.style.color = '#666';
    item.textContent = 'Waiting for spin...';
    list.appendChild(item);
    scroll.appendChild(list);
  }

  function updateResetState(){
    if(!slotSpinBtn) return;
    const anyChosen = chosenIdxs.some(v=>v!==null && v!==undefined);
    if(!localStateSpun || !anyChosen){
      slotSpinBtn.textContent = 'SPIN';
      slotSpinBtn.classList.remove('reset-btn'); slotSpinBtn.classList.add('spin-center-btn');
      slotSpinBtn.disabled = slotBooks.length < 3;
      slotSpinBtn.style.pointerEvents = slotSpinBtn.disabled ? 'none' : 'auto';
      return;
    }
    const allStopped = slotStopBtns.every(b => b && b.disabled);
    slotSpinBtn.textContent = 'Reset';
    slotSpinBtn.classList.remove('spin-center-btn'); slotSpinBtn.classList.add('reset-btn');
    slotSpinBtn.disabled = !allStopped; slotSpinBtn.style.pointerEvents = slotSpinBtn.disabled ? 'none' : 'auto';
  }

  function startReelScroll(reelIdx){
    if(intervals[reelIdx]) clearInterval(intervals[reelIdx]);
    return setInterval(()=> {
      const available = getAvailableIndices();
      if(!available || available.length === 0){ renderIdle(reelIdx); return; }
      offsets[reelIdx] = Number.isFinite(offsets[reelIdx]) ? Math.floor(offsets[reelIdx]) : 0;
      offsets[reelIdx] = ((offsets[reelIdx]+1) % available.length + available.length) % available.length;
      renderScrollList(reelIdx, offsets[reelIdx]);
    }, 180);
  }

  function startSpin(){
    if(slotBooks.length < 3) return;
    if(slotResultDiv) slotResultDiv.textContent = '';
    chosenIdxs = [null,null,null];
    chosenSet.clear();
  // clear any previously published pollChoices when a new spin starts
  try{ clearPoll(); }catch(e){ try{ localStorage.removeItem('pollChoices'); }catch(e){} }
  // also remove any publish preview UI if present
  try{ clearPublishPreview(); }catch(e){}
    for(let i=1;i<=3;i++){ const el = document.getElementById(`suggested${i}-name`); if(el) el.textContent = ''; }
    const available = getAvailableIndices();
    for(let i=0;i<3;i++) offsets[i] = Math.floor(Math.random() * Math.max(1, available.length));
    slotReels.forEach((r,i)=>{ r.classList.remove('winner'); renderScrollList(i, offsets[i]); });
    slotStopBtns.forEach(btn=>{ if(btn){ btn.classList.remove('d-none'); btn.disabled = false; btn.removeAttribute('disabled'); btn.classList.remove('disabled'); btn.style.pointerEvents = 'auto'; btn.tabIndex = 0; }});
    slotRespinBtns.forEach(b=>{ if(b){ b.classList.add('d-none'); b.disabled = true; }});
    spinning = [true,true,true];
  // hide any Edit buttons while a spin is in progress
  try{ document.querySelectorAll('.edit-choice').forEach(b=>{ if(b) b.classList.add('d-none'); }); }catch(e){}
    if(slotSpinBtn){ slotSpinBtn.style.pointerEvents = 'none'; slotSpinBtn.disabled = true; }
    localStateSpun = true; saveState(); updateResetState();
    intervals[0] = startReelScroll(0); intervals[1] = startReelScroll(1); intervals[2] = startReelScroll(2);
  }

  function stopReel(reelIdx){
    if(!spinning[reelIdx]) return;
    if(intervals[reelIdx]){ clearInterval(intervals[reelIdx]); intervals[reelIdx] = null; }
    const available = getAvailableIndices();
    if(!available || available.length === 0){
      spinning[reelIdx] = false;
      const btn = slotStopBtns[reelIdx]; if(btn){ btn.classList.add('d-none'); btn.disabled = true; btn.setAttribute('disabled',''); btn.classList.add('disabled'); btn.style.pointerEvents = 'none'; btn.tabIndex = -1; }
      renderIdle(reelIdx); updateResetState(); saveState(); return;
    }
    let curOffset = Number.isFinite(offsets[reelIdx]) ? Math.floor(offsets[reelIdx]) : 0;
    curOffset = ((curOffset % available.length) + available.length) % available.length;
    let idxInAvailable = ((curOffset + 2) % available.length + available.length) % available.length;
    let chosenOriginal = available[idxInAvailable];
    if(chosenOriginal === undefined) chosenOriginal = available[Math.floor(Math.random()*available.length)];
    chosenIdxs[reelIdx] = chosenOriginal;
    const suggestedEl = document.getElementById(`suggested${reelIdx+1}-name`); if(suggestedEl) suggestedEl.textContent = slotNames[chosenOriginal] || '';
    chosenSet.add(chosenOriginal);
    spinning[reelIdx] = false;
    slotReels[reelIdx].classList.add('winner');
    const btn = slotStopBtns[reelIdx]; if(btn){ btn.classList.add('d-none'); btn.disabled = true; btn.setAttribute('disabled',''); btn.classList.add('disabled'); btn.style.pointerEvents = 'none'; btn.tabIndex = -1; }
    renderScrollList(reelIdx, chosenOriginal, true);

  const resp = document.querySelector(`.reel-respin[data-reel="${reelIdx}"]`);
    if(resp){ resp.classList.remove('d-none'); resp.disabled = false; }

    // Reveal the Edit button for this reel now that it has stopped
    try{
      const editBtn = document.querySelector(`.edit-choice[data-reel="${reelIdx}"]`);
      if(editBtn) editBtn.classList.remove('d-none');
    }catch(e){}

    for(let j=0;j<3;j++){
      if(j===reelIdx) continue;
      if(spinning[j]){
        const avail = getAvailableIndices();
        if(!avail || avail.length === 0){ renderIdle(j); offsets[j] = 0; } else { offsets[j] = ((Number.isFinite(offsets[j])?Math.floor(offsets[j]):0) % avail.length + avail.length) % avail.length; renderScrollList(j, offsets[j]); }
      }
    }

    saveState();
    if(spinning.every(s=>!s)){
  // all stopped — show admin preview and wait for explicit publish action
  try{ showPublishPreview(); }catch(e){ /* fallback to immediate publish */ publishPoll(); }
      if(slotSpinBtn){ slotSpinBtn.style.pointerEvents = 'auto'; slotSpinBtn.disabled = false; }
      if(slotResultDiv) slotResultDiv.innerHTML = '';
      saveState();
    }
    updateResetState();
  }

  // Publish preview helpers: show a preview of the three chosen books and publish button
  function clearPublishPreview(){
    try{ const prev = document.getElementById('publish-preview'); if(prev) prev.remove(); }catch(e){}
  }

  function showPublishPreview(){
    if(!slotResultDiv) return;
    clearPublishPreview();
    const container = document.createElement('div'); container.id = 'publish-preview'; container.className = 'card shadow-sm mt-3';
    const body = document.createElement('div'); body.className = 'card-body';
    const title = document.createElement('h3'); title.className = 'h6'; title.textContent = 'Preview poll choices';
    body.appendChild(title);
    const list = document.createElement('div'); list.className = 'publish-list mb-3';
    for(let i=0;i<3;i++){
      const idx = chosenIdxs[i];
      const text = (idx!=null && slotBooks[idx]) ? (slotBooks[idx] + (slotNames[idx] ? ' — ' + slotNames[idx] : '')) : '(Missing)';
      const item = document.createElement('div'); item.className = 'mb-2'; item.textContent = `${i+1}. ${text}`;
      list.appendChild(item);
    }
    body.appendChild(list);
    const actions = document.createElement('div'); actions.className = 'd-flex gap-2';
  const publishBtn = document.createElement('button'); publishBtn.type = 'button'; publishBtn.className = 'btn btn-success'; publishBtn.textContent = 'Submit choices and create poll';
  publishBtn.addEventListener('click', ()=>{
    try{ publishPoll(); }catch(e){}
    try{ clearPublishPreview(); }catch(e){}
    try{
      // Prefer the site-styled modal if available (on admin page); otherwise fallback to native confirm
      let url = '';
      try{ const inp = document.getElementById('pollLink'); if(inp && inp.value) url = inp.value; }catch(e){}
      if(!url){ try{ url = window.adminPollUrl || ''; }catch(e){} }
      if(!url) url = 'pages/voting_poll.html';
      if(typeof window.showOpenPollConfirm === 'function'){
        window.showOpenPollConfirm(url);
      } else {
        const want = confirm('Open the voting poll in a new tab now?');
        if(want){ const w = window.open(url, '_blank'); try{ if(w) w.opener = null; }catch(_e){} }
      }
    }catch(_e){}
  });
    const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-outline-secondary'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', ()=>{ try{ clearPublishPreview(); }catch(e){} });
    actions.appendChild(publishBtn); actions.appendChild(cancelBtn);
    body.appendChild(actions);
    container.appendChild(body);
    slotResultDiv.appendChild(container);
  }

  function resetMachine(){
    localStateSpun = false; chosenIdxs = [null,null,null]; offsets = [0,0,0]; spinning = [false,false,false];
    intervals.forEach(i=>{ if(i) clearInterval(i); }); intervals = [null,null,null];
    chosenSet.clear();
    for(let i=1;i<=3;i++){ const el = document.getElementById(`suggested${i}-name`); if(el) el.textContent = ''; }
    if(slotResultDiv) slotResultDiv.textContent = '';
    localStorage.removeItem(STORAGE_KEY);
  // mark that the machine was reset so other pages can react (e.g., clear poll votes)
  try{ localStorage.setItem('slotMachineReset', '1'); }catch(e){}
    clearPoll(); // remove persisted pollChoices on reset
    slotReels.forEach((r,i)=>{ r.classList.remove('winner'); renderIdle(i); });
    slotStopBtns.forEach(btn=>{ if(btn){ btn.classList.remove('d-none'); btn.disabled = true; btn.setAttribute('disabled',''); btn.classList.add('disabled'); btn.style.pointerEvents = 'none'; btn.tabIndex = -1; }});
    slotRespinBtns.forEach(b=>{ if(b){ b.classList.add('d-none'); b.disabled = true; }});
  // hide edit buttons on reset
  try{ document.querySelectorAll('.edit-choice').forEach(b=>{ if(b) b.classList.add('d-none'); }); }catch(e){}
    if(slotSpinBtn){ slotSpinBtn.disabled = false; slotSpinBtn.style.pointerEvents = 'auto'; }
    updateResetState();
  }

  function respinReel(reelIdx){
    if(spinning[reelIdx] || slotBooks.length < 3) return;
    if(chosenIdxs[reelIdx] != null){ chosenSet.delete(chosenIdxs[reelIdx]); chosenIdxs[reelIdx] = null; }
    const sEl = document.getElementById(`suggested${reelIdx+1}-name`); if(sEl) sEl.textContent = '';
    slotReels[reelIdx].classList.remove('winner');

    const respBtn = document.querySelector(`.reel-respin[data-reel="${reelIdx}"]`);
    if(respBtn){ respBtn.classList.add('d-none'); respBtn.disabled = true; }

    // Hide the Edit button for this reel while respinning to avoid accidental replacements
    try{
      const editBtn = document.querySelector(`.edit-choice[data-reel="${reelIdx}"]`);
      if(editBtn) editBtn.classList.add('d-none');
    }catch(e){}

  clearPoll(); // pollChoices changed when respin starts
    const available = getAvailableIndices();
    offsets[reelIdx] = Math.floor(Math.random() * Math.max(1, available.length));
    spinning[reelIdx] = true;

  const stop = slotStopBtns[reelIdx];
    if(stop){ stop.classList.remove('d-none'); stop.disabled = false; stop.removeAttribute('disabled'); stop.classList.remove('disabled'); stop.style.pointerEvents = 'auto'; stop.tabIndex = 0; }

    if(intervals[reelIdx]){ clearInterval(intervals[reelIdx]); intervals[reelIdx] = null; }
    intervals[reelIdx] = startReelScroll(reelIdx);

    for(let j=0;j<3;j++){
      if(j===reelIdx) continue;
      if(spinning[j]){
        const avail = getAvailableIndices();
        if(!avail || avail.length === 0){ renderIdle(j); offsets[j] = 0; } else { offsets[j] = ((Number.isFinite(offsets[j])?Math.floor(offsets[j]):0) % avail.length + avail.length) % avail.length; renderScrollList(j, offsets[j]); }
      }
    }

    localStateSpun = true; saveState(); updateResetState();
  }

  function loadBooksAndRestore(){
    const DEFAULT_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLdPdPu4pwIwsAjADiCQOXYUJ8ACgWXaJn0DUVgNEy8ZZfc06EUGz2G9imE4gQ9FRs_zoDamhYTHhQ/pub?output=csv";
    const candidates = [
      (window.sheetCsvUrl || '').trim(),
      DEFAULT_CSV_URL,
      '../sheet.csv'
    ].filter(Boolean);

    function tryFetch(i){
      if(i >= candidates.length) return Promise.reject(new Error('no csv sources'));
      return fetch(candidates[i]).then(r=>{
        if(!r.ok) throw new Error('http '+r.status);
        return r.text();
      }).catch(()=> tryFetch(i+1));
    }

    tryFetch(0)
      .then(csv=>{
        const parsed = parseCSV(csv);
        if(!parsed || parsed.length === 0) throw new Error('empty csv');
        const header = parsed[0].map(c=> String(c||'').toLowerCase());
        const hasHeader = header.some(c=> c.includes('book') || c.includes('title') || c.includes('author') || c.includes('suggest') || c.includes('name'));
        let start = hasHeader ? 1 : 0;
        let titleIdx = 1, nameIdx = 2;
        if(hasHeader){
          const t = header.findIndex(h=> h.includes('book') || h.includes('title'));
          const n = header.findIndex(h=> h.includes('suggest') || h.includes('name'));
          titleIdx = t >= 0 ? t : titleIdx;
          nameIdx = n >= 0 ? n : nameIdx;
        }
        const data = parsed.length>start ? parsed.slice(start) : [];
        slotBooks = []; slotNames = [];
        function splitTitleAndAuthor(rawTitle, rawAuthor){
          let title = (rawTitle || '').trim();
          let author = (rawAuthor || '').trim();
          if(!author){
            // Prefer dash separator: "Title - Author"
            const dashRe = /\s*-\s*/;
            if(dashRe.test(title)){
              const parts = title.split(dashRe);
              title = parts.slice(0,1).join('-').trim();
              author = parts.slice(1).join('-').trim();
            } else {
              // Fallback to ' by ' (case-insensitive)
              const byMatch = title.match(/\s+by\s+/i);
              if(byMatch){
                const parts = title.split(/\s+by\s+/i);
                title = parts[0].trim();
                author = parts.slice(1).join(' by ').trim();
              }
            }
          }
          return { title, author };
        }

        data.forEach(cols => {
          const rawBook = (cols[titleIdx] || '').trim();
          const rawName = (cols[nameIdx] || '').trim();
          const parsed = splitTitleAndAuthor(rawBook, rawName);
          if(parsed.title){ slotBooks.push(parsed.title); slotNames.push(parsed.author); }
        });
        if(slotLoadingDiv) slotLoadingDiv.style.display='none';
        for(let i=1;i<=3;i++){ const el=document.getElementById(`suggested${i}-name`); if(el) el.textContent=''; }

        const saved = loadState();
        if(saved && Array.isArray(saved.chosenIdxs)){
          chosenIdxs = saved.chosenIdxs.slice(0,3).map(v=> (v===null||typeof v==='number')?v:null );
          chosenSet = new Set(chosenIdxs.filter(n=>n!==null));
          const anyChosen = chosenIdxs.some(v=>v!==null);
          if(saved.spun && (anyChosen || !chosenIdxs.every(v=>v===null))) localStateSpun = true; else localStateSpun = false;
        }

        if(slotBooks.length < 3){
          slotReels.forEach((r,i)=>{ r.classList.remove('winner'); slotScrolls[i].innerHTML=`<div class="slot-scroll-list"><div class="slot-scroll-item">No books!</div></div>`; });
          slotStopBtns.forEach(b=>b.disabled=true); if(slotSpinBtn) slotSpinBtn.disabled=true;
        } else {
          // If the user tapped SPIN while loading, honor it now that we can
          if(pendingSpin && !localStateSpun){ pendingSpin = false; try{ startSpin(); }catch(e){} }
          slotReels.forEach((r,i)=>{
            r.classList.remove('winner');
            if(chosenIdxs[i] != null && typeof chosenIdxs[i] === 'number' && slotBooks[chosenIdxs[i]]){
              renderScrollList(i, chosenIdxs[i], true);
              const suggestedEl = document.getElementById(`suggested${i+1}-name`); if(suggestedEl) suggestedEl.textContent = slotNames[chosenIdxs[i]] || '';
              r.classList.add('winner');
              const btn = slotStopBtns[i]; if(btn){ btn.classList.add('d-none'); btn.disabled=true; btn.setAttribute('disabled',''); btn.classList.add('disabled'); btn.style.pointerEvents='none'; btn.tabIndex=-1; }
              const resp = document.querySelector(`.reel-respin[data-reel="${i}"]`); if(resp){ resp.classList.remove('d-none'); resp.disabled=false; }
            } else {
              if(localStateSpun){
                const available = getAvailableIndices();
                offsets[i] = Math.floor(Math.random() * Math.max(1, available.length));
                renderScrollList(i, offsets[i]);
                slotStopBtns[i].classList.remove('d-none'); slotStopBtns[i].disabled=false; slotStopBtns[i].removeAttribute('disabled'); slotStopBtns[i].classList.remove('disabled'); slotStopBtns[i].style.pointerEvents='auto'; slotStopBtns[i].tabIndex=0;
                spinning[i]=true; if(!intervals[i]) intervals[i]=startReelScroll(i);
              } else {
                renderIdle(i);
                slotStopBtns[i].classList.remove('d-none'); slotStopBtns[i].disabled=true;
                const resp = document.querySelector(`.reel-respin[data-reel="${i}"]`); if(resp){ resp.classList.add('d-none'); resp.disabled=true; }
              }
            }
          });
          // If we have chosenIdxs persisted, do NOT auto-publish here.
          // Publishing must be an explicit admin action (publishPoll is exposed to admin page).
          if(chosenIdxs.every(v => v === null) === false){
            console.log('[voting] chosenIdxs restored but auto-publish disabled; admin must explicitly publish the poll');
          }
          updateResetState();
        }
        }).catch(()=>{ if(slotLoadingDiv) slotLoadingDiv.textContent="Failed to load book list."; slotReels.forEach((r,i)=>{ r.classList.remove('winner'); slotScrolls[i].innerHTML=`<div class=\"slot-scroll-list\"><div class=\"slot-scroll-item\">Error</div></div>`; }); slotStopBtns.forEach(b=>b.disabled=true); if(slotSpinBtn) slotSpinBtn.disabled=true; });
  }

  function initAfterDom(){
    slotScrolls = [document.getElementById('slotScroll1'), document.getElementById('slotScroll2'), document.getElementById('slotScroll3')];
    slotReels = [document.getElementById('slot1'), document.getElementById('slot2'), document.getElementById('slot3')];
    slotStopBtns = [document.getElementById('slotStopBtn1'), document.getElementById('slotStopBtn2'), document.getElementById('slotStopBtn3')];
    slotRespinBtns = Array.from(document.querySelectorAll('.reel-respin'));
    slotSpinBtn = document.getElementById('slotSpinBtn');
    slotResultDiv = document.getElementById('slotResult');
    slotLoadingDiv = document.getElementById('slotLoading');

    if (slotSpinBtn) slotSpinBtn.disabled = true;

    (function() {
      const host = location.hostname || '';
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' || host.startsWith('192.168.');
      const forceReset = location.search.includes('resetSlot=1') || location.search.includes('resetState=1');
      if (isLocal || forceReset) {
        try {
          localStorage.removeItem('slotMachineState');
          localStorage.removeItem('pollChoices');
        } catch (e) {}
        window.addEventListener('load', () => { if (typeof resetMachine === 'function') resetMachine(); });
      }
    })();

    if(slotSpinBtn){
      slotSpinBtn.addEventListener('click', function(){
        if(localStateSpun){
          if(!slotSpinBtn.disabled) resetMachine();
        } else {
          // If books not yet loaded, queue a spin so first tap counts when ready
          if(slotBooks.length < 3){
            pendingSpin = true;
            try{ if(typeof showAdminToast === 'function') showAdminToast('Still loading… will spin as soon as ready'); }catch(e){}
            return;
          }
          slotSpinBtn.style.transform='translateY(3px)';
          setTimeout(()=>{ slotSpinBtn.style.transform=''; startSpin(); },120);
        }
      });
    }

    slotStopBtns.forEach((btn,i)=>{ if(btn) btn.addEventListener('click', ()=> stopReel(i)); });
    slotRespinBtns.forEach(btn => {
      const idx = Number(btn.getAttribute('data-reel'));
      btn.addEventListener('click', () => respinReel(idx));
    });

    loadBooksAndRestore();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAfterDom);
  } else {
    initAfterDom();
  }
})();