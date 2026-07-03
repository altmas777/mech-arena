const API_BASE = '';

// ─── UTILS ───────────────────────────────────────────────────────────────────

function showAlert(el, message, type = 'error') {
  el.className = `alert alert-${type} show`;
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span> ${message}`;
}
function hideAlert(el) { el.classList.remove('show'); }
function setLoading(btn, loading) {
  if (loading) { btn.classList.add('loading'); btn.disabled = true; }
  else         { btn.classList.remove('loading'); btn.disabled = false; }
}
function saveToken(token, userData) {
  localStorage.setItem('ff_token', token);
  localStorage.setItem('ff_user', JSON.stringify(userData));
}
function getToken() { return localStorage.getItem('ff_token'); }
function togglePass(inputId, btn) {
  const inp = document.getElementById(inputId);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
}

// Redirect if already logged in
if (getToken()) { window.location.href = '/select.html'; }

// ─── TAB SWITCHING ───────────────────────────────────────────────────────────

function switchTab(tab) {
  document.getElementById('panel-login').classList.toggle('active', tab === 'login');
  document.getElementById('panel-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  hideAlert(document.getElementById('alert-login'));
  hideAlert(document.getElementById('alert-signup'));
}

// ─── PASSWORD STRENGTH ───────────────────────────────────────────────────────

document.getElementById('signup-pass').addEventListener('input', function() {
  const val = this.value;
  const bar = document.getElementById('strength-bar');
  const lbl = document.getElementById('strength-label');
  let score = 0;
  if (val.length >= 6)  score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const pct  = (score / 5) * 100;
  const cols  = ['#d00000','#ff6600','#ffb703','#2b9348','#00c851'];
  const names = ['WEAK','FAIR','GOOD','STRONG','PERFECT'];
  bar.style.width      = pct + '%';
  bar.style.background = cols[score - 1] || '#333';
  lbl.textContent      = val.length > 0 ? names[score - 1] || '' : '';
  lbl.style.color      = cols[score - 1] || 'var(--text-muted)';
});

// ─── OTP INPUT WIRING ────────────────────────────────────────────────────────

const otpInputs = document.querySelectorAll('.otp-input-box');
otpInputs.forEach((inp, i) => {
  inp.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    if (e.target.value.length > 0 && i < otpInputs.length - 1) otpInputs[i + 1].focus();
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && e.target.value === '' && i > 0) otpInputs[i - 1].focus();
  });
  inp.addEventListener('paste', (e) => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
    for (let j = 0; j < otpInputs.length && j < paste.length; j++) {
      otpInputs[i + j] && (otpInputs[i + j].value = paste[j]);
    }
    const lastFill = Math.min(i + paste.length, otpInputs.length - 1);
    otpInputs[lastFill].focus();
  });
});

// ─── STATE ───────────────────────────────────────────────────────────────────

let pendingEmail    = '';
let pendingUsername = '';
let resendCountdown = null;

// ─── LOGIN FORM ───────────────────────────────────────────────────────────────

const loginForm    = document.getElementById('login-form');
const loginBtn     = document.getElementById('login-btn');
const alertLogin   = document.getElementById('alert-login');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertLogin);

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showAlert(alertLogin, 'Please enter a valid email address.');
  }
  if (!password) {
    return showAlert(alertLogin, 'Please enter your password.');
  }

  setLoading(loginBtn, true);
  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      return showAlert(alertLogin, data.error || 'Login failed. Check your credentials.');
    }

    saveToken(data.token, data.user);
    showAlert(alertLogin, 'Welcome back! Entering arena...', 'success');
    setTimeout(() => {
      if (data.user.fighters && data.user.fighters.length === 0) {
        window.location.href = '/create.html';
      } else {
        window.location.href = '/select.html';
      }
    }, 800);
  } catch (err) {
    showAlert(alertLogin, 'Network error. Is the server running?');
  } finally {
    setLoading(loginBtn, false);
  }
});

// ─── SIGN UP FORM ─────────────────────────────────────────────────────────────

const signupForm  = document.getElementById('signup-form');
const signupBtn   = document.getElementById('signup-btn');
const alertSignup = document.getElementById('alert-signup');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertSignup);

  const username = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim().toLowerCase();
  const password = document.getElementById('signup-pass').value;

  if (!username || username.length < 3) {
    return showAlert(alertSignup, 'Username must be at least 3 characters.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showAlert(alertSignup, 'Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    return showAlert(alertSignup, 'Password must be at least 6 characters.');
  }

  setLoading(signupBtn, true);
  try {
    const res  = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      return showAlert(alertSignup, data.error || 'Signup failed. Please try again.');
    }

    // Move to OTP step
    pendingEmail    = email;
    pendingUsername = username;
    goToOTPStep();

  } catch (err) {
    showAlert(alertSignup, 'Network error. Is the server running?');
  } finally {
    setLoading(signupBtn, false);
  }
});

// ─── OTP STEP NAVIGATION ──────────────────────────────────────────────────────

function goToOTPStep() {
  document.getElementById('signup-step1').style.display = 'none';
  document.getElementById('signup-step2').style.display = 'block';
  document.getElementById('otp-sent-to').textContent   = `Code sent to ${pendingEmail}`;
  // Mark step dots
  document.getElementById('dot-1').classList.remove('active');
  document.getElementById('dot-1').classList.add('done');
  document.getElementById('line-1').classList.add('done');
  document.getElementById('dot-2').classList.add('active');
  // Clear any old OTP entries
  otpInputs.forEach(i => i.value = '');
  otpInputs[0].focus();
  startResendTimer();
}

function backToStep1() {
  document.getElementById('signup-step2').style.display = 'none';
  document.getElementById('signup-step1').style.display = 'block';
  document.getElementById('dot-1').classList.add('active');
  document.getElementById('dot-1').classList.remove('done');
  document.getElementById('line-1').classList.remove('done');
  document.getElementById('dot-2').classList.remove('active');
  clearInterval(resendCountdown);
  hideAlert(document.getElementById('alert-otp'));
}
document.getElementById('back-btn').addEventListener('click', backToStep1);

// ─── RESEND TIMER ────────────────────────────────────────────────────────────

function startResendTimer(seconds = 60) {
  const btn   = document.getElementById('resend-btn');
  const timer = document.getElementById('resend-timer');
  btn.style.display   = 'none';
  timer.style.display = 'inline';
  let t = seconds;
  timer.textContent = `RESEND IN ${t}s`;
  resendCountdown = setInterval(() => {
    t--;
    if (t <= 0) {
      clearInterval(resendCountdown);
      timer.style.display = 'none';
      btn.style.display   = 'inline';
    } else {
      timer.textContent = `RESEND IN ${t}s`;
    }
  }, 1000);
}

async function resendOTP() {
  const alertOtp = document.getElementById('alert-otp');
  hideAlert(alertOtp);
  try {
    const res  = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, username: pendingUsername, password: document.getElementById('signup-pass').value })
    });
    const data = await res.json();
    if (!res.ok) return showAlert(alertOtp, data.error || 'Failed to resend.');
    showAlert(alertOtp, 'New code sent!', 'success');
    otpInputs.forEach(i => i.value = '');
    otpInputs[0].focus();
    startResendTimer();
  } catch(err) {
    showAlert(alertOtp, 'Network error. Try again.');
  }
}
document.getElementById('resend-btn').addEventListener('click', resendOTP);

// ─── OTP VERIFY ──────────────────────────────────────────────────────────────

const otpForm      = document.getElementById('otp-form');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const alertOtp     = document.getElementById('alert-otp');

otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertOtp);

  const otp = Array.from(otpInputs).map(i => i.value).join('');
  if (otp.length !== 6) {
    return showAlert(alertOtp, 'Please enter the full 6-digit code.');
  }

  setLoading(verifyOtpBtn, true);
  try {
    const res  = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, otp })
    });
    const data = await res.json();

    if (!res.ok) {
      return showAlert(alertOtp, data.error || 'Verification failed.');
    }

    saveToken(data.token, data.user);
    showAlert(alertOtp, 'Account created! Entering arena...', 'success');
    clearInterval(resendCountdown);
    setTimeout(() => {
      if (data.user.fighters && data.user.fighters.length === 0) {
        window.location.href = '/create.html';
      } else {
        window.location.href = '/select.html';
      }
    }, 800);
  } catch (err) {
    showAlert(alertOtp, 'Network error. Is the server running?');
  } finally {
    setLoading(verifyOtpBtn, false);
  }
});
