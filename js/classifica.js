// ============================================================
//  classifica.js - Classifica + Galleria + Likes + Player modal
// ============================================================

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const MEDAGLIE = ['🥇', '🥈', '🥉'];

// ============================================================
//  TAB (attivazione da hash URL)
// ============================================================
let galleriaCaricata = false;

function attivaTabClassifica() {
  const isGalleria = window.location.hash === '#galleria';
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(isGalleria ? 'tab-galleria' : 'tab-classifica').classList.add('active');
  document.getElementById('nav-classifica')?.classList.toggle('active', !isGalleria);
  document.getElementById('nav-galleria')?.classList.toggle('active', isGalleria);
  if (isGalleria && !galleriaCaricata) { galleriaCaricata = true; caricaGalleria(); }
}
window.addEventListener('hashchange', attivaTabClassifica);

// ============================================================
//  CLASSIFICA
// ============================================================
const classificaList = document.getElementById('classifica-list');
const aggiornato     = document.getElementById('aggiornato');

async function caricaClassifica() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('player_name, points');

  if (error) {
    classificaList.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>Errore nel caricamento</div>';
    return;
  }

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

  renderClassifica(classifica);
  const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  aggiornato.textContent = 'Ultimo aggiornamento: ' + ora;
}

function renderClassifica(classifica) {
  if (classifica.length === 0) {
    classificaList.innerHTML = '<div class="empty-state"><div class="empty-icon">📷</div>Nessuna foto ancora. Sii il primo!</div>';
    return;
  }
  classificaList.innerHTML = classifica.map((g, i) => {
    const posClasse = i < 3 ? 'top' + (i + 1) : '';
    const posLabel  = i < 3 ? MEDAGLIE[i] : (i + 1) + '°';
    const nomeEsc   = g.nome.replace(/'/g, "\\'");
    return '<div class="classifica-item">' +
      '<div class="classifica-pos ' + posClasse + '">' + posLabel + '</div>' +
      '<div class="classifica-nome">' + g.nome +
        '<span class="classifica-foto-count">' + g.foto + ' foto</span><br>' +
        '<button class="btn-vedi-foto" onclick="apriPlayerModal(\'' + nomeEsc + '\')">📷 Guarda foto</button>' +
      '</div>' +
      '<div class="classifica-punti">' + g.punti + ' <span>pt</span></div>' +
    '</div>';
  }).join('');
}

// ============================================================
//  GALLERIA
// ============================================================
async function caricaGalleria() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('*')
    .order('likes_count', { ascending: false });

  const grid = document.getElementById('galleria-grid');

  if (error) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:span 2"><div class="empty-icon">⚠️</div>Errore</div>';
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:span 2"><div class="empty-icon">📭</div>Nessuna foto ancora</div>';
    return;
  }

  const liked = getLiked();
  const topFoto = data.filter(s => (s.likes_count || 0) > 0).slice(0, 3);
  renderTopFoto(topFoto, liked);
  grid.innerHTML = data.map(s => fotoCardHtml(s, liked, null)).join('');
}

function renderTopFoto(topFoto, liked) {
  const section = document.getElementById('top-foto-section');
  const grid    = document.getElementById('top-foto-grid');
  if (topFoto.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  grid.innerHTML = topFoto.map((s, i) => fotoCardHtml(s, liked, MEDAGLIE[i])).join('');
}

function fotoCardHtml(s, liked, badge) {
  const isLiked = liked.includes(s.id);
  const count   = s.likes_count || 0;
  const urlEsc  = s.photo_url.replace(/'/g, '%27');
  const badgeHtml = badge ? '<span class="top-badge">' + badge + '</span>' : '';
  const captionHtml = s.caption ? '<div class="foto-card-caption">"' + s.caption + '"</div>' : '';
  return '<div class="foto-card-pub">' +
    '<div style="position:relative">' +
      '<img src="' + s.photo_url + '" alt="Foto di ' + s.player_name + '" loading="lazy" onclick="apriModalFoto(\'' + urlEsc + '\')" />' +
      badgeHtml +
    '</div>' +
    '<div class="foto-card-info">' +
      '<div class="foto-card-nome">' + s.player_name + '</div>' +
      '<div class="foto-card-cat">' + s.category + '</div>' +
      captionHtml +
    '</div>' +
    '<div class="foto-card-bottom">' +
      '<button class="btn-like ' + (isLiked ? 'liked' : '') + '" ' +
        'onclick="toggleLike(\'' + s.id + '\', ' + count + ', this)" ' +
        (isLiked ? 'disabled' : '') + '>' +
        (isLiked ? '❤️' : '🤍') + ' ' + count +
      '</button>' +
    '</div>' +
  '</div>';
}

// ============================================================
//  LIKES
// ============================================================
function getLiked() {
  try { return JSON.parse(localStorage.getItem('liked_photos') || '[]'); }
  catch { return []; }
}

async function toggleLike(id, currentCount, btnEl) {
  const liked = getLiked();
  if (liked.includes(id) || btnEl.disabled) return;
  btnEl.disabled = true;
  try {
    const { error } = await supabaseClient.rpc('increment_likes', { sub_id: id });
    if (error) throw error;
    liked.push(id);
    localStorage.setItem('liked_photos', JSON.stringify(liked));
    btnEl.innerHTML = '❤️ ' + (currentCount + 1);
    btnEl.classList.add('liked');
  } catch (e) {
    btnEl.disabled = false;
    console.error(e);
  }
}

// ============================================================
//  PLAYER MODAL
// ============================================================
const modalPlayer     = document.getElementById('modal-player');
const modalPlayerNome = document.getElementById('modal-player-nome');
const modalPlayerGrid = document.getElementById('modal-player-grid');

async function apriPlayerModal(nome) {
  modalPlayerNome.textContent = '📷 Foto di ' + nome;
  modalPlayerGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div></div>';
  modalPlayer.classList.add('open');
  document.body.style.overflow = 'hidden';

  const liked = getLiked();
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('*')
    .eq('player_name', nome)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    modalPlayerGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>Nessuna foto</div>';
    return;
  }
  modalPlayerGrid.innerHTML = data.map(s => fotoCardHtml(s, liked, null)).join('');
}

function chiudiPlayerModal() {
  modalPlayer.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('modal-player-close').addEventListener('click', chiudiPlayerModal);
modalPlayer.addEventListener('click', e => { if (e.target === modalPlayer) chiudiPlayerModal(); });

// ============================================================
//  FOTO GRANDE
// ============================================================
const modalFoto    = document.getElementById('modal-foto');
const modalFotoImg = document.getElementById('modal-foto-img');

function apriModalFoto(url) {
  modalFotoImg.src = url;
  modalFoto.classList.add('open');
}

document.getElementById('modal-foto-close').addEventListener('click', () => modalFoto.classList.remove('open'));
modalFoto.addEventListener('click', e => { if (e.target === modalFoto) modalFoto.classList.remove('open'); });

// ============================================================
//  REALTIME
// ============================================================
supabaseClient
  .channel('classifica-live')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, () => caricaClassifica())
  .subscribe();

// --- Avvio ---
caricaClassifica();
attivaTabClassifica();
