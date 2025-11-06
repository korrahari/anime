(() => {
  const raw = document.getElementById('anime-data')?.textContent || '[]';
  let anime = JSON.parse(raw);
  const EMBEDDED = JSON.parse(raw);
  // custom entries persisted separately
  const CUSTOM_KEY = 'myworld_custom';
  // assets manifest
  const ASSETS_MANIFEST = '/assets/manifest.json';
  // persisted local assets (data-urls or uploaded files)
  const ASSETS_KEY = 'myworld_assets';
  let assetsList = [];
  function loadAssets(){
    // try fetch manifest — works when served via http. When opened via file:// fallback to reading manifest element would be more complex; keep best-effort.
    fetch(ASSETS_MANIFEST).then(r=>{ if(!r.ok) throw new Error('no'); return r.json(); }).then(j=>{
      // merge fetched manifest with any locally persisted assets
      const fetched = j || [];
      const local = JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]');
      assetsList = fetched.concat(local || []);
      populateAssetSelector();
    }).catch(()=>{
      // try to fetch relative without leading slash
      fetch('assets/manifest.json').then(r=>r.json()).then(j=>{
        const fetched = j || [];
        const local = JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]');
        assetsList = fetched.concat(local || []);
        populateAssetSelector();
      }).catch(()=>{
        // silent failure — fallback to local only
        assetsList = JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]') || [];
        populateAssetSelector();
      });
    });
  }

  function populateAssetSelector(){
    const sel = document.getElementById('a-asset');
    if(!sel) return;
    if(!assetsList || assetsList.length === 0){
      sel.innerHTML = '<option value="">(no local assets)</option>';
      return;
    }
    sel.innerHTML = assetsList.map(a=>`<option value="${a.file}">${a.label || a.file}</option>`).join('');
    // refresh asset manager UI if present
    if(typeof renderAssetManager === 'function') try{ renderAssetManager(); }catch(e){}
  }

  // persist locally uploaded assets
  function saveLocalAssets(list){
    try{ localStorage.setItem(ASSETS_KEY, JSON.stringify(list || [])); }catch(e){/* ignore */}
  }

  // admin token stored in localStorage for API calls
  const ADMIN_TOKEN_KEY = 'myworld_admin_token';
  function getAdminToken(){ try{ return (document.getElementById('admin-token') && document.getElementById('admin-token').value) || localStorage.getItem(ADMIN_TOKEN_KEY) || ''; }catch(e){ return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } }
  function setAdminToken(val){ try{ localStorage.setItem(ADMIN_TOKEN_KEY, val || ''); if(document.getElementById('admin-token')) document.getElementById('admin-token').value = val || ''; }catch(e){} }

  // helper to add a new local asset (dataURL)
  function addLocalAsset(obj){
    const local = JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]');
    local.push(obj);
    saveLocalAssets(local);
    // merge into in-memory assetsList (append)
    assetsList = (assetsList || []).concat([obj]);
    populateAssetSelector();
    try{ renderAssetManager(); }catch(e){}
  }

  // asset manager helpers
  function getLocalAssets(){
    try{ return JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]') || []; }catch(e){ return []; }
  }
  function deleteLocalAssetByFile(fileVal){
    try{
      const local = getLocalAssets().filter(a => a.file !== fileVal && a.data !== fileVal);
      saveLocalAssets(local);
      // refresh in-memory list
      assetsList = (assetsList || []).filter(a => a.file !== fileVal && a.data !== fileVal);
      populateAssetSelector();
      renderAssetManager();
    }catch(e){}
  }
  function renameLocalAsset(fileVal, newLabel){
    try{
      const local = getLocalAssets();
      const it = local.find(a=>a.file === fileVal || a.data === fileVal);
      if(!it) return;
      it.label = newLabel || it.label || it.file;
      saveLocalAssets(local);
      // update in-memory assetsList
      const idx = assetsList.findIndex(a=>a.file === fileVal || a.data === fileVal);
      if(idx !== -1){ assetsList[idx].label = it.label; }
      populateAssetSelector();
      renderAssetManager();
    }catch(e){}
  }

  function renderAssetManager(){
    const el = document.getElementById('asset-manager');
    if(!el) return;
    const local = getLocalAssets();
    if(!local || local.length === 0){ el.innerHTML = '<div class="muted">No uploaded assets yet.</div>'; return; }
    el.innerHTML = local.map(a => `
      <div class="asset-item" data-file="${a.file}">
        <img src="${a.data || a.file}" alt="${(a.label||a.file)}" />
        <div class="label" title="${(a.label||a.file)}">${(a.label||a.file)}</div>
        <div class="actions">
          <button class="asset-rename" data-file="${a.file}">Rename</button>
          <button class="asset-delete" data-file="${a.file}">Delete</button>
        </div>
      </div>
    `).join('');

    $$('.asset-delete', el).forEach(b => b.addEventListener('click', (e)=>{
      const f = b.dataset.file;
      if(!f) return;
      if(!confirm('Delete this uploaded asset?')) return;
      deleteLocalAssetByFile(f);
    }));

    $$('.asset-rename', el).forEach(b => b.addEventListener('click', (e)=>{
      const f = b.dataset.file;
      if(!f) return;
      const current = (getLocalAssets().find(x=>x.file===f)||{}).label || f;
      const nv = prompt('New name for asset', current);
      if(nv && nv.trim()) renameLocalAsset(f, nv.trim());
    }));
  }

  // Export current data (embedded snapshot + custom + favorites + local assets)
  function exportJSON(){
    try{
      const payload = {
        exportedAt: new Date().toISOString(),
        embedded: EMBEDDED,
        custom: getCustomFromStorage(),
        favorites: Array.from(favorites),
        assets: JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]') || []
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = `myworld-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }catch(e){ alert('Export failed: '+(e && e.message)); }
  }

  // Import JSON payload from file (merge safely)
  function importJSONFromText(text){
    try{
      const parsed = JSON.parse(text);
      // determine where custom entries might be
      let importedCustom = [];
      if(Array.isArray(parsed)) importedCustom = parsed;
      else if(parsed.custom && Array.isArray(parsed.custom)) importedCustom = parsed.custom;
      else if(parsed.items && Array.isArray(parsed.items)) importedCustom = parsed.items;

      // prepare dedupe maps from existing anime (embedded + custom)
      const existingCustom = getCustomFromStorage();
      const titleToId = {};
      anime.concat([]).forEach(a => { if(a && a.title) titleToId[(a.title||'').trim().toLowerCase()] = Number(a.id); });

      // compute current max id across anime
      const curMax = anime.reduce((m,a)=>Math.max(m, Number(a.id)||0), 0);
      let nextId = curMax + 1;

      // mapping from original imported id -> new assigned id (or existing id if deduped)
      const oldToNew = {};

      importedCustom.forEach(it => {
        try{
          const oldId = it && (it.id != null ? String(it.id) : null);
          const title = (it && it.title) ? String(it.title).trim() : '';
          const key = title.toLowerCase();
          if(key && titleToId[key]){
            // already exists locally — map oldId -> existing id and skip adding
            if(oldId) oldToNew[oldId] = titleToId[key];
            return;
          }
          // assign new id
          const copy = Object.assign({}, it);
          const assigned = nextId++;
          copy.id = assigned;
          // normalize minimal fields
          copy.title = copy.title || 'Imported Anime';
          copy.image = copy.image || copy.asset || `https://via.placeholder.com/200x300?text=${encodeURIComponent(copy.title)}`;
          copy.genres = Array.isArray(copy.genres) ? copy.genres : ((copy.genres||'').split && (copy.genres||'').split(',').map(s=>s.trim()).filter(Boolean)) || [];
          existingCustom.push(copy);
          if(key) titleToId[key] = assigned;
          if(oldId) oldToNew[oldId] = assigned;
        }catch(e){/* skip malformed item */}
      });

      // save merged custom
      saveCustom(existingCustom);

      // merge favorites if provided — map old ids to new ids where appropriate
      if(parsed.favorites && Array.isArray(parsed.favorites)){
        const curIds = new Set(anime.map(a=>String(a.id)));
        parsed.favorites.forEach(fid => {
          const sid = String(fid);
          if(oldToNew[sid]){
            favorites.add(Number(oldToNew[sid]));
          } else if(curIds.has(sid)){
            favorites.add(Number(sid));
          } // else ignore unknown id
        });
        saveFavs();
      }

      // merge assets if provided
      if(parsed.assets && Array.isArray(parsed.assets)){
        const local = JSON.parse(localStorage.getItem(ASSETS_KEY) || '[]');
        // avoid exact-duplicate data URLs and filenames
        parsed.assets.forEach(a => {
          try{
            const exists = local.find(x => x.file === a.file || x.data === a.data || (x.label && a.label && x.label === a.label));
            if(!exists) local.push(a);
          }catch(e){}
        });
        saveLocalAssets(local);
      }

      // rebuild runtime list and rerender
      loadCustom();
      renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel(); renderAdminList();
      // reload assets selector
      loadAssets();
      alert('Import complete — custom entries and assets merged.');
    }catch(e){ alert('Import failed: '+(e && e.message)); }
  }

  // handle file objects (images) -> read as dataURL and add as local assets
  function handleFilesAsAssets(files){
    Array.from(files).forEach(file => {
      if(!file.type || !file.type.startsWith('image')) return;
      const reader = new FileReader();
      reader.onload = function(ev){
        const data = ev.target.result;
        const obj = { file: data, label: file.name, data }; // keep both file and data for compatibility
        addLocalAsset(obj);
      };
      reader.readAsDataURL(file);
    });
  }
  function loadCustom(){
    // try to load custom entries from server first, fallback to localStorage
    try{
      fetch('/api/custom').then(r=>{ if(!r.ok) throw new Error('no'); return r.json(); }).then(list=>{
        if(Array.isArray(list)){
          localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
          anime = EMBEDDED.concat(list);
        } else {
          // fallback to local
          const rawC = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
          anime = Array.isArray(rawC) && rawC.length ? EMBEDDED.concat(rawC) : EMBEDDED.slice();
        }
        // re-render after load
        renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel(); renderAdminList();
      }).catch(()=>{
        const rawC = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
        if(Array.isArray(rawC) && rawC.length) anime = EMBEDDED.concat(rawC);
        else anime = EMBEDDED.slice();
      });
    }catch(e){
      const rawC = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
      if(Array.isArray(rawC) && rawC.length) anime = EMBEDDED.concat(rawC);
      else anime = EMBEDDED.slice();
    }
  }
  function saveCustom(items){
    try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(items)); }catch(e){}
  }

  // helper: POST a single custom item to server (create or update)
  async function postCustomToServer(item){
    try{
      const headers = {'Content-Type':'application/json'};
      const token = getAdminToken(); if(token) headers['x-admin-token'] = token;
      const resp = await fetch('/api/custom', {
        method: 'POST',
        headers,
        body: JSON.stringify(item)
      });
      if(!resp.ok) throw new Error('server error');
      return await resp.json();
    }catch(e){ throw e; }
  }

  async function deleteCustomOnServer(id){
    try{
      const headers = {};
      const token = getAdminToken(); if(token) headers['x-admin-token'] = token;
      const resp = await fetch(`/api/custom/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      return resp.ok;
    }catch(e){ return false; }
  }

  // State
  let state = {
    query: '',
    genre: null,
    sort: 'popular',
    favoritesOnly: false
  };

  // favorites persisted in localStorage
  const FAV_KEY = 'myworld_favs';
  let favorites = new Set();
  try{
    const rawFav = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    (rawFav || []).forEach(id => favorites.add(Number(id)));
  }catch(e){ favorites = new Set(); }

  function saveFavs(){ localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favorites))); }
  function isFav(id){ return favorites.has(Number(id)); }
  function toggleFav(id){
    const n = Number(id);
    if(favorites.has(n)) favorites.delete(n);
    else favorites.add(n);
    saveFavs();
  }

  // Utilities
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Renderers
  function renderSmallList(items){
    return items.map(it => `
      <div class="small-item">
        <img loading="lazy" src="${it.image}" alt="${it.title}" />
        <div class="meta">
          <div class="title">${it.title}</div>
          <div class="sub">${it.type} • ${it.episodes}</div>
        </div>
      </div>
    `).join('');
  }

  function renderCard(item){
    return `
      <div class="card" tabindex="0" role="button" aria-label="Open ${item.title} details" data-id="${item.id}">
        <button class="fav-btn ${isFav(item.id)?'active':''}" data-id="${item.id}" aria-label="Toggle favorite" aria-pressed="${isFav(item.id)?'true':'false'}">${isFav(item.id)?'❤':'♡'}</button>
        <img loading="lazy" src="${item.image}" alt="${item.title}" />
        <div class="title">${item.title}</div>
        <div class="sub">${item.genres.join(', ')} • ${item.type}</div>
      </div>
    `;
  }

  function renderSections(){
    const sectionsEl = $('#sections');
    if(!sectionsEl) return;

    // Top Airing
    const topAiring = anime.filter(a=>a.status && a.status.toLowerCase().includes('air')).sort((a,b)=>b.views-a.views).slice(0,5);
    const mostPopular = anime.slice().sort((a,b)=>b.views-a.views).slice(0,5);
    const mostFavorite = anime.slice().sort((a,b)=>b.favorites-(b.favorites?0:0)- (a.favorites||0)).slice(0,5);
    const latestCompleted = anime.filter(a=>/(completed|finished)/i.test(a.status)).slice(0,5);

    sectionsEl.innerHTML = `
      <div class="section">
        <h3>Top Airing</h3>
        <div class="small-list">${renderSmallList(topAiring)}</div>
      </div>
      <div class="section">
        <h3>Most Popular</h3>
        <div class="small-list">${renderSmallList(mostPopular)}</div>
      </div>
      <div class="section">
        <h3>Most Favorite</h3>
        <div class="small-list">${renderSmallList(mostFavorite)}</div>
      </div>
      <div class="section">
        <h3>Latest Completed</h3>
        <div class="small-list">${renderSmallList(latestCompleted)}</div>
      </div>
    `;
  }

  function applyFilters(list){
    return list.filter(it => {
      const q = state.query.trim().toLowerCase();
      if(q){
        if(!it.title.toLowerCase().includes(q)) return false;
      }
      if(state.genre){
        if(!it.genres.map(g=>g.toLowerCase()).includes(state.genre)) return false;
      }
      if(state.favoritesOnly){
        if(!isFav(it.id)) return false;
      }
      return true;
    });
  }

  function renderLatestEpisodes(){
    const grid = $('#latest-episodes');
    if(!grid) return;

    let list = anime.slice().sort((a,b)=>b.views-a.views);
    list = applyFilters(list);

    // apply sort
    if(state.sort === 'alpha') list.sort((a,b)=>a.title.localeCompare(b.title));
    if(state.sort === 'latest') list.sort((a,b)=>b.id - a.id);

    grid.innerHTML = list.map(renderCard).join('');

    // attach click handlers to open modal and favorite buttons
    $$('.card', grid).forEach((node, idx) => {
      node.style.cursor = 'pointer';
      node.dataset.index = idx;
      // click opens modal
      node.addEventListener('click', (e)=>{
        if(e.target.closest('.fav-btn')) return;
        openModal(list[idx]);
      });
      // keyboard: Enter or Space opens modal
      node.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          openModal(list[idx]);
        }
      });
    });

    // favorite buttons on cards
    $$('.fav-btn', grid).forEach(btn => {
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const id = btn.dataset.id;
        toggleFav(id);
        // update UI
        btn.classList.toggle('active', isFav(id));
        btn.setAttribute('aria-pressed', isFav(id) ? 'true' : 'false');
        btn.textContent = isFav(id) ? '❤' : '♡';
        // if favorites-only filter is active, re-render to hide un-favorited
        if(state.favoritesOnly) renderLatestEpisodes();
        renderTop10();
        renderFavoritesPanel();
      });
      // keyboard toggle for favorite button
      btn.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); btn.click(); }
      });
    });
  }

  // Modal logic
  const modal = document.getElementById('modal');
  const modalImg = document.getElementById('modal-img');
  const modalTitle = document.getElementById('modal-title');
  const modalGenres = document.getElementById('modal-genres');
  const modalStats = document.getElementById('modal-stats');
  const modalDesc = document.getElementById('modal-desc');
  const modalVideo = document.getElementById('modal-video');
  const modalClose = document.getElementById('modal-close');
  const modalFavBtn = document.getElementById('modal-fav');
  const modalDismiss = document.getElementById('modal-dismiss');

  function openModal(item){
    if(!modal) return;
    // store previously focused element to return focus later
    lastFocused = document.activeElement;
    // handle image: hide if missing or fails to load to avoid showing alt text box
    if(modalImg){
      modalImg.onerror = function(){ this.style.display = 'none'; };
      modalImg.onload = function(){ this.style.display = ''; };
      if(item.image && String(item.image).trim()){
        modalImg.style.display = '';
        modalImg.src = item.image;
        modalImg.alt = item.title || 'cover';
      } else {
        modalImg.style.display = 'none';
        modalImg.src = '';
        modalImg.alt = '';
      }
    }
    modalTitle.textContent = item.title;
    modalGenres.textContent = `Genres: ${item.genres.join(', ')}`;
    modalStats.textContent = `${item.type} • Episodes: ${item.episodes} • Views: ${item.views} • Favorites: ${item.favorites} • Status: ${item.status} • Latest ep: ${item.latest_ep}`;
    modalDesc.textContent = item.description || '';
    // video handling
    if(modalVideo){
      if(item.video){
        modalVideo.src = item.video;
        modalVideo.style.display = '';
      } else {
        modalVideo.pause && modalVideo.pause();
        modalVideo.src = '';
        modalVideo.style.display = 'none';
      }
    }
    // modal favorite button state
    if(modalFavBtn){
      modalFavBtn.dataset.id = item.id;
      modalFavBtn.classList.toggle('active', isFav(item.id));
      modalFavBtn.textContent = isFav(item.id) ? '❤' : '♡';
    }
    // push history state for shareable URL
    try{
      const cur = new URL(window.location.href);
      const param = `anime=${encodeURIComponent(item.id)}`;
      // only push if URL doesn't already have this param
      if(!cur.searchParams.get('anime') || cur.searchParams.get('anime') !== String(item.id)){
        history.pushState({animeId: item.id}, '', `?anime=${encodeURIComponent(item.id)}`);
      } else {
        // ensure history state reflects current
        history.replaceState({animeId: item.id}, '', cur.href);
      }
    }catch(e){/* ignore history errors */}

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
    // focus the close button for accessibility
    setTimeout(()=>{ if(modalClose) modalClose.focus(); }, 10);
    // attach focus trap
    document.addEventListener('keydown', trapFocus);
  }

  function closeModal(){
    if(!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
    // restore focus
    if(lastFocused && lastFocused.focus) lastFocused.focus();
    // remove focus trap listener
    document.removeEventListener('keydown', trapFocus);
  }

  if(modalClose) modalClose.addEventListener('click', closeModal);
  if(modalDismiss) modalDismiss.addEventListener('click', closeModal);
  if(modal) modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeModal(); });

  // modal favorite toggle
  if(modalFavBtn){
    modalFavBtn.addEventListener('click', ()=>{
      const id = modalFavBtn.dataset.id;
      toggleFav(id);
      modalFavBtn.classList.toggle('active', isFav(id));
      modalFavBtn.textContent = isFav(id) ? '❤' : '♡';
      // update cards list and top10
      renderLatestEpisodes();
      renderTop10();
      renderFavoritesPanel();
    });
  }

  // focus trap inside modal: keep Tab inside modal
  let lastFocused = null;
  function trapFocus(e){
    if(!modal || modal.classList.contains('hidden')) return;
    if(e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if(!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length -1];
    if(e.shiftKey){
      if(document.activeElement === first){ e.preventDefault(); last.focus(); }
    } else {
      if(document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }

  // global image error handler: replace broken images with a 1x1 transparent GIF fallback
  // prevents visible broken/alt boxes and avoids infinite onerror loops
  const TRANSPARENT_1PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  document.addEventListener('error', (e)=>{
    try{
      const t = e.target;
      if(t && t.tagName === 'IMG'){
        // if already using fallback, remove the element to be safe
        if(t.src === TRANSPARENT_1PX){ t.remove(); return; }
        t.onerror = null; // prevent loop
        t.src = TRANSPARENT_1PX;
        t.alt = '';
        t.style.opacity = '0.01';
      }
    }catch(_){ }
  }, true);

  function renderGenres(){
    const el = $('#genres');
    if(!el) return;
    const all = new Set();
    anime.forEach(a=>a.genres.forEach(g=>all.add(g)));
    const arr = Array.from(all).sort();
    el.innerHTML = arr.map(g=>`<div class="genre" data-genre="${g.toLowerCase()}">${g}</div>`).join('');

    // attach listeners
    $$('.genre', el).forEach(node => {
      node.addEventListener('click', ()=>{
        const g = node.dataset.genre;
        if(state.genre === g) state.genre = null; else state.genre = g;
        // toggle classes
        $$('.genre', el).forEach(n=>n.classList.toggle('active', n.dataset.genre === state.genre));
        renderLatestEpisodes();
      });
    });
  }

  function renderTop10(){
    const el = $('#top10');
    if(!el) return;
    const top = anime.slice().sort((a,b)=>b.views-a.views).slice(0,10);
    el.innerHTML = top.map(t=>`<li>${t.title}</li>`).join('');
  }

  // Favorites panel
  function renderFavoritesPanel(){
    const el = $('#favorites-list');
    if(!el) return;
    const favs = anime.filter(a => isFav(a.id));
    if(favs.length === 0){
      el.innerHTML = `<div class="muted">No favorites yet — click a heart to add.</div>`;
      return;
    }
    el.innerHTML = favs.map(f => `
      <div class="favorite-item" data-id="${f.id}">
        <img src="${f.image}" alt="${f.title}" />
        <div class="fav-title">${f.title}</div>
        <div class="fav-actions">
          <button class="fav-open" data-id="${f.id}">Open</button>
          <button class="fav-remove" data-id="${f.id}">Remove</button>
        </div>
      </div>
    `).join('');

    $$('.fav-open', el).forEach(b=>b.addEventListener('click', (e)=>{
      const id = Number(b.dataset.id);
      const item = anime.find(a=>a.id === id);
      if(item) openModal(item);
    }));
    $$('.fav-remove', el).forEach(b=>b.addEventListener('click', (e)=>{
      const id = Number(b.dataset.id);
      favorites.delete(id);
      saveFavs();
      renderFavoritesPanel();
      renderLatestEpisodes();
      renderTop10();
    }));
  }

  // Admin custom entries list / edit / delete
  function getCustomFromStorage(){
    try{ return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]') || []; }catch(e){ return []; }
  }

  function renderAdminList(){
    const el = $('#admin-list');
    if(!el) return;
    const custom = getCustomFromStorage();
    if(!custom || custom.length === 0){ el.innerHTML = `<div class="muted">No custom entries yet. Use the form above to add.</div>`; return; }
    el.innerHTML = custom.map(c=>`
      <div class="admin-item" data-id="${c.id}">
        <img src="${c.image}" alt="${c.title}" />
        <div class="meta">${c.title}</div>
        <div class="actions">
          <button class="admin-edit" data-id="${c.id}">Edit</button>
          <button class="admin-delete" data-id="${c.id}">Delete</button>
        </div>
      </div>
    `).join('');

    $$('.admin-edit', el).forEach(b => b.addEventListener('click', (e)=>{
      const id = Number(b.dataset.id);
      const custom = getCustomFromStorage();
      const item = custom.find(x=>Number(x.id)===id);
      if(!item) return;
      // populate form
      $('#a-edit-id').value = item.id;
      $('#a-title').value = item.title || '';
      $('#a-image').value = item.image && item.image.startsWith('http') ? item.image : '';
      $('#a-asset').value = item.image && !item.image.startsWith('http') ? item.image : '';
      $('#a-type').value = item.type || '';
      $('#a-episodes').value = item.episodes || '';
      $('#a-genres').value = (item.genres||[]).join(', ');
      $('#a-status').value = item.status || '';
      $('#a-latest').value = item.latest_ep || '';
      $('#a-views').value = item.views || '';
      $('#a-favorites').value = item.favorites || '';
  $('#a-desc').value = item.description || '';
  $('#a-video').value = item.video || '';
      // update submit button label
      const sub = $('#admin-submit'); if(sub) sub.textContent = 'Save Changes';
      // scroll into view
      $('#a-title').scrollIntoView({behavior:'smooth', block:'center'});
    }));

    $$('.admin-delete', el).forEach(b => b.addEventListener('click', (e)=>{
      if(!confirm('Delete this custom entry?')) return;
      const id = Number(b.dataset.id);
      // attempt server delete first; if server not available, still remove locally
      deleteCustomOnServer(id).then(ok=>{
        if(!ok){
          // server delete failed or server absent — proceed to remove locally
          console.warn('Server delete failed or server not reachable; removing locally only');
        }
        const custom = getCustomFromStorage().filter(x=>Number(x.id)!==id);
        saveCustom(custom);
        // rebuild anime
        loadCustom();
        renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel();
        renderAdminList();
      }).catch(()=>{
        const custom = getCustomFromStorage().filter(x=>Number(x.id)!==id);
        saveCustom(custom);
        loadCustom();
        renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel();
        renderAdminList();
      });
    }));
  }

  // Admin form handlers
  function addNewAnimeEntry(data){
    // compute new id
    const maxId = anime.reduce((m,a)=>Math.max(m, Number(a.id)||0), 0);
    const id = maxId + 1;
    const entry = {
      id,
      title: data.title,
      video: data.video || '',
      // prefer selected local asset if provided, then image URL, then placeholder
      image: data.asset || data.image || `https://via.placeholder.com/200x300?text=${encodeURIComponent(data.title)}`,
      type: data.type || 'TV',
      episodes: data.episodes || '',
      genres: data.genres || [],
      views: Number(data.views) || 0,
      favorites: Number(data.favorites) || 0,
      status: data.status || '',
      latest_ep: data.latest || '',
      description: data.description || ''
    };
    // add to anime and persist custom entries (local first)
    anime.push(entry);
    // collect custom items (those with id > initial max from embedded data)
    const embeddedMax = Number(Math.max(...JSON.parse(document.getElementById('anime-data').textContent).map(a=>a.id))) || 0;
    let customItems = anime.filter(a => Number(a.id) > embeddedMax);
    saveCustom(customItems);

    // try to persist to server; if server returns a different id, update local storage
    try{
      postCustomToServer(entry).then(serverItem => {
        if(serverItem && serverItem.id && serverItem.id !== entry.id){
          // update local record ids
          entry.id = serverItem.id;
          customItems = anime.filter(a => Number(a.id) > embeddedMax);
          saveCustom(customItems);
        }
        // refresh UI after server sync
        renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel();
      }).catch(()=>{
        // server not available or failed — still render local
        renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel();
      });
    }catch(e){
      renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel();
    }
    return entry;
  }

  function wire(){
    const input = $('#search');
    const clear = $('#clearSearch');
    const sort = $('#sort');
    const favFilter = $('#filter-favorites');

    input.addEventListener('input', e=>{
      state.query = e.target.value;
      renderLatestEpisodes();
    });
    clear.addEventListener('click', ()=>{
      state.query='';
      $('#search').value='';
      renderLatestEpisodes();
    });
    sort.addEventListener('change', e=>{
      state.sort = e.target.value;
      renderLatestEpisodes();
    });
    if(favFilter){
      favFilter.addEventListener('click', ()=>{
        state.favoritesOnly = !state.favoritesOnly;
        favFilter.classList.toggle('active', state.favoritesOnly);
        favFilter.textContent = state.favoritesOnly ? '❤ Favorites' : '♡ Favorites';
        renderLatestEpisodes();
      });
      // initialize UI if filter active
      favFilter.classList.toggle('active', state.favoritesOnly);
      favFilter.textContent = state.favoritesOnly ? '❤ Favorites' : '♡ Favorites';
    }

    // admin form
    const adminForm = $('#admin-form');
    const adminReset = $('#admin-reset');
    if(adminForm){
      adminForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const editId = $('#a-edit-id').value;
        const selectedAsset = ($('#a-asset').value || '').trim();
        const data = {
          title: $('#a-title').value.trim(),
          image: $('#a-image').value.trim(),
          video: ($('#a-video') && $('#a-video').value || '').trim(),
          asset: selectedAsset || null,
          type: $('#a-type').value.trim(),
          episodes: $('#a-episodes').value.trim(),
          genres: ($('#a-genres').value || '').split(',').map(s=>s.trim()).filter(Boolean),
          status: $('#a-status').value.trim(),
          latest: $('#a-latest').value.trim(),
          views: $('#a-views').value.trim(),
          favorites: $('#a-favorites').value.trim(),
          description: $('#a-desc').value.trim()
        };
        if(!data.title){ alert('Title is required'); return; }

        if(editId){
          // update existing custom entry: prefer server
          const custom = getCustomFromStorage();
          const idx = custom.findIndex(x=>String(x.id) === String(editId));
          const existing = (idx !== -1) ? custom[idx] : {};
          const updated = Object.assign({}, existing, {
            title: data.title,
            video: data.video || existing.video || '',
            image: data.asset || data.image || existing.image,
            type: data.type,
            episodes: data.episodes,
            genres: data.genres,
            views: Number(data.views) || 0,
            favorites: Number(data.favorites) || 0,
            status: data.status,
            latest_ep: data.latest,
            description: data.description
          });
          try{
            const serverResp = await postCustomToServer(updated);
            // update local storage with server response
            const cur = getCustomFromStorage();
            const i = cur.findIndex(x=>String(x.id) === String(serverResp.id));
            if(i !== -1) cur[i] = serverResp; else cur.push(serverResp);
            saveCustom(cur);
            loadCustom();
          }catch(err){
            // server failed — persist locally
            if(idx !== -1) custom[idx] = updated; else custom.push(updated);
            saveCustom(custom);
            loadCustom();
          }
          renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel(); renderAdminList();
          openModal(updated);
          $('#a-edit-id').value = '';
          const sub = $('#admin-submit'); if(sub) sub.textContent = 'Add Anime';
          adminForm.reset();
        } else {
          // create a new item — try server first
          try{
            const serverItem = await postCustomToServer(Object.assign({}, data));
            // store and render
            const cur = getCustomFromStorage(); cur.push(serverItem); saveCustom(cur);
            loadCustom();
            renderSections(); renderGenres(); renderTop10(); renderLatestEpisodes(); renderFavoritesPanel(); renderAdminList();
            openModal(serverItem);
          }catch(err){
            // server not available — fallback to local
            const added = addNewAnimeEntry(data);
            openModal(added);
          }
          adminForm.reset();
        }
      });
    }
    if(adminReset){ adminReset.addEventListener('click', ()=>{ adminForm.reset(); }); }

    // Export / Import UI
    const exportBtn = document.getElementById('export-json');
    const importBtn = document.getElementById('import-json-btn');
    const importInput = document.getElementById('import-json');
    if(exportBtn) exportBtn.addEventListener('click', (e)=>{ e.preventDefault(); exportJSON(); });
    if(importBtn && importInput){
      importBtn.addEventListener('click', (e)=>{ e.preventDefault(); importInput.value = ''; importInput.click(); });
      importInput.addEventListener('change', (e)=>{
        const f = e.target.files && e.target.files[0];
        if(!f) return;
        const reader = new FileReader();
        reader.onload = function(ev){
          try{ importJSONFromText(ev.target.result); }catch(err){ alert('Import failed: '+(err && err.message)); }
        };
        reader.readAsText(f);
      });
    }

    // Drop-zone for uploading images as local assets
    const dropZone = document.getElementById('drop-zone');
    const dropInput = document.getElementById('drop-input');
    if(dropZone){
      dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
      dropZone.addEventListener('dragleave', (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); });
      dropZone.addEventListener('drop', (e)=>{
        e.preventDefault(); dropZone.classList.remove('dragover');
        const files = e.dataTransfer && e.dataTransfer.files;
        if(files && files.length) handleFilesAsAssets(files);
      });
      dropZone.addEventListener('click', ()=>{ if(dropInput) dropInput.click(); });
    }
    if(dropInput){
      dropInput.addEventListener('change', (e)=>{ const f = e.target.files; if(f && f.length) handleFilesAsAssets(f); });
    }

    // video upload input: post to /upload and set watch URL
    const videoInput = document.getElementById('video-input');
    if(videoInput){
      videoInput.addEventListener('change', async (e)=>{
        const f = e.target.files && e.target.files[0];
        if(!f) return;
        // try uploading to backend /upload
        try{
          const form = new FormData();
          form.append('file', f);
          const resp = await fetch('/upload', { method: 'POST', body: form });
          if(!resp.ok) throw new Error('upload failed');
          const j = await resp.json();
          if(j && j.url){
            // set the watch URL field to the returned path
            const vid = document.getElementById('a-video'); if(vid) vid.value = j.url;
            alert('Video uploaded and set as watch URL.');
          }
        }catch(err){
          alert('Video upload failed — server may not be running.');
        }
      });
    }
  }

  // Init
  function init(){
    loadCustom();
    renderSections();
    renderGenres();
    renderTop10();
    renderLatestEpisodes();
    renderFavoritesPanel();
    renderAdminList();
    wire();

    // load assets manifest and populate selector
    loadAssets();

    // If URL contains ?anime=<id> on load, open the modal for that id
    try{
      const params = new URLSearchParams(window.location.search);
      const aid = params.get('anime');
      if(aid){
        const item = anime.find(a=>String(a.id) === String(aid));
        if(item){
          // replace state so popstate works predictably
          history.replaceState({animeId: item.id}, '', `?anime=${encodeURIComponent(item.id)}`);
          openModal(item);
        }
      }
    }catch(e){/* ignore URL parse errors */}

    // handle back/forward to open/close modal based on state
    window.addEventListener('popstate', (ev)=>{
      const st = ev.state;
      if(st && st.animeId){
        const it = anime.find(a=>String(a.id) === String(st.animeId));
        if(it) openModal(it);
      } else {
        // no state -> close modal if open
        closeModal();
      }
    });
  }

  // run when DOM ready
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
