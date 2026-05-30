// ============================================================
//  admin.js — Pannello admin: foto, classifica, sfide editor
// ============================================================

const ADMIN_PASSWORD = 'giulieale';

// Supabase inizializzato solo dopo login (evita crash se config.js non è pronto)
let supabaseClient = null;

// ============================================================
//  LOGIN — puro JS, nessuna dipendenza da Supabase
// ============================================================
const schermataLogin  = document.getElementById('schermata-login');
const pannelloAdmin   = document.getElementById('pannello-admin');
const btnLogin        = document.getElementById('btn-login');
const adminPwd        = document.getElementById('admin-pwd');
const loginErrore     = document.getElementById('login-errore');

if (sessionStorage.getItem('admin_ok') === '1') {
  inizializzaSupabaseEMostra();
}

btnLogin.addEventListener('click', () => {
  if (adminPwd.value.trim() === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_ok', '1');
    loginErrore.style.display = 'none';
    inizializzaSupabaseEMostra();
  } else {
    loginErrore.style.display = 'block';
    adminPwd.value = '';
    adminPwd.focus();
  }
});

adminPwd.addEventListener('keydown', e => { if (e.key === 'Enter') btnLogin.click(); });

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('admin_ok');
  location.reload();
});

function inizializzaSupabaseEMostra() {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    alert('Errore connessione Supabase. Ricarica la pagina.');
    return;
  }
  mostraAdmin();
}

function mostraAdmin() {
  schermataLogin.style.display = 'none';
  pannelloAdmin.style.display  = 'block';
  caricaFoto();
  caricaClassifica();
  caricaSfide();
  caricaPartecipantiAdmin();
}

// ============================================================
//  TAB
// ============================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ============================================================
//  TAB FOTO
// ============================================================
let tutteLeSubmissions = [];
let filtroAttivo = '';

async function caricaFoto() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  tutteLeSubmissions = data || [];
  renderFiltri();
  renderFoto();
}

function renderFiltri() {
  const categorie = [...new Set(tutteLeSubmissions.map(s => s.category))];
  const bar = document.getElementById('filtro-bar');
  bar.innerHTML = `<button class="filtro-chip active" data-cat="">Tutte</button>`;
  categorie.forEach(cat => {
    bar.innerHTML += `<button class="filtro-chip" data-cat="${cat}">${cat}</button>`;
  });
  bar.querySelectorAll('.filtro-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      bar.querySelectorAll('.filtro-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filtroAttivo = chip.dataset.cat;
      renderFoto();
    });
  });
}

function renderFoto() {
  const grid = document.getElementById('foto-grid');
  const lista = filtroAttivo
    ? tutteLeSubmissions.filter(s => s.category === filtroAttivo)
    : tutteLeSubmissions;

  if (lista.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:span 2"><div class="empty-icon">📭</div>Nessuna foto</div>`;
    return;
  }

  grid.innerHTML = lista.map(s => `
    <div class="foto-admin-card">
      <img src="${s.photo_url}" alt="Foto di ${s.player_name}" loading="lazy"
           onclick="apriModal('${s.photo_url}')" />
      <div class="foto-admin-info">
        <div class="foto-admin-nome">${s.player_name}</div>
        <div class="foto-admin-cat">${s.category} · ${s.points} pt</div>
        ${s.caption ? `<div class="foto-admin-caption">${s.caption}</div>` : ''}
      </div>
      <div class="foto-admin-actions">
        <button class="btn-sm btn-sm-dl"  onclick="scaricaFoto('${s.photo_url}', '${s.player_name}')">⬇ Scarica</button>
        <button class="btn-sm btn-sm-del" onclick="eliminaFoto('${s.id}', this)">🗑 Elimina</button>
      </div>
    </div>
  `).join('');
}

