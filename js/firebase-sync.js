// Lightweight Firebase sync bridge. Safe no-op if config or SDK missing.
(function(){
  const w = window;
  function log(){ try{ console.log.apply(console, ['[firebase-sync]'].concat([].slice.call(arguments))); }catch(e){}
  }
  function warn(){ try{ console.warn.apply(console, ['[firebase-sync]'].concat([].slice.call(arguments))); }catch(e){}
  }

  // Detect compat SDK and config
  const hasCompat = !!(w.firebase && w.firebase.initializeApp);
  const cfg = w.FIREBASE_CONFIG || null;
  if(!hasCompat || !cfg){
    w.fbSyncAvailable = false;
    w.fbPublishPoll = function(){ log('no-op publish (no Firebase)'); };
    w.fbClearPoll = function(){ log('no-op clear (no Firebase)'); };
    w.fbAnnounceWinner = function(){ log('no-op winner (no Firebase)'); };
    w.fbSubscribe = function(){ log('no-op subscribe (no Firebase)'); return function(){}; };
    return;
  }

  try{
    const app = w.firebase.apps && w.firebase.apps.length ? w.firebase.app() : w.firebase.initializeApp(cfg);
    const db = w.firebase.firestore();
    w.fbSyncAvailable = true;

    async function ensureAuth(){
      try{
        if(w.firebase && w.firebase.auth){
          const auth = w.firebase.auth();
          if(!auth.currentUser){
            try{ await auth.signInAnonymously(); }catch(e){ warn('anonymous sign-in failed (enable Anonymous auth in Firebase console)', e); }
          }
        }
      }catch(e){ /* ignore */ }
    }

    // Single doc for the current session. Allow overriding via FIREBASE_POLL_DOC.
    const coll = cfg.POLL_COLLECTION || 'polls';
    const docId = cfg.POLL_DOC || 'current';
  const docRef = db.collection(coll).doc(docId);
  function votesCol(){ return docRef.collection('votes'); }
  function runoffVotesCol(){ return docRef.collection('runoffVotes'); }

    function sanitizePollChoices(pcs){
      if(!Array.isArray(pcs)) return [];
      return pcs.map(p=>({ book: String((p && (p.book||p.title||p.display||''))||'').trim(), name: String((p && (p.name||p.suggestedBy||''))||'').trim() })).filter(p=>p.book);
    }

  w.fbPublishPoll = async function(pollChoices){
      try{
    await ensureAuth();
        const pcs = sanitizePollChoices(pollChoices);
        const payload = { pollChoices: pcs, pollPublishedAt: new Date().toISOString(), winner: null, runoff: null };
        await docRef.set(payload, { merge: true });
        // Clear previous votes (both regular and runoff) at publish time
        try{
          const snaps = await votesCol().get();
          const batch = db.batch();
          snaps.forEach(d=> batch.delete(d.ref));
          await batch.commit();
        }catch(e){}
        try{
          const snaps2 = await runoffVotesCol().get();
          const batch2 = db.batch();
          snaps2.forEach(d=> batch2.delete(d.ref));
          await batch2.commit();
        }catch(e){}
        log('published', payload);
      }catch(e){ warn('publish failed', e); }
    };

    w.fbClearPoll = async function(){
      try{
        await ensureAuth();
        await docRef.set({ pollChoices: [], pollPublishedAt: null, winner: null, runoff: null }, { merge: true });
        // Clear all votes collections
        try{ const snaps = await votesCol().get(); const batch = db.batch(); snaps.forEach(d=> batch.delete(d.ref)); await batch.commit(); }catch(e){}
        try{ const snaps2 = await runoffVotesCol().get(); const batch2 = db.batch(); snaps2.forEach(d=> batch2.delete(d.ref)); await batch2.commit(); }catch(e){}
        log('cleared');
      }catch(e){ warn('clear failed', e); }
    };

    w.fbAnnounceWinner = async function(book, suggestedBy){
      try{
        await ensureAuth();
        const payload = { winner: { book: String(book||'').trim(), suggestedBy: String(suggestedBy||'').trim(), when: new Date().toISOString() } };
        await docRef.set(payload, { merge: true });
        log('winner', payload);
      }catch(e){ warn('winner failed', e); }
    };

    w.fbSubscribe = function(onChange){
      try{
    return docRef.onSnapshot((snap)=>{
          const data = snap && snap.data ? snap.data() : (snap && snap.exists ? snap.data() : null);
          const d = snap && snap.exists ? (data || {}) : {};
          const out = { pollChoices: Array.isArray(d.pollChoices) ? d.pollChoices : [], pollPublishedAt: d.pollPublishedAt || null, winner: d.winner || null, runoff: d.runoff || null };
          onChange && onChange(out);
        }, (err)=> warn('snapshot error', err));
      }catch(e){ warn('subscribe failed', e); return function(){}; }
    };

    // One-time fetch of current poll document state
    w.fbGetState = async function(){
      try{
        const snap = await docRef.get();
        if(!snap.exists) return { pollChoices: [], pollPublishedAt: null, winner: null, runoff: null };
        const d = snap.data()||{};
        return { pollChoices: Array.isArray(d.pollChoices)?d.pollChoices:[], pollPublishedAt: d.pollPublishedAt||null, winner: d.winner||null, runoff: d.runoff||null };
      }catch(e){ warn('getState failed', e); return { pollChoices: [], pollPublishedAt: null, winner: null, runoff: null }; }
    };

    // Runoff: start/end and voting
    w.fbStartRunoff = async function(choices, endsAt, maxOne){
      try{
        await ensureAuth();
        const pcs = Array.isArray(choices) ? choices.map(c=>({ book: String((c&&c.book)||c||'').trim(), name: String((c&&c.name)||'' ) })) : [];
        const payload = { runoff: { active: true, choices: pcs, endsAt: endsAt || null, maxOne: !!maxOne } };
        await docRef.set(payload, { merge: true });
        log('runoff started', payload);
      }catch(e){ warn('startRunoff failed', e); }
    };
    w.fbEndRunoff = async function(){
      try{ await ensureAuth(); await docRef.set({ runoff: { active:false } }, { merge: true }); log('runoff ended'); }catch(e){ warn('endRunoff failed', e); }
    };
    w.fbSetRunoffVote = async function(voterName, book){
      try{
        await ensureAuth();
        const id = String(voterName||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'_').slice(0,64) || ('anon_'+Date.now());
        await runoffVotesCol().doc(id).set({ voter: voterName, book: String(book||'').trim(), at: new Date().toISOString() }, { merge: true });
        log('runoff vote set', voterName, book);
      }catch(e){ warn('setRunoffVote failed', e); }
    };
    w.fbSubscribeRunoffVotes = function(onChange){
      try{
        return runoffVotesCol().onSnapshot((qs)=>{
          const namesByBook = Object.create(null);
          qs.forEach(doc=>{
            const d = doc.data()||{};
            const b = (d.book||'').trim();
            const v = (d.voter||'').trim();
            if(!b || !v) return;
            if(!namesByBook[b]) namesByBook[b] = [];
            if(!namesByBook[b].includes(v)) namesByBook[b].push(v);
          });
          log('runoff votes snapshot', namesByBook);
          onChange && onChange(namesByBook);
        }, (err)=> warn('runoff votes snapshot error', err));
      }catch(e){ warn('subscribeRunoffVotes failed', e); return function(){}; }
    };

    // Regular poll voting: store a voter's current selections as a set of books
  w.fbSetVotes = async function(voterName, books){
      try{
        await ensureAuth();
        const id = String(voterName||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'_').slice(0,64) || ('anon_'+Date.now());
        const arr = Array.isArray(books) ? books.map(b=>String(b||'').trim()).filter(Boolean) : [];
    await votesCol().doc(id).set({ voter: voterName, books: arr, at: new Date().toISOString() }, { merge: true });
    log('votes set', id, voterName, arr);
      }catch(e){ warn('setVotes failed', e); }
    };
    // Subscribe to regular votes and build names-by-book map
    w.fbSubscribeVotes = function(onChange){
      try{
        return votesCol().onSnapshot((qs)=>{
          const namesByBook = Object.create(null);
          qs.forEach(doc=>{
            const d = doc.data()||{}; const voter = (d.voter||'').trim(); const books = Array.isArray(d.books) ? d.books : []; if(!voter) return;
            books.forEach(b=>{ const book = String(b||'').trim(); if(!book) return; if(!namesByBook[book]) namesByBook[book]=[]; if(!namesByBook[book].includes(voter)) namesByBook[book].push(voter); });
          });
          log('votes snapshot', namesByBook);
          onChange && onChange(namesByBook);
        }, (err)=> warn('votes snapshot error', err));
      }catch(e){ warn('subscribeVotes failed', e); return function(){}; }
    };
    // Helpers to compute summary counts (optional)
    w.fbGetVotesSummary = async function(){
      const qs = await votesCol().get(); const counts = Object.create(null);
      qs.forEach(doc=>{ const d=doc.data()||{}; (Array.isArray(d.books)?d.books:[]).forEach(b=>{ const k=String(b||'').trim(); if(!k) return; counts[k]=(counts[k]||0)+1; }); }); return counts;
    };
    w.fbGetRunoffVotesSummary = async function(){
      const qs = await runoffVotesCol().get(); const counts = Object.create(null);
      qs.forEach(doc=>{ const d=doc.data()||{}; const k=String(d.book||'').trim(); if(!k) return; counts[k]=(counts[k]||0)+1; }); return counts;
    };
  }catch(e){ warn('init failed', e); }
})();
