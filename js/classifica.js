// ============================================================
//  classifica.js — Classifica in tempo reale con Supabase Realtime
// ============================================================

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const classificaList = document.getElementById('classifica-list');
const aggiornato     = document.getElementById('aggiornato');

// ============================================================
//  Recupera e aggrega i punti per giocatore
// ============================================================
async function caricaClassifica() {
  const { data, error } = await supabaseClient
    .from('submissions')
    .select('player_name, points');

  if (error) {
    classificaList.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div>Errore nel caricamento</div>`;
    console.error(error);
    return;
  }

  // Aggrega punti e conta foto per giocatore
  const mappa = {};
  for (const row of data) {
    const nome = row.player_name.trim();
    if (!mappa[nome]) mappa[nome] = { punti: 0, foto: 0 };
    mappa[nome].punti += row.points;
    mappa[nome].foto  += 1;
  }

  // Ordina per punti decrescenti
  const classifica = Object.entries(mappa)
    .map(([nome, val]) => ({ nome, ...val }))
    .sort((a, b) => b.punti - a.punti);

  renderClassifica(classifica);

  const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  aggiornato.textContent = `Ultimo aggiornamento: ${ora}`;
}

// ============================================================
//  Render
// ============================================================
const MEDAGLIE = ['🥇', '🥈', '🥉'];

function renderClassifica(classifica) {
  if (classifica.length === 0) {
    classificaList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📷</div>
        Nessuna foto ancora. Sii il primo!
      </div>`;
    return;
  }

  classificaList.innerHTML = classifica.map((giocatore, i) => {
    const posClasse = i < 3 ? `top${i + 1}` : '';
    const posLabel  = i < 3 ? MEDAGLIE[i] : `${i + 1}°`;
    return `
      <div class="classifica-item">
        <div class="classifica-pos ${posClasse}">${posLabel}</div>
        <div class="classifica-nome">
          ${giocatore.nome}
          <span class="classifica-foto-count">${giocatore.foto} foto</span>
        </div>
        <div class="classifica-punti">
          ${giocatore.punti} <span>pt</span>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
//  Supabase Realtime — ascolta INSERT sulla tabella submissions
// ============================================================
supabaseClient
  .channel('classifica-live')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'submissions' },
    () => caricaClassifica()
  )
  .subscribe();

// --- Avvio ---
caricaClassifica();
