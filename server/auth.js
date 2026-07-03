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

// 1. Send OTP
router.post('/otp/send', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);
    
    // Expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await saveOTP(email, otpHash, expiresAt);

    // Send email via Brevo
    await sendOTPEmail(email, otp);

    console.log(`[AUTH] OTP sent to ${email}`);
    res.json({ success: true, message: 'OTP sent successfully' });

  } catch (err) {
    console.error('[AUTH] Send OTP error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// 2. Verify OTP and Login
router.post('/otp/verify', async (req, res) => {
  try {
    const { email, otp, username } = req.body;

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

    // Find or create user
    let user = await findUserByEmail(email);

    if (!user || !user.username) {
      if (!username) {
        return res.status(400).json({ error: 'USERNAME_REQUIRED' });
      }
      
      // Check if username is taken
      const allUsers = await getAllUsers();
      if (allUsers.some(u => u.username && u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ error: 'Username is already taken' });
      }

      if (user) {
        user.username = username;
        if (!user.fighters) user.fighters = [];
        user = await saveUser(user);
      } else {
        user = await saveUser({
          email: email.toLowerCase(),
          username: username,
          fighters: []
        });
      }
      console.log(`[AUTH] New user created/updated via OTP Auth: ${email} (${username})`);
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
    console.error('[AUTH] Verify OTP error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
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