async function eliminaFoto(id, btnEl) {
  if (!confirm('Eliminare questa foto?')) return;
  const sub = tutteLeSubmissions.find(s => s.id === id);

  const { error } = await supabaseClient.from('submissions').delete().eq('id', id);
  if (error) { mostraToast('Errore eliminazione', 'error'); return; }

  // Elimina anche il file dallo Storage
  if (sub) {
    const path = estraiPathStorage(sub.photo_url);
    if (path) await supabaseClient.storage.from('wedding-photos').remove([path]);
  }

  tutteLeSubmissions = tutteLeSubmissions.filter(s => s.id !== id);
  renderFoto();
  renderFiltri();
  mostraToast('Foto eliminata');
}

function estraiPathStorage(url) {
  const marker = '/object/public/wedding-photos/';
  const idx = url.indexOf(marker);
  return idx !== -1 ? decodeURIComponent(url.substring(idx + marker.length)) : null;
}

async function svuotaTutto() {
  if (!confirm('⚠️ Eliminare TUTTE le foto e i punteggi?\nQuesta azione non è reversibile.')) return;
  if (!confirm('Ultima conferma: sicuro di voler svuotare tutto?')) return;

  const paths = tutteLeSubmissions
    .map(s => estraiPathStorage(s.photo_url))
    .filter(Boolean);

  const { error } = await supabaseClient
    .from('submissions').delete().not('id', 'is', null);

  if (error) { mostraToast('Errore eliminazione DB', 'error'); return; }

  if (paths.length > 0) {
    await supabaseClient.storage.from('wedding-photos').remove(paths);
  }

  tutteLeSubmissions = [];
  renderFoto();
  renderFiltri();
  mostraToast('Tutti i dati eliminati ✓', 'success');
}

async function scaricaFoto(url, nome) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const ext  = blob.type.split('/')[1] || 'jpg';
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${nome.replace(/\s+/g,'_')}_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    mostraToast('Apri la foto e salvala manualmente', 'error');
  }
}

// ============================================================
//  MODAL
// ============================================================
const modal     = document.getElementById('modal');
const modalImg  = document.getElementById('modal-img');

function apriModal(url) {
  modalImg.src = url;
  modal.classList.add('open');
}

document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

