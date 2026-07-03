const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { findUserByEmail, findUserById, saveUser, getAllUsers, saveOTP, findOTP, clearOTP } = require('./users');
const { sendOTPEmail } = require('./brevo');

const router = express.Router();

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────

function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// ─── OTP AUTHENTICATION ────────────────────────────────────────────────────────

// ─── AUTHENTICATION ROUTES ──────────────────────────────────────────────────────

// 1. SIGN UP
router.post('/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already in use
    const allUsers = await getAllUsers();
    let existingUser = await findUserByEmail(email);

    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ error: 'Email is already registered. Please login.' });
    }

    // Check if username taken (only consider verified users for username conflicts)
    if (allUsers.some(u => u.username && u.username.toLowerCase() === username.toLowerCase() && u.isVerified)) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Save or update user as unverified
    if (existingUser) {
      existingUser.username = username;
      existingUser.password_hash = passwordHash;
      existingUser.isVerified = false;
      await saveUser(existingUser);
    } else {
      await saveUser({
        email: email.toLowerCase(),
        username: username,
        password_hash: passwordHash,
        isVerified: false,
        fighters: []
      });
    }

    // Generate 6-digit OTP for email verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpSalt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, otpSalt);
    
    // Expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await saveOTP(email, otpHash, expiresAt);
    await sendOTPEmail(email, otp);

    console.log(`[AUTH] Signup initiated, OTP sent to ${email}`);
    res.json({ success: true, message: 'OTP sent successfully' });

  } catch (err) {
    console.error('[AUTH] Signup error:', err.message);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

// 2. VERIFY SIGNUP OTP
router.post('/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const otpRecord = await findOTP(email);
    if (!otpRecord || !otpRecord.otp_hash) {
      return res.status(400).json({ error: 'No OTP found or expired' });
    }

    if (new Date() > new Date(otpRecord.otp_expires)) {
      await clearOTP(email);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otp_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Clear OTP after successful verification
    await clearOTP(email);

    // Mark user as verified
    let user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isVerified = true;
    user = await saveUser(user);

    // Issue JWT
    const token = jwt.sign(
      { id: user.id || user._id, email: user.email, username: user.username },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '7d' }
    );

    console.log(`[AUTH] User verified and logged in: ${email}`);
    res.json({
      success: true,
      token,
      user: {
        id: user.id || user._id,
        email: user.email,
        username: user.username,
        fighters: user.fighters || []
      }
    });

  } catch (err) {
    console.error('[AUTH] Verify error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// 3. LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    
    // Allow unverified users to login if they previously used the old OTP system 
    // and just happened to set a password? No, let's enforce verification, OR
    // handle legacy users (users who have no password_hash).
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return res.status(400).json({ error: 'Legacy account detected. Please Sign Up again with this email to set a password.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Email is not verified. Please sign up to receive an OTP.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Issue JWT
    const token = jwt.sign(
      { id: user.id || user._id, email: user.email, username: user.username },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '7d' }
    );

    console.log(`[AUTH] Login successful: ${email}`);
    res.json({
      success: true,
      token,
      user: {
        id: user.id || user._id,
        email: user.email,
        username: user.username,
        fighters: user.fighters || []
      }
    });

  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────

router.get('/me', authenticateJWT, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id || user._id,
      email: user.email,
      username: user.username,
      fighters: user.fighters || []
    });
  } catch(err) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = { router, authenticateJWT };
