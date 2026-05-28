// ============================================================
//  app.js — Pagina principale: sfide + upload foto
// ============================================================

// --- Inizializzazione Supabase ---
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Stato ---
let sfide = [];
let partecipanti = [];
let fotoFile = null;

// --- DOM ---
const sfideGrid    = document.getElementById('sfide-grid');
const sfidaSelect  = document.getElementById('sfida-select');
const fotoInput    = document.getElementById('foto-input');
const previewImg   = document.getElementById('preview-img');
const uploadPreview = document.getElementById('upload-preview');
const uploadForm   = document.getElementById('upload-form');
const submitBtn    = document.getElementById('submit-btn');
const toast        = document.getElementById('toast');

// ============================================================
//  Caricamento sfide da Supabase (tabella "sfide")
// ============================================================
async function caricaSfide() {
  const { data, error } = await supabaseClient
    .from('sfide')
    .select('id, descrizione, punti')
    .order('ordine', { ascending: true });

  if (error || !data || data.length === 0) {
    sfideGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div>Impossibile caricare le sfide.</div>`;
    console.error(error);
    return;
  }

  sfide = data;
  renderSfide();
  popolaSelect();
}

function renderSfide() {
  sfideGrid.innerHTML = sfide.map(s => `
    <div class="sfida-card">
      <span class="sfida-desc">${s.descrizione}</span>
      <span class="sfida-punti">+${s.punti} pt</span>
    </div>
  `).join('');
}

function popolaSelect() {
  const opzioni = sfide.map(s =>
    `<option value="${s.id}">${s.descrizione} (+${s.punti} pt)</option>`
  ).join('');
  sfidaSelect.innerHTML = '<option value="">— Scegli una sfida —</option>' + opzioni;
}

// ============================================================
//  Anteprima foto
// ============================================================
fotoInput.addEventListener('change', () => {
  const file = fotoInput.files[0];
  if (!file) return;
  fotoFile = file;
  previewImg.src = URL.createObjectURL(file);
  uploadPreview.style.display = 'block';
});

// ============================================================
//  Submit form
// ============================================================
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const playerName = (document.getElementById('nomi-input').dataset.selected || '').trim();
  const sfidaId    = parseInt(sfidaSelect.value, 10);
  const caption    = document.getElementById('caption').value.trim();

  // Validazione base
  if (!playerName) return mostraToast('Scegli il tuo nome', 'error');
  if (!sfidaId)    return mostraToast('Scegli una sfida', 'error');
  if (!fotoFile)   return mostraToast('Aggiungi una foto', 'error');

  const sfida = sfide.find(s => s.id === sfidaId);
  if (!sfida) return mostraToast('Sfida non valida', 'error');

  // UI: loading
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Caricamento…';

  try {
    // Assegna i punti una sola volta per categoria e partecipante.
    const { data: existingSubmission, error: checkError } = await supabaseClient
      .from('submissions')
      .select('id')
      .eq('player_name', playerName)
      .eq('category', sfida.descrizione)
      .limit(1);

    if (checkError) throw checkError;
    const pointsToAssign = existingSubmission && existingSubmission.length > 0 ? 0 : sfida.punti;

    // 1. Upload foto su Supabase Storage (qualità originale, nessuna compressione)
    const ext      = fotoFile.name.split('.').pop().toLowerCase();
    const safeName = playerName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filePath = `${safeName}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseClient
      .storage
      .from('wedding-photos')
      .upload(filePath, fotoFile, { upsert: false });

    if (uploadError) throw uploadError;

    // 2. Recupera URL pubblico
    const { data: urlData } = supabaseClient
      .storage
      .from('wedding-photos')
      .getPublicUrl(filePath);

    const photoUrl = urlData.publicUrl;

    // 3. Salva record nella tabella submissions
    const { error: dbError } = await supabaseClient
      .from('submissions')
      .insert({
        player_name: playerName,
        category:    sfida.descrizione,
        points:      pointsToAssign,
        photo_url:   photoUrl,
        caption:     caption || null,
      });

    if (dbError) throw dbError;

    // Successo
    if (pointsToAssign > 0) {
      mostraToast(`+${pointsToAssign} punti! Foto caricata 🎉`, 'success');
    } else {
      mostraToast('Foto caricata! Punti gia assegnati per questa categoria.', 'success');
    }
    resetForm();

  } catch (err) {
    console.error(err);
    mostraToast('Errore durante il caricamento. Riprova.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Carica la foto';
  }
});

// ============================================================
//  Utilities
// ============================================================
function resetForm() {
  uploadForm.reset();
  fotoFile = null;
  uploadPreview.style.display = 'none';
  previewImg.src = '';
  sfidaSelect.value = '';
  const input = document.getElementById('nomi-input');
  if (input) { input.value = ''; delete input.dataset.selected; input.classList.remove('nome-input-invalid'); }
  const dropdown = document.getElementById('nome-dropdown');
  if (dropdown) dropdown.classList.remove('open');
}

let toastTimer;
function mostraToast(msg, tipo = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = `toast ${tipo} show`;
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// --- Avvio ---
caricaSfide();
caricaPartecipanti();

// ============================================================
//  Caricamento partecipanti + autocomplete campo singolo
// ============================================================
async function caricaPartecipanti() {
  try {
    const res = await fetch('partecipanti.json?v=2');
    if (!res.ok) return;
    partecipanti = await res.json();
    inizializzaAutocomplete();
  } catch (e) {
    console.warn('partecipanti.json non trovato', e);
  }
}

function inizializzaAutocomplete() {
  const input    = document.getElementById('nomi-input');
  const dropdown = document.getElementById('nome-dropdown');
  if (!input || !dropdown) return;

  function mostraOpzioni(filtro) {
    const lista = filtro
      ? partecipanti.filter(n => n.toLowerCase().includes(filtro.toLowerCase()))
      : partecipanti;
    if (!lista.length) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = lista
      .map(n => `<div class="nome-option" data-nome="${n}">${evidenzia(n, filtro)}</div>`)
      .join('');
    dropdown.classList.add('open');
  }

  function evidenzia(nome, q) {
    if (!q) return nome;
    const i = nome.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return nome;
    return nome.slice(0, i) + '<strong>' + nome.slice(i, i + q.length) + '</strong>' + nome.slice(i + q.length);
  }

  function seleziona(nome) {
    input.value = nome;
    input.dataset.selected = nome;
    input.classList.remove('nome-input-invalid');
    dropdown.classList.remove('open');
  }

  input.addEventListener('focus', () => mostraOpzioni(input.value));
  input.addEventListener('input', () => {
    delete input.dataset.selected;
    mostraOpzioni(input.value);
  });

  // Evita che il blur chiuda il dropdown prima che il click registri
  dropdown.addEventListener('mousedown', e => e.preventDefault());
  dropdown.addEventListener('click', e => {
    const opt = e.target.closest('.nome-option');
    if (opt) seleziona(opt.dataset.nome);
  });
  dropdown.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  dropdown.addEventListener('touchend', e => {
    const opt = e.target.closest('.nome-option');
    if (opt) { e.preventDefault(); seleziona(opt.dataset.nome); }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.remove('open'), 150);
    // Se il testo corrisponde esattamente a un nome (case-insensitive), accettalo
    const match = partecipanti.find(n => n.toLowerCase() === input.value.toLowerCase());
    if (match) { seleziona(match); }
    else if (input.value && !input.dataset.selected) {
      input.classList.add('nome-input-invalid');
    }
  });
}