// ============================================================
//  TAB CLASSIFICA
// ============================================================
async function caricaClassifica() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('player_name, points');

  const list = document.getElementById('admin-classifica-list');
  if (error || !data) { list.innerHTML = '<div class="empty-state">Errore</div>'; return; }

  const mappa = {};
  for (const row of data) {
    const nome = row.player_name.trim();
    if (!mappa[nome]) mappa[nome] = { punti: 0, foto: 0 };
    mappa[nome].punti += row.points;
    mappa[nome].foto  += 1;
  }

  const classifica = Object.entries(mappa)
    .map(([nome, val]) => ({ nome, ...val }))
    .sort((a, b) => b.punti - a.punti);

  const MEDAGLIE = ['🥇','🥈','🥉'];

  if (classifica.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>Nessuna submission ancora</div>`;
    return;
  }

  list.innerHTML = classifica.map((g, i) => `
    <div class="classifica-item">
      <div class="classifica-pos ${i < 3 ? `top${i+1}` : ''}">${i < 3 ? MEDAGLIE[i] : `${i+1}°`}</div>
      <div class="classifica-nome">${g.nome}<br>
        <span style="font-weight:400;font-size:0.75rem;color:var(--grigio)">${g.foto} foto</span>
      </div>
      <div class="classifica-punti">${g.punti} <span>pt</span></div>
    </div>
  `).join('');
}

// ============================================================
//  TAB SFIDE EDITOR
// ============================================================
let sfide = [];
let partecipantiAdmin = [];
let partecipantiTableDisponibile = false;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeNomePartecipante(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isMissingPartecipantiTable(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('relation') && msg.includes('partecipanti') && msg.includes('does not exist');
}

function normalizeSfidaTag(tag) {
  const value = String(tag || '').trim().toLowerCase();
  if (value === 'hide') return value;
  return '';
}

function normalizeVisibleSfidaTag(tag) {
  const value = String(tag || '').trim().toLowerCase();
  if (value === 'mattina' || value === 'pomeriggio' || value === 'general') return value;
  return 'general';
}

function getVisibleTagFromSfida(sfida) {
  return normalizeVisibleSfidaTag(sfida.tag_visibile);
}

async function aggiornaSfidaConFallback(id, payloadCompleto, payloadFallback) {
  const firstTry = await supabaseClient
    .from('sfide')
    .update(payloadCompleto)
    .eq('id', id);

  if (!firstTry.error) return { ...firstTry, usedFallback: false };

  const columnMissing = String(firstTry.error.message || '').toLowerCase().includes('tag_visibile');
  if (!columnMissing) return { ...firstTry, usedFallback: false };

  const secondTry = await supabaseClient
    .from('sfide')
    .update(payloadFallback)
    .eq('id', id);

  return { ...secondTry, usedFallback: !secondTry.error };
}

async function inserisciSfidaConFallback(payloadCompleto, payloadFallback) {
  const firstTry = await supabaseClient
    .from('sfide')
    .insert(payloadCompleto)
    .select()
    .single();

  if (!firstTry.error) return { ...firstTry, usedFallback: false };

  const columnMissing = String(firstTry.error.message || '').toLowerCase().includes('tag_visibile');
  if (!columnMissing) return { ...firstTry, usedFallback: false };

  const secondTry = await supabaseClient
    .from('sfide')
    .insert(payloadFallback)
    .select()
    .single();

  return { ...secondTry, usedFallback: !secondTry.error };
}

function mostraToastTagVisibileFallback() {
  mostraToast('Salvato. Campo tag_visibile mancante su DB: usato fallback.', 'error');
}

async function fetchPartecipantiDaFile() {
  try {
    const res = await fetch('partecipanti.json?v=2');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map(normalizeNomePartecipante).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function sortNomiUnici(lista) {
  const unici = [...new Set(lista.map(normalizeNomePartecipante).filter(Boolean))];
  return unici.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

function renderPartecipantiAdmin() {
  const editor = document.getElementById('partecipanti-editor');
  const note = document.getElementById('partecipanti-note');
  const btnAdd = document.getElementById('btn-aggiungi-partecipante');
  const btnImport = document.getElementById('btn-importa-partecipanti');

  if (!editor || !note || !btnAdd || !btnImport) return;

  if (partecipantiAdmin.length === 0) {
    editor.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>Nessun partecipante</div>`;
  } else {
    editor.innerHTML = partecipantiAdmin.map(p => `
      <div class="partecipante-row">
        <span class="partecipante-nome">${escapeHtml(p.nome)}</span>
        ${partecipantiTableDisponibile ? `<button class="btn-sm btn-sfida-del" onclick="eliminaPartecipante(${p.id})">🗑</button>` : ''}
      </div>
    `).join('');
  }

  if (partecipantiTableDisponibile) {
    note.textContent = 'Lista salvata su Supabase: puoi aggiungere, eliminare o importare dal file partecipanti.json.';
    btnAdd.disabled = false;
    btnImport.disabled = false;
  } else {
    note.textContent = 'Tabella Supabase "partecipanti" non trovata: visualizzo solo il file statico. Esegui le query SQL di setup per attivare modifica live.';
    btnAdd.disabled = true;
    btnImport.disabled = true;
  }
}

async function caricaPartecipantiAdmin() {
  const { data, error } = await supabaseClient
    .from('partecipanti')
    .select('id, nome')
    .order('nome', { ascending: true });

  if (!error) {
    partecipantiTableDisponibile = true;
    partecipantiAdmin = (data || []).map(row => ({ id: row.id, nome: normalizeNomePartecipante(row.nome) }));
    renderPartecipantiAdmin();
    return;
  }

  if (isMissingPartecipantiTable(error)) {
    partecipantiTableDisponibile = false;
    const fromFile = await fetchPartecipantiDaFile();
    partecipantiAdmin = sortNomiUnici(fromFile).map((nome, index) => ({ id: -(index + 1), nome }));
    renderPartecipantiAdmin();
    return;
  }

  console.error(error);
  mostraToast('Errore caricamento partecipanti', 'error');
}

