const API_BASE = '';

const token = localStorage.getItem('ff_token');

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
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

const nameInput = document.getElementById('fighter-name-input');
const nameCounter = document.getElementById('name-counter');
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('face-file-input');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const uploadPreview = document.getElementById('upload-preview');
const facePreviewImg = document.getElementById('face-preview-img');
const createBtn = document.getElementById('create-btn');
const mainAlert = document.getElementById('main-alert');

const powerSelect = document.getElementById('power-select');
const suitSelect = document.getElementById('suit-select');

let faceBase64 = null;
let faceMimeType = null;

nameInput.addEventListener('input', () => {
  const len = nameInput.value.length;
  nameCounter.textContent = `${len} / 20`;
  checkReady();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showAlert('Please upload a JPEG, PNG, or WebP image.', 'error');
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    showAlert('Image too large. Max 8MB allowed.', 'error');
    return;
  }

  faceMimeType = file.type;
  const reader = new FileReader();

  reader.onload = (e) => {
    const dataUrl = e.target.result;
    faceBase64 = dataUrl.split(',')[1];

    facePreviewImg.src = dataUrl;
    uploadPlaceholder.style.display = 'none';
    uploadPreview.style.display = 'block';

    checkReady();
    hideAlert();
  };

  reader.readAsDataURL(file);
}

function checkReady() {
  const hasName = nameInput.value.trim().length >= 2;
  const hasFace = !!faceBase64;
  createBtn.disabled = !(hasName && hasFace);
}

createBtn.addEventListener('click', async () => {
  if (!faceBase64 || !nameInput.value.trim()) return;

  hideAlert();
  setLoading(createBtn, true);

  try {
    const res = await fetch(`${API_BASE}/api/character/create`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: nameInput.value.trim(),
        face_image_base64: faceBase64,
        mime_type: faceMimeType,
        element: powerSelect.value,
        suit: suitSelect.value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      throw new Error(data.error || 'Failed to create fighter');
    }

    const storedUser = JSON.parse(localStorage.getItem('ff_user') || '{}');
    if (!storedUser.fighters) storedUser.fighters = [];
    storedUser.fighters.push(data.fighter);
    localStorage.setItem('ff_user', JSON.stringify(storedUser));

    // Save active fighter to sessionStorage and localStorage matching select.js
    const email = storedUser.email || 'guest';
    const storageKey = `ff_p1_${email}`;
    sessionStorage.setItem('ff_p1', JSON.stringify(data.fighter));
    sessionStorage.setItem(storageKey, JSON.stringify(data.fighter));
    localStorage.setItem(storageKey, JSON.stringify(data.fighter));

    showAlert('Fighter created! Heading to the roster...', 'success');
    setTimeout(() => {
      window.location.href = '/select.html';
    }, 1000);

  } catch (err) {
    showAlert(`Error: ${err.message}`, 'error');
  } finally {
    setLoading(createBtn, false);
  }
});

function showAlert(message, type = 'error') {
  mainAlert.className = `alert alert-${type} show`;
  mainAlert.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span> ${message}`;
  mainAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAlert() {
  mainAlert.classList.remove('show');
}

function setLoading(btn, loading) {
  if (loading) { btn.classList.add('loading'); btn.disabled = true; }
  else { btn.classList.remove('loading'); btn.disabled = false; }
}
