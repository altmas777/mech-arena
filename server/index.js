require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { setupSockets } = require('./socket');

const { router: authRouter, authenticateJWT } = require('./auth');
const { analyzeFaceForStats, generateKOCommentary } = require('./gemini');
const { findUserById, saveUser, getAllUsers } = require('./users');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/facefighter')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' })); // For base64 images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Auth routes (OTP, JWT)
app.use('/auth', authRouter);

// ─── CHARACTER CREATION ───────────────────────────────────────────────────────

app.post('/api/character/create', authenticateJWT, async (req, res) => {
  try {
    const { name, face_image_base64, mime_type, element, suit } = req.body;

    if (!name || !face_image_base64) {
      return res.status(400).json({ error: 'Name and face image are required' });
    }

    if (name.length < 2 || name.length > 20) {
      return res.status(400).json({ error: 'Fighter name must be 2-20 characters' });
    }

    console.log(`[CHARACTER] Creating fighter "${name}" for user ${req.user.email}`);

    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Basic stats based on element
    const stats = {
      power: Math.floor(65 + Math.random() * 20),
      speed: Math.floor(65 + Math.random() * 20),
      defense: Math.floor(65 + Math.random() * 20),
      element: element || 'fire',
      special_move: `${(element || 'fire').toUpperCase()} BLAST`
    };

    const fighter = {
      id: uuidv4(),
      name,
      face_image_base64,
      mime_type: mime_type || 'image/jpeg',
      stats,
      suit: suit || 'default',
      created_at: new Date().toISOString()
    };

    if (!user.fighters) user.fighters = [];
    user.fighters.push(fighter);
    await saveUser(user);

    console.log(`[CHARACTER] Fighter created: ${name} | Element: ${stats.element} | Suit: ${fighter.suit}`);
    res.json({ success: true, fighter });

  } catch (err) {
    console.error('[CHARACTER] create error:', err.message);
    res.status(500).json({ error: 'Failed to create character. Please try again. Details: ' + err.message });
  }
});

// ─── GET FIGHTERS ─────────────────────────────────────────────────────────────

app.get('/api/fighters', authenticateJWT, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ fighters: user.fighters || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fighters' });
  }
});

// ─── GET ALL FIGHTERS (for opponent selection) ────────────────────────────────

app.get('/api/fighters/all', authenticateJWT, async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const allFighters = [];

    allUsers.forEach(u => {
      if (u.fighters && u.fighters.length > 0) {
        u.fighters.forEach(f => {
          allFighters.push({
            id: f.id,
            name: f.name,
            stats: f.stats,
            // Include face for rendering, but owner info
            face_image_base64: f.face_image_base64,
            mime_type: f.mime_type,
            owner_email: u.email,
            is_own: u.id === req.user.id
          });
        });
      }
    });

    res.json({ fighters: allFighters });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fighters' });
  }
});

// ─── KO COMMENTARY ───────────────────────────────────────────────────────────

app.post('/api/commentary/ko', authenticateJWT, async (req, res) => {
  try {
    const { winner_name, loser_name } = req.body;
    if (!winner_name || !loser_name) {
      return res.status(400).json({ error: 'Winner and loser names required' });
    }

    const commentary = await generateKOCommentary(winner_name, loser_name);
    res.json({ commentary });
  } catch (err) {
    console.error('[COMMENTARY] error:', err.message);
    res.json({ commentary: `${req.body.winner_name?.toUpperCase()} WINS! FLAWLESS VICTORY!` });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'MECH ARENA',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ─── CATCH-ALL (SPA) ─────────────────────────────────────────────────────────

// Only handle GET requests that don't start with /api or /auth to let those APIs fail properly or hit their routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

const server = http.createServer(app);
setupSockets(server);

const startServer = (portToTry) => {
  server.listen(portToTry, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  ⚡ MECH ARENA SERVER RUNNING`);
    console.log(`  🌐 http://localhost:${portToTry}`);
    console.log(`  📧 Brevo: ${process.env.BREVO_API_KEY && process.env.BREVO_API_KEY !== 'your_brevo_api_key_here' ? '✅ Configured' : '⚠️  Dev Mode (check console for OTPs)'}`);
    console.log(`  🤖 Gemini: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' ? '✅ Configured' : '⚠️  Dev Mode (mock stats)'}`);
    console.log(`${'='.repeat(50)}\n`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE' && portToTry == 3000) {
      console.log(`⚠️  Port 3000 is busy. Attempting to start on port 3002...`);
      startServer(3002);
    } else {
      console.error(`❌ Failed to start server:`, err.message);
      process.exit(1);
    }
  });
};

startServer(PORT);

module.exports = server;
