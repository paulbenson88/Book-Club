// Small placeholder to keep behavior consistent. Extend as needed.
(function(){
  function renderList(){
    const container = document.getElementById('books-list');
    const stored = JSON.parse(localStorage.getItem('booksRead') || '[]');
    container.innerHTML = '';
    if(!stored || stored.length===0){ container.innerHTML = '<div class="text-muted small">No entries yet.</div>'; return; }
    stored.forEach(item=>{
      const row = document.createElement('div'); row.className='mb-2';
      row.innerHTML = `<strong>${item.title}</strong><div class="text-muted small">Read by: ${item.by || '—'}</div>`;
      container.appendChild(row);
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    renderList();
    const addBtn = document.getElementById('addBookBtn');
    if(addBtn) addBtn.addEventListener('click', ()=>{
      const title = prompt('Book title:');
      if(!title) return;
      const by = prompt('Who read it / notes:') || '';
      const arr = JSON.parse(localStorage.getItem('booksRead') || '[]');
      arr.push({ title, by, date: new Date().toISOString() });
      localStorage.setItem('booksRead', JSON.stringify(arr));
      renderList();
    });
    const exportBtn = document.getElementById('exportBtn');
    if(exportBtn) exportBtn.addEventListener('click', ()=>{
      const arr = JSON.parse(localStorage.getItem('booksRead') || '[]');
      const csv = arr.map(r => `"${(r.title||'').replace(/"/g,'""')}","${(r.by||'').replace(/"/g,'""')}"`).join("\n");
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'books-read.csv'; a.click();
      URL.revokeObjectURL(url);
    });
  });
})();