async function aggiungiPartecipante() {
  if (!partecipantiTableDisponibile) {
    mostraToast('Attiva prima la tabella Supabase partecipanti', 'error');
    return;
  }

  const input = document.getElementById('nuovo-partecipante');
  const nome = normalizeNomePartecipante(input.value);
  if (!nome) {
    mostraToast('Inserisci un nome valido', 'error');
    return;
  }

  const giaPresente = partecipantiAdmin.some(p => p.nome.toLowerCase() === nome.toLowerCase());
  if (giaPresente) {
    mostraToast('Nome gia presente', 'error');
    return;
  }

  const { data, error } = await supabaseClient
    .from('partecipanti')
    .insert({ nome })
    .select('id, nome')
    .single();

  if (error) {
    console.error(error);
    mostraToast('Errore salvataggio nome', 'error');
    return;
  }

  partecipantiAdmin.push({ id: data.id, nome: normalizeNomePartecipante(data.nome) });
  partecipantiAdmin = partecipantiAdmin.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
  input.value = '';
  renderPartecipantiAdmin();
  mostraToast('Partecipante aggiunto ✓', 'success');
}

async function eliminaPartecipante(id) {
  if (!partecipantiTableDisponibile) return;
  if (!confirm('Eliminare questo partecipante dalla lista?')) return;

  const { error } = await supabaseClient
    .from('partecipanti')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    mostraToast('Errore eliminazione nome', 'error');
    return;
  }

  partecipantiAdmin = partecipantiAdmin.filter(p => p.id !== id);
  renderPartecipantiAdmin();
  mostraToast('Partecipante eliminato', 'success');
}

async function importaPartecipantiDaFile() {
  if (!partecipantiTableDisponibile) {
    mostraToast('Attiva prima la tabella Supabase partecipanti', 'error');
    return;
  }

  const lista = sortNomiUnici(await fetchPartecipantiDaFile());
  if (lista.length === 0) {
    mostraToast('partecipanti.json vuoto o non disponibile', 'error');
    return;
  }

  const payload = lista.map(nome => ({ nome }));
  const { error } = await supabaseClient
    .from('partecipanti')
    .upsert(payload, { onConflict: 'nome' });

  if (error) {
    console.error(error);
    mostraToast('Errore importazione partecipanti', 'error');
    return;
  }

  await caricaPartecipantiAdmin();
  mostraToast('Import completato ✓', 'success');
}

async function caricaSfide() {
  const { data, error } = await supabaseClient
    .from('sfide')
    .select('*')
    .order('ordine', { ascending: true });

  if (error) { console.error(error); return; }
  sfide = data || [];
  renderSfideEditor();
}

function renderSfideEditor() {
  const editor = document.getElementById('sfide-editor');
  if (sfide.length === 0) {
    editor.innerHTML = `<div class="empty-state">Nessuna sfida trovata</div>`;
    return;
  }
  editor.innerHTML = sfide.map(s => `
    <div class="sfida-row" id="sfida-row-${s.id}">
      <input type="text"   value="${s.descrizione}" id="desc-${s.id}"  placeholder="Descrizione" />
      <input type="number" value="${s.punti}"        id="punti-${s.id}" min="1" max="20" />
      <select id="tag-${s.id}" title="Tag interno">
        <option value="" ${normalizeSfidaTag(s.tag) === '' ? 'selected' : ''}>Nessuno</option>
        <option value="hide" ${normalizeSfidaTag(s.tag) === 'hide' ? 'selected' : ''}>HIDE</option>
      </select>
      <select id="tag-visibile-${s.id}" title="Tag visibile utenti">
        <option value="general" ${getVisibleTagFromSfida(s) === 'general' ? 'selected' : ''}>General</option>
        <option value="mattina" ${getVisibleTagFromSfida(s) === 'mattina' ? 'selected' : ''}>Mattina</option>
        <option value="pomeriggio" ${getVisibleTagFromSfida(s) === 'pomeriggio' ? 'selected' : ''}>Pomeriggio</option>
      </select>
      <button class="btn-sm btn-sfida-save" onclick="salvaSfida(${s.id})">✓</button>
      <button class="btn-sm btn-sfida-del"  onclick="eliminaSfida(${s.id})">🗑</button>
    </div>
  `).join('');
}

