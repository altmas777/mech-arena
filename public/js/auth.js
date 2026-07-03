const API_BASE = '';

function showAlert(el, message, type = 'error') {
  el.className = `alert alert-${type} show`;
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span> ${message}`;
}

function hideAlert(el) {
  el.classList.remove('show');
}

function setLoading(btn, loading) {
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function saveToken(token, userData) {
  localStorage.setItem('ff_token', token);
  localStorage.setItem('ff_user', JSON.stringify(userData));
}

function getToken() {
  return localStorage.getItem('ff_token');
}

if (getToken()) {
  window.location.href = '/select.html';
}

// Elements
const stepEmail = document.getElementById('step-email');
const stepOtp = document.getElementById('step-otp');

const emailForm = document.getElementById('email-form');
const emailInput = document.getElementById('email-input');
const sendOtpBtn = document.getElementById('send-otp-btn');
const alertEmail = document.getElementById('alert-email');

const otpForm = document.getElementById('otp-form');
const otpInputs = document.querySelectorAll('.otp-input-box');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const alertOtp = document.getElementById('alert-otp');
const otpSentMsg = document.getElementById('otp-sent-msg');
const btnBackEmail = document.getElementById('btn-back-email');

const usernameGroup = document.getElementById('username-group');
const usernameInput = document.getElementById('username-input');

let currentEmail = '';

// Auto-advance OTP inputs
otpInputs.forEach((input, index) => {
  input.addEventListener('input', (e) => {
    // Only accept numbers
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    if (e.target.value.length > 0 && index < otpInputs.length - 1) {
      otpInputs[index + 1].focus();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
      otpInputs[index - 1].focus();
    }
  });
});

// Step 1: Send OTP
emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEmail);

  const email = emailInput.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAlert(alertEmail, 'Please enter a valid Gmail address.');
    return;
  }

  setLoading(sendOtpBtn, true);

  try {
    const res = await fetch(`${API_BASE}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(alertEmail, data.error || 'Failed to send OTP.');
      return;
    }

    // Success! Move to step 2
    currentEmail = email;
    stepEmail.style.display = 'none';
    stepOtp.style.display = 'block';
    otpSentMsg.textContent = `Sent to ${email}`;
    otpInputs[0].focus();

  } catch (err) {
    showAlert(alertEmail, 'Network error. Is the server running?');
  } finally {
    setLoading(sendOtpBtn, false);
  }
});

// Back button
btnBackEmail.addEventListener('click', () => {
  stepOtp.style.display = 'none';
  stepEmail.style.display = 'block';
  hideAlert(alertOtp);
  // Clear OTP fields
  otpInputs.forEach(input => input.value = '');
});

// Step 2: Verify OTP
otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertOtp);

  // Get OTP
  const otp = Array.from(otpInputs).map(input => input.value).join('');
  if (otp.length !== 6) {
    showAlert(alertOtp, 'Please enter the full 6-digit code.');
    return;
  }

  const username = usernameInput.value.trim();

  setLoading(verifyOtpBtn, true);

  try {
    const res = await fetch(`${API_BASE}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail, otp, username })
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.error === 'USERNAME_REQUIRED') {
        usernameGroup.style.display = 'block';
        usernameInput.required = true;
        usernameInput.focus();
        showAlert(alertOtp, 'First time login! Please choose a username.', 'info');
      } else {
        showAlert(alertOtp, data.error || 'Verification failed.');
      }
      return;
    }

    saveToken(data.token, data.user);
    showAlert(alertOtp, 'Login successful! Entering arena...', 'success');
    
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
