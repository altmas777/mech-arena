const API_BASE = '';
const token = localStorage.getItem('ff_token');
const userStr = localStorage.getItem('ff_user');

// Check if JWT is expired
function isTokenExpired(tok) {
  try {
    const payload = JSON.parse(atob(tok.split('.')[1]));
    return payload.exp && Date.now() / 1000 > payload.exp;
  } catch { return true; }
}

if (!token || isTokenExpired(token)) {
  localStorage.removeItem('ff_token');
  localStorage.removeItem('ff_user');
  window.location.href = '/login.html';
  throw new Error('No token');
}

const currentUser = userStr ? JSON.parse(userStr) : null;
let activeFighter = null;
let selectedDifficulty = 'normal'; // default

async function init() {
  if (currentUser?.email) {
    const name = currentUser.username || currentUser.email.split('@')[0];
    document.getElementById('user-greeting').textContent = `WELCOME BACK, ${name.toUpperCase()}`;
  }

  try {
    // Always fetch fresh from server (not localStorage cache) so new fighters appear
    const res = await fetch('/api/fighters', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    document.getElementById('loading-state').style.display = 'none';

    if (res.status === 401) {
      localStorage.removeItem('ff_token');
      localStorage.removeItem('ff_user');
      window.location.href = '/login.html';
      return;
    }

    if (!res.ok || !data.fighters || data.fighters.length === 0) {
      window.location.href = '/create.html';
      return;
    }

    // Always use the LATEST fighter (last in array = most recently created)
    activeFighter = data.fighters[data.fighters.length - 1];
    // Store fresh fighter data in sessionStorage keyed by user email for uniqueness
    const storageKey = `ff_p1_${currentUser?.email || 'guest'}`;
    sessionStorage.setItem('ff_p1', JSON.stringify(activeFighter));
    sessionStorage.setItem(storageKey, JSON.stringify(activeFighter));

    // Update localStorage with fresh fighter list too
    if (currentUser) {
      currentUser.fighters = data.fighters;
      localStorage.setItem('ff_user', JSON.stringify(currentUser));
    }

    // Show fighter data
    document.getElementById('fighter-state').style.display = 'flex';
    document.getElementById('active-fighter-name').textContent = activeFighter.name.toUpperCase();

    const element = activeFighter.stats?.element || 'fire';
    const suit = activeFighter.suit || 'default';
    document.getElementById('active-fighter-element').textContent = `POWER: ${element.toUpperCase()} | SUIT: ${suit.toUpperCase()}`;

    const faceDataUrl = activeFighter.face_image_base64
      ? `data:${activeFighter.mime_type || 'image/jpeg'};base64,${activeFighter.face_image_base64}`
      : null;

    const imgContainer = document.getElementById('active-fighter-img');
    if (faceDataUrl) {
      imgContainer.innerHTML = `<img src="${faceDataUrl}" class="fighter-face-preview" alt="${activeFighter.name}" />`;
    } else {
      imgContainer.innerHTML = `<div class="fighter-face-preview" style="display:flex;align-items:center;justify-content:center;background:var(--blood-red);font-size:40px;">👤</div>`;
    }

  } catch (err) {
    console.error('Failed to load fighters:', err);
    // If network error or auth error, send back to login
    if (err.message !== 'No token') {
      window.location.href = '/login.html';
    }
  }
}

// ─── DIFFICULTY SELECTION ───────────────────────────────────────────────────

const diffBtns = document.querySelectorAll('.diff-btn');
diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

// ─── FIGHT AI ───────────────────────────────────────────────────────────────

document.getElementById('btn-vs-ai').addEventListener('click', () => {
  if (!activeFighter) return;
  sessionStorage.removeItem('ff_p2');
  window.location.href = `/game.html?mode=ai&diff=${selectedDifficulty}`;
});

// ─── MULTIPLAYER ─────────────────────────────────────────────────────────────

document.getElementById('btn-create-room').addEventListener('click', () => {
  if (!activeFighter) return;
  window.location.href = '/lobby.html?mode=create';
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  if (!activeFighter) return;
  window.location.href = '/lobby.html?mode=join';
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('ff_token');
  localStorage.removeItem('ff_user');
  sessionStorage.clear();
  window.location.href = '/';
});

init();