async function salvaSfida(id) {
  const desc  = document.getElementById(`desc-${id}`).value.trim();
  const punti = parseInt(document.getElementById(`punti-${id}`).value, 10);
  const tag   = normalizeSfidaTag(document.getElementById(`tag-${id}`).value);
  const tagVisibile = normalizeVisibleSfidaTag(document.getElementById(`tag-visibile-${id}`).value);
  if (!desc || !punti) return mostraToast('Compila descrizione e punti', 'error');

  const payloadCompleto = { descrizione: desc, punti, tag: tag || null, tag_visibile: tagVisibile };
  const payloadFallback = { descrizione: desc, punti, tag: tag || null };

  const { error, usedFallback } = await aggiornaSfidaConFallback(id, payloadCompleto, payloadFallback);

  if (error) { mostraToast('Errore salvataggio', 'error'); return; }
  const sfidaAggiornata = { descrizione: desc, punti, tag: tag || null, tag_visibile: tagVisibile };
  sfide = sfide.map(s => s.id === id ? { ...s, ...sfidaAggiornata } : s);

  if (usedFallback) {
    mostraToastTagVisibileFallback();
    return;
  }

  mostraToast('Sfida aggiornata ✓', 'success');
}

async function eliminaSfida(id) {
  if (!confirm('Eliminare questa sfida?')) return;
  const { error } = await supabaseClient.from('sfide').delete().eq('id', id);
  if (error) { mostraToast('Errore eliminazione', 'error'); return; }
  sfide = sfide.filter(s => s.id !== id);
  renderSfideEditor();
  mostraToast('Sfida eliminata');
}

document.getElementById('btn-aggiungi-sfida').addEventListener('click', async () => {
  const desc  = document.getElementById('nuova-desc').value.trim();
  const punti = parseInt(document.getElementById('nuovi-punti').value, 10);
  const tag   = normalizeSfidaTag(document.getElementById('nuovo-tag').value);
  const tagVisibile = normalizeVisibleSfidaTag(document.getElementById('nuovo-tag-visibile').value);
  if (!desc || !punti) return mostraToast('Compila descrizione e punti', 'error');

  const ordine = sfide.length > 0 ? Math.max(...sfide.map(s => s.ordine || 0)) + 1 : 1;

  const payloadCompleto = { descrizione: desc, punti, ordine, tag: tag || null, tag_visibile: tagVisibile };
  const payloadFallback = { descrizione: desc, punti, ordine, tag: tag || null };

  const { data, error, usedFallback } = await inserisciSfidaConFallback(payloadCompleto, payloadFallback);

  if (error) { mostraToast('Errore aggiunta', 'error'); return; }
  sfide.push(data);
  renderSfideEditor();
  document.getElementById('nuova-desc').value  = '';
  document.getElementById('nuovi-punti').value = '2';
  document.getElementById('nuovo-tag').value = '';
  document.getElementById('nuovo-tag-visibile').value = 'general';

  if (usedFallback) {
    mostraToastTagVisibileFallback();
    return;
  }

  mostraToast('Sfida aggiunta ✓', 'success');
});

document.getElementById('btn-aggiungi-partecipante').addEventListener('click', aggiungiPartecipante);
document.getElementById('btn-importa-partecipanti').addEventListener('click', importaPartecipantiDaFile);
document.getElementById('nuovo-partecipante').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    aggiungiPartecipante();
  }
});

// ============================================================
//  Toast
// ============================================================
const toast = document.getElementById('toast');
let toastTimer;
function mostraToast(msg, tipo = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = `toast ${tipo} show`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

