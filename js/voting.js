// Clean DOM-ready voting script (no stray markdown/code-fence text)
(function(){
  const STORAGE_KEY = 'slotMachineState';
  const WINNERS_KEY = 'winners';
  let slotBooks = [], slotNames = [];
  let spinning = [false,false,false];
  let intervals = [null,null,null];
  let chosenIdxs = [null,null,null];
  let offsets = [0,0,0];
  let chosenSet = new Set();
  let localStateSpun = false;

  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({spun:!!localStateSpun, chosenIdxs})); }
  function loadState(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
  function getAvailableIndices(){ const a=[]; for(let i=0;i<slotBooks.length;i++) if(!chosenSet.has(i)) a.push(i); return a; }

  // New: persist winners as full objects (title + suggestedBy)
  function saveWinners(){
    try{
      const winners = chosenIdxs.map(idx => {
        if(idx == null) return null;
        return { title: slotBooks[idx] || '', suggestedBy: slotNames[idx] || '' };
      });
      localStorage.setItem(WINNERS_KEY, JSON.stringify(winners));
    }catch(e){}
  }
  function clearWinners(){ try{ localStorage.removeItem(WINNERS_KEY); }catch(e){} }

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
    clearWinners(); // clear winners when starting a new spin
    for(let i=1;i<=3;i++){ const el = document.getElementById(`suggested${i}-name`); if(el) el.textContent = ''; }
    const available = getAvailableIndices();
    for(let i=0;i<3;i++) offsets[i] = Math.floor(Math.random() * Math.max(1, available.length));
    slotReels.forEach((r,i)=>{ r.classList.remove('winner'); renderScrollList(i, offsets[i]); });
    slotStopBtns.forEach(btn=>{ if(btn){ btn.classList.remove('d-none'); btn.disabled = false; btn.removeAttribute('disabled'); btn.classList.remove('disabled'); btn.style.pointerEvents = 'auto'; btn.tabIndex = 0; }});
    slotRespinBtns.forEach(b=>{ if(b){ b.classList.add('d-none'); b.disabled = true; }});
    spinning = [true,true,true];
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

    for(let j=0;j<3;j++){
      if(j===reelIdx) continue;
      if(spinning[j]){
        const avail = getAvailableIndices();
        if(!avail || avail.length === 0){ renderIdle(j); offsets[j] = 0; } else { offsets[j] = ((Number.isFinite(offsets[j])?Math.floor(offsets[j]):0) % avail.length + avail.length) % avail.length; renderScrollList(j, offsets[j]); }
      }
    }

    saveState();
    if(spinning.every(s=>!s)){
      // all stopped — persist winners for polling page
      saveWinners();
      if(slotSpinBtn){ slotSpinBtn.style.pointerEvents = 'auto'; slotSpinBtn.disabled = false; }
      if(slotResultDiv) slotResultDiv.innerHTML = '';
      saveState();
    }
    updateResetState();
  }

  function resetMachine(){
    localStateSpun = false; chosenIdxs = [null,null,null]; offsets = [0,0,0]; spinning = [false,false,false];
    intervals.forEach(i=>{ if(i) clearInterval(i); }); intervals = [null,null,null];
    chosenSet.clear();
    for(let i=1;i<=3;i++){ const el = document.getElementById(`suggested${i}-name`); if(el) el.textContent = ''; }
    if(slotResultDiv) slotResultDiv.textContent = '';
    localStorage.removeItem(STORAGE_KEY);
    clearWinners(); // remove persisted winners on reset
    slotReels.forEach((r,i)=>{ r.classList.remove('winner'); renderIdle(i); });
    slotStopBtns.forEach(btn=>{ if(btn){ btn.classList.remove('d-none'); btn.disabled = true; btn.setAttribute('disabled',''); btn.classList.add('disabled'); btn.style.pointerEvents = 'none'; btn.tabIndex = -1; }});
    slotRespinBtns.forEach(b=>{ if(b){ b.classList.add('d-none'); b.disabled = true; }});
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

    clearWinners(); // winners changed when respin starts
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
    const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLdPdPu4pwIwsAjADiCQOXYUJ8ACgWXaJn0DUVgNEy8ZZfc06EUGz2G9imE4gQ9FRs_zoDamhYTHhQ/pub?output=csv";
    fetch(CSV_URL)
      .then(r=>r.text()).then(csv=>{
        const parsed = parseCSV(csv);
        const data = parsed.length>0 ? parsed.slice(1) : [];
        slotBooks = []; slotNames = [];
        data.forEach(cols => {
          const book = (cols[1] || '').trim();
          const name = (cols[2] || '').trim();
          if(book){ slotBooks.push(book); slotNames.push(name); }
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
          // If we have chosenIdxs persisted, also ensure winners key exists for other pages
          if(chosenIdxs.every(v => v === null) === false){
            saveWinners();
          }
          updateResetState();
        }
      }).catch(()=>{ if(slotLoadingDiv) slotLoadingDiv.textContent="Failed to load book list."; slotReels.forEach((r,i)=>{ r.classList.remove('winner'); slotScrolls[i].innerHTML=`<div class="slot-scroll-list"><div class="slot-scroll-item">Error</div></div>`; }); slotStopBtns.forEach(b=>b.disabled=true); if(slotSpinBtn) slotSpinBtn.disabled=true; });
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
          localStorage.removeItem('winners');
          localStorage.removeItem('pollChoices');
        } catch (e) {}
        window.addEventListener('load', () => { if (typeof resetMachine === 'function') resetMachine(); });
      }
    })();

    if(slotSpinBtn){
      slotSpinBtn.addEventListener('click', function(){
        if(localStateSpun){ if(!slotSpinBtn.disabled) resetMachine(); } else { slotSpinBtn.style.transform='translateY(3px)'; setTimeout(()=>{ slotSpinBtn.style.transform=''; startSpin(); },120); }
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