// ============================================================
//  app.js — Pagina principale: sfide + upload foto
// ============================================================

// --- Inizializzazione Supabase ---
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Stato ---
let sfide = [];
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
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  uploadPreview.style.display = 'block';
});

// ============================================================
//  Submit form
// ============================================================
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const playerName = document.getElementById('player-name').value.trim();
  const sfidaId    = parseInt(sfidaSelect.value, 10);
  const caption    = document.getElementById('caption').value.trim();

  // Validazione base
  if (!playerName) return mostraToast('Inserisci il tuo nome', 'error');
  if (!sfidaId)    return mostraToast('Scegli una sfida', 'error');
  if (!fotoFile)   return mostraToast('Aggiungi una foto', 'error');

  const sfida = sfide.find(s => s.id === sfidaId);
  if (!sfida) return mostraToast('Sfida non valida', 'error');

  // UI: loading
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Caricamento…';

  try {
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
        points:      sfida.punti,
        photo_url:   photoUrl,
        caption:     caption || null,
      });

    if (dbError) throw dbError;

    // Successo
    mostraToast(`+${sfida.punti} punti! Foto caricata 🎉`, 'success');
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

