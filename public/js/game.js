/**
 * game.js — MECH ARENA v4  — TRUE 3D Fighting Engine
 *
 * ✅ 360-degree circular arena (pillars/crowd/dome all around)
 * ✅ 4-directional movement: W=toward opp, S=away, A/D=sidestep (P1)
 *                            ↑=toward opp, ↓=away, ←/→=sidestep (P2)
 * ✅ Orbital camera — always perpendicular to fighter line, auto-orbits
 * ✅ Jump (Space/Enter), Crouch (LeftCtrl/RShift hold)
 * ✅ Punch (F/1), Kick (G/2), Special (H/3)
 * ✅ Jump-punch, Jump-kick, Crouch-punch, Crouch-kick
 * ✅ Projectile special moves
 */

import * as THREE from 'three';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CFG = {
  MAX_HP:          100,
  MATCH_DURATION:  99,
  ROUNDS_TO_WIN:   2,          // Best of 2 rounds
  ARENA_RADIUS:    8.0,
  GROUND_Y:        0,
  GRAVITY:        -24,
  JUMP_VELOCITY:   10,
  MOVE_SPEED:      5.2,        // faster = more responsive
  TURN_SPEED:      0.22,

  DMG: {
    punch:8, kick:13, jumpKick:18, jumpPunch:12,
    crouchPunch:7, crouchKick:11, special:24
  },

  BLOCK_REDUCTION: 0.15,       // blocked hits do 15% damage

  HIT_COOLDOWN:       400,
  PUNCH_DURATION:     0.26,    // faster attacks = more responsive
  KICK_DURATION:      0.38,
  JUMP_KICK_DURATION: 0.44,
  SPECIAL_DURATION:   0.72,

  HBOX: {
    punch:       new THREE.Vector3(0.5, 0.4, 0.6),
    kick:        new THREE.Vector3(0.5, 0.45, 0.7),
    jumpKick:    new THREE.Vector3(0.55, 0.5, 0.72),
    crouchKick:  new THREE.Vector3(0.7, 0.3, 0.55),
    crouchPunch: new THREE.Vector3(0.5, 0.35, 0.62),
    jumpPunch:   new THREE.Vector3(0.5, 0.45, 0.65),
    special:     new THREE.Vector3(0.85, 0.75, 0.85),
  }
};

const ELEMENT_COLORS = {
  fire:0xff3c00, ice:0x87ceeb, lightning:0xffd700,
  shadow:0x9b59b6, earth:0x8B4513, wind:0x98fb98,
  plasma:0x00ffff, void:0x4a0080,
};

// ─── GLOBALS ─────────────────────────────────────────────────────────────────

let scene, camera, renderer, clock;
let p1Data, p2Data;
const fighters = {};

const gameState = {
  running:false, over:false,
  timer:CFG.MATCH_DURATION,
  lastHitTime:{ p1:0, p2:0 },
  round: 1,
  wins: { p1: 0, p2: 0 },
};

// Camera orbital state
let cameraAngle = Math.PI * 0.5; // start viewing from side
const cameraLookTarget = new THREE.Vector3(0, 1.5, 0);

// Keys
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// Single-press attacks
const atk = { p1Punch:false, p1Kick:false, p1Jump:false, p1Special:false, p1Block:false,
               p2Punch:false, p2Kick:false, p2Jump:false, p2Special:false };

window.addEventListener('keydown', e => {
  if (e.code==='KeyF')  atk.p1Punch   = true;
  if (e.code==='KeyG')  atk.p1Kick    = true;
  if (e.code==='KeyH')  atk.p1Special = true;
  if (e.code==='Space') atk.p1Jump    = true;
  if (e.code==='KeyQ')  atk.p1Block   = true;  // Q = Block
  // P2 is fully AI-controlled or remote player — no local keys needed
});
window.addEventListener('keyup', e => {
  if (e.code==='KeyQ') atk.p1Block = false; // release block on keyup
});

// ── Mobile fix: clear ALL stuck keys when page loses focus or becomes hidden ──
function clearAllInputs() {
  for (const k in keys) keys[k] = false;
  atk.p1Punch = atk.p1Kick = atk.p1Jump = atk.p1Special = atk.p1Block = false;
  atk.p2Punch = atk.p2Kick = atk.p2Jump = atk.p2Special = false;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearAllInputs();
});
window.addEventListener('blur', clearAllInputs);
window.addEventListener('contextmenu', clearAllInputs); // long-press context menu on mobile

// ─── MOBILE TOUCH CONTROLS ────────────────────────────────────────────────────

(function setupMobileControls() {
  // Show on touch devices only
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouchDevice) return;

  const mc = document.getElementById('mobile-controls');
  if (!mc) return;
  mc.style.display = 'block';

  // Helper: wire a button to set/clear a key while held
  function holdKey(btnId, keyCode) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const press = (e) => { e.preventDefault(); keys[keyCode] = true; btn.classList.add('pressed'); };
    const release = (e) => { e.preventDefault(); keys[keyCode] = false; btn.classList.remove('pressed'); };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend',   release, { passive: false });
    btn.addEventListener('touchcancel',release, { passive: false });
  }

  // Helper: wire a button to fire a one-shot atk flag
  function tapAtk(btnId, atkKey) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const press = (e) => { e.preventDefault(); atk[atkKey] = true; btn.classList.add('pressed'); };
    const release = (e) => { e.preventDefault(); btn.classList.remove('pressed'); };
    btn.addEventListener('touchstart', press,   { passive: false });
    btn.addEventListener('touchend',   release, { passive: false });
    btn.addEventListener('touchcancel',release, { passive: false });
  }

  // Helper: hold-to-hold atk (for Block)
  function holdAtk(btnId, atkKey) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const press = (e) => { e.preventDefault(); atk[atkKey] = true; btn.classList.add('pressed'); };
    const release = (e) => { e.preventDefault(); atk[atkKey] = false; btn.classList.remove('pressed'); };
    btn.addEventListener('touchstart', press,   { passive: false });
    btn.addEventListener('touchend',   release, { passive: false });
    btn.addEventListener('touchcancel',release, { passive: false });
  }

  // D-Pad → movement keys
  holdKey('mb-up',    'KeyW');
  holdKey('mb-down',  'KeyS');
  holdKey('mb-left',  'KeyA');
  holdKey('mb-right', 'KeyD');

  // Action buttons
  tapAtk('mb-jump',    'p1Jump');
  tapAtk('mb-punch',   'p1Punch');
  tapAtk('mb-kick',    'p1Kick');
  tapAtk('mb-special', 'p1Special');
  holdAtk('mb-block',  'p1Block');
})();


// ─── DOM ─────────────────────────────────────────────────────────────────────

const canvas           = document.getElementById('game-canvas');
const loadingEl        = document.getElementById('game-loading');
const loadingBar       = document.getElementById('loading-bar');
const loadingStatus    = document.getElementById('loading-status');
const p1HpBar          = document.getElementById('p1-hp-bar');
const p2HpBar          = document.getElementById('p2-hp-bar');
const p1NameEl         = document.getElementById('p1-name');
const p2NameEl         = document.getElementById('p2-name');
const p1ElementEl      = document.getElementById('p1-element-badge');
const p2ElementEl      = document.getElementById('p2-element-badge');
const p1SpecialEl      = document.getElementById('p1-special');
const p2SpecialEl      = document.getElementById('p2-special');
const timerEl          = document.getElementById('timer-display');
const announcerOverlay = document.getElementById('announcer-overlay');
const koText           = document.getElementById('ko-text');
const winnerText       = document.getElementById('winner-text');
const announcerText    = document.getElementById('announcer-text');
const rematchBtn       = document.getElementById('rematch-btn');
const exitBtn          = document.getElementById('exit-btn');

// ─── EXIT BUTTON — wired immediately so it always works ──────────────────────
if (exitBtn) {
  exitBtn.addEventListener('click', () => {
    const msg = isMultiplayer ? 'Exit match? Your opponent will win.' : 'Exit to main menu?';
    if (confirm(msg)) {
      if (isMultiplayer && socket && roomId) {
        socket.emit('exitMatch', { roomId });
        setTimeout(() => { window.location.href = '/select.html'; }, 300);
      } else {
        window.location.href = '/select.html';
      }
    }
  });

  // Bind Escape key to exit button click
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      exitBtn.click();
    }
  });
}


// ─── FIGHTER CLASS ───────────────────────────────────────────────────────────

class Fighter {
  constructor(data, side) {
    this.data  = data;
    this.side  = side;
    this.hp    = CFG.MAX_HP;
    this.maxHp = CFG.MAX_HP;

    // Physics
    this.velY         = 0;
    this.onGround     = true;
    this.knockbackVel = new THREE.Vector3();

    // State
    this.state          = 'idle';
    this.stateTime      = 0;
    this.lastAttackTime = 0;
    this.targetYRot     = 0;  // smooth facing angle

    // Scene group — fighters start on opposite sides of the arena
    this.group = new THREE.Group();
    const startX = side === 'p1' ? -2.5 : 2.5;
    this.group.position.set(startX, CFG.GROUND_Y, 0);
    scene.add(this.group);

    // Hitboxes
    this.hitBox = { hand: new THREE.Box3(), body: new THREE.Box3() };

    this._buildBody();
  }

  // ── BUILD BODY ───────────────────────────────────────────────────────────

  _buildBody() {
    const col  = ELEMENT_COLORS[this.data.stats?.element] || 0xff3c00;
    const isP1 = this.side === 'p1';

    let bodyColor   = isP1 ? 0x1a0010 : 0x001a10;
    let skinColor   = 0xb87040;
    let armorColor  = col;
    let bootColor   = isP1 ? 0x2a0008 : 0x08002a;
    let emissiveColor = new THREE.Color(col).multiplyScalar(0.35);
    let helmetColor = isP1 ? 0x330022 : 0x003322;

    if (this.data.suit === 'ninja') {
      bodyColor = 0x080808;
      skinColor = 0x080808;
      armorColor = 0x1a1a1a;
      bootColor = 0x020202;
      helmetColor = 0x0f0f0f;
      emissiveColor = new THREE.Color(col).multiplyScalar(0.15);
    } else if (this.data.suit === 'robot') {
      bodyColor = 0x4a5568;
      skinColor = 0x4a5568;
      armorColor = 0x718096;
      bootColor = 0x2d3748;
      helmetColor = 0x2d3748;
      emissiveColor = new THREE.Color(col).multiplyScalar(0.6);
    } else if (this.data.suit === 'spiderman') {
      bodyColor = 0xaa0000;
      skinColor = 0xaa0000;
      armorColor = 0x001888;
      bootColor = 0xaa0000;
      helmetColor = 0xaa0000;
      emissiveColor = new THREE.Color(0x000000);
    }

    this.mat = {
      body:   new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, metalness: 0.4 }),
      skin:   new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }),
      armor:  new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.2, metalness: 0.8, emissive: emissiveColor }),
      boot:   new THREE.MeshStandardMaterial({ color: bootColor, roughness: 0.4, metalness: 0.5 }),
      eye:    new THREE.MeshBasicMaterial({ color: col }),
      helmet: new THREE.MeshStandardMaterial({ color: helmetColor ?? bodyColor, roughness: 0.2, metalness: 0.9 }),
    };

    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    // ─ Torso (slightly larger, more muscular) ─
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.42, 6, 16), this.mat.body);
    this.torso.position.y = 1.16;
    this.torso.castShadow = true;
    this.bodyRoot.add(this.torso);

    // chest plate — angled sharp armor piece
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.12), this.mat.armor);
    chest.position.set(0, 0.08, 0.22);
    chest.rotation.x = 0.1;
    this.torso.add(chest);

    // chest trim lines
    const ctrimL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.06), this.mat.eye);
    ctrimL.position.set(-0.12, 0.08, 0.27); this.torso.add(ctrimL);
    const ctrimR = ctrimL.clone();
    ctrimR.position.set(0.12, 0.08, 0.27); this.torso.add(ctrimR);

    // belt
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.10, 16), this.mat.armor);
    belt.position.y = -0.26;
    this.torso.add(belt);

    // shoulder pads — bigger and more angular
    [-1,1].forEach(s => {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), this.mat.armor);
      sp.position.set(s*0.38, 0.24, 0);
      sp.rotation.z = s * -0.15;
      this.torso.add(sp);
      // shoulder spike
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), this.mat.eye);
      spike.position.set(s*0.38, 0.36, 0);
      spike.rotation.z = s * -Math.PI/2;
      this.bodyRoot.add(spike);
    });

    // ─ Head ─ (with full helmet)
    this.head = new THREE.Group();
    this.head.position.set(0,1.68,0);
    this.bodyRoot.add(this.head);

    // base skull
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), this.mat.skin);
    this.headMesh.castShadow = true;
    this.head.add(this.headMesh);

    // helmet shell
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 12, 0, Math.PI*2, 0, Math.PI*0.7), this.mat.helmet);
    helm.position.y = 0;
    this.head.add(helm);

    // face plate/visor — glowing
    const visorGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.07, 12, 1, false, -1.0, 2.0);
    const visor = new THREE.Mesh(visorGeo, this.mat.eye);
    visor.position.y = 0.04;
    this.head.add(visor);

    // face texture plane
    this.facePlane = new THREE.Mesh(
      new THREE.CylinderGeometry(0.225, 0.225, 0.36, 16, 1, true, -1.0, 2.0),
      new THREE.MeshBasicMaterial({ color:0xd4a574, transparent:true })
    );
    this.facePlane.position.set(0,0,0);
    this.head.add(this.facePlane);

    // eyes — bright glowing
    const eyeGeo = new THREE.SphereGeometry(0.05,8,8);
    [-0.09,0.09].forEach(x => {
      const eye = new THREE.Mesh(eyeGeo, this.mat.eye);
      eye.position.set(x, 0.06, 0.21);
      this.head.add(eye);
    });
    this.eyeLight = new THREE.PointLight(col, 1.4, 2.0);
    this.eyeLight.position.set(0, 0.06, 0.38);
    this.head.add(this.eyeLight);

    // crest/fin on top of helmet
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.34), this.mat.armor);
    crest.position.set(0, 0.28, -0.02);
    this.head.add(crest);

    // ─ Arms ─ (thicker and more muscular)
    this.upperArmL = this._limb([-0.42,1.26,0], [0.18,0.40,0.18], this.bodyRoot, this.mat.body);
    this.upperArmR = this._limb([ 0.42,1.26,0], [0.18,0.40,0.18], this.bodyRoot, this.mat.body);

    this.forearmL = this._limb([0,-0.38,0], [0.16,0.36,0.16], this.upperArmL, this.mat.body);
    this.forearmR = this._limb([0,-0.38,0], [0.16,0.36,0.16], this.upperArmR, this.mat.body);

    // gauntlets (fists)
    this.fistL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.20, 0.22), this.mat.armor);
    this.fistL.position.y = -0.34;
    this.forearmL.add(this.fistL);

    this.fistR = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.20, 0.22), this.mat.armor);
    this.fistR.position.y = -0.34;
    this.forearmR.add(this.fistR);

    // forearm guards
    [-1,1].forEach(s => {
      const fg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.18), this.mat.armor);
      fg.position.set(0, -0.14, s * 0.08);
      this.forearmR.add(fg);
    });

    // ─ Legs ─ (thicker, more armored)
    this.upperLegL = this._limb([-0.16,0.82,0], [0.20,0.46,0.20], this.bodyRoot, this.mat.body);
    this.upperLegR = this._limb([ 0.16,0.82,0], [0.20,0.46,0.20], this.bodyRoot, this.mat.body);

    this.shinL = this._limb([0,-0.46,0], [0.17,0.42,0.17], this.upperLegL, this.mat.body);
    this.shinR = this._limb([0,-0.46,0], [0.17,0.42,0.17], this.upperLegR, this.mat.body);

    // shin guards
    [this.shinL, this.shinR].forEach(s => {
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, 0.08), this.mat.armor);
      guard.position.set(0, -0.18, 0.08);
      s.add(guard);
    });

    this.footL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.30), this.mat.boot);
    this.footL.position.set(0,-0.44,0.06);
    this.shinL.add(this.footL);

    this.footR = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.30), this.mat.boot);
    this.footR.position.set(0,-0.44,0.06);
    this.shinR.add(this.footR);

    // boot trims
    [this.footL,this.footR].forEach(f => {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), this.mat.armor);
      trim.position.set(0, 0.02, -0.08);
      f.add(trim);
    });

    // ─ Aura ring ─
    this.auraMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.38,0.64,32),
      new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.3, side:THREE.DoubleSide })
    );
    this.auraMesh.rotation.x = -Math.PI/2;
    this.auraMesh.position.y = 0.01;
    this.group.add(this.auraMesh);

    // face texture
    if (this.data.face_image_base64) {
      this._applyFaceTexture(`data:${this.data.mime_type||'image/jpeg'};base64,${this.data.face_image_base64}`);
    } else if (this.data.face_texture_url) {
      this._applyFaceTexture(this.data.face_texture_url);
    }
  }

  _limb(pos, size, parent, mat) {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    const r = (size[0] + size[2]) / 4;
    const l = size[1] - r*2;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, l > 0 ? l : 0.1, 4, 16), mat);
    mesh.position.y = -size[1]*0.5;
    mesh.castShadow = true;
    g.add(mesh);
    return g;
  }

  _applyFaceTexture(src) {
    new THREE.TextureLoader().load(src, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.facePlane.material = new THREE.MeshBasicMaterial({ map:tex, transparent:true });
    });
  }

  // ── POSE RESET ───────────────────────────────────────────────────────────

  _resetPose() {
    this.torso.rotation.set(0,0,0);
    this.torso.position.set(0,1.16,0);
    this.head.position.set(0,1.68,0);
    this.head.rotation.set(0,0,0);
    [this.upperArmL,this.upperArmR,this.forearmL,this.forearmR,
     this.upperLegL,this.upperLegR,this.shinL,this.shinR].forEach(p => p.rotation.set(0,0,0));
    [this.footL,this.footR].forEach(f => f.rotation.set(0,0,0));
  }

  // ── STATE / ACTIONS ──────────────────────────────────────────────────────

  setState(s) {
    if (this.state==='death' || this.state===s) return;
    // Don't interrupt block with walk/idle to keep it sticky
    if (this.state==='block' && (s==='walk'||s==='idle')) return;
    this.state = s;
    this.stateTime = 0;
    
    // Trigger VFX on state entry (ensures network opponents also shoot projectiles)
    if (s === 'special') spawnProjectile(this);
  }

  _canAttack() { return this.state!=='death' && this.state!=='block' && Date.now()-this.lastAttackTime>320; }

  punch() {
    if (!this._canAttack()) return;
    this.lastAttackTime = Date.now();
    this.setState(this.onGround ? (this.state==='crouch'?'crouchPunch':'punch') : 'jumpPunch');
  }
  kick() {
    if (!this._canAttack()) return;
    this.lastAttackTime = Date.now();
    this.setState(this.onGround ? (this.state==='crouch'?'crouchKick':'kick') : 'jumpKick');
  }
  jump() {
    if (!this.onGround || this.state==='death') return;
    this.velY = CFG.JUMP_VELOCITY;
    this.onGround = false;
    this.setState('jump');
  }
  special() {
    if (!this._canAttack() || !this.onGround) return;
    this.lastAttackTime = Date.now();
    this.setState('special');
  }
  crouch() {
    if (!this.onGround) return;
    if (['death','hurt','punch','kick','crouchKick','crouchPunch','special','block'].includes(this.state)) return;
    this.setState('crouch');
  }
  block() {
    if (this.state==='death') return;
    this.setState('block');
  }

  takeDamage(amount, srcFighter) {
    if (this.state==='death') return false;
    // Block reduces damage significantly
    if (this.state === 'block') {
      amount = Math.max(1, Math.round(amount * CFG.BLOCK_REDUCTION));
    }
    this.hp = Math.max(0, this.hp - amount);
    const kbDir = new THREE.Vector3()
      .subVectors(this.group.position, srcFighter.group.position)
      .setY(0).normalize();
    // Reduced knockback when blocking
    const kbMult = this.state === 'block' ? 0.3 : 1.0;
    this.knockbackVel.copy(kbDir.multiplyScalar((4 + amount * 0.15) * kbMult));
    this.knockbackVel.y = this.state === 'block' ? 0.2 : 1.5;
    this.onGround = false;
    if (this.state !== 'block') this.setState('hurt');
    if (this.hp===0) { this.state='death'; this.stateTime=0; return true; }
    return false;
  }

  getHpPercent() { return (this.hp/this.maxHp)*100; }

  // ── UPDATE ───────────────────────────────────────────────────────────────

  update(delta, elapsed) {
    this.stateTime += delta;
    const st = this.stateTime;

    // Physics — gravity + knockback
    if (!this.onGround || this.velY !== 0 || this.group.position.y > CFG.GROUND_Y) {
      this.velY += CFG.GRAVITY * delta;
      this.group.position.y += this.velY * delta;
      if (this.group.position.y <= CFG.GROUND_Y) {
        this.group.position.y = CFG.GROUND_Y;
        this.velY = 0;
        this.onGround = true;
        if (['jump','jumpKick','jumpPunch'].includes(this.state)) this.setState('idle');
      }
    }
    if (this.knockbackVel.lengthSq() > 0.001) {
      this.group.position.addScaledVector(this.knockbackVel, delta);
      this.knockbackVel.multiplyScalar(0.8);
      clampToArena(this.group.position);
    }

    // Smooth facing rotation (faster so player head/aim stays on opponent)
    let dAngle = this.targetYRot - this.group.rotation.y;
    while (dAngle >  Math.PI) dAngle -= Math.PI*2;
    while (dAngle < -Math.PI) dAngle += Math.PI*2;
    this.group.rotation.y += dAngle * 0.85;

    // State timeouts
    if (this.state==='hurt'        && st>0.35)                      this.setState('idle');
    if (this.state==='punch'       && st>CFG.PUNCH_DURATION)        this.setState('idle');
    if (this.state==='kick'        && st>CFG.KICK_DURATION)         this.setState('idle');
    if (this.state==='jumpKick'    && st>CFG.JUMP_KICK_DURATION && this.onGround) this.setState('idle');
    if (this.state==='jumpPunch'   && st>CFG.PUNCH_DURATION && !this.onGround)    this.setState('jump');
    if (this.state==='crouchPunch' && st>CFG.PUNCH_DURATION)        this.setState('crouch');
    if (this.state==='crouchKick'  && st>CFG.KICK_DURATION)         this.setState('crouch');
    if (this.state==='special'     && st>CFG.SPECIAL_DURATION)      this.setState('idle');
    // Block releases when key released (handled in keyup), so just ensure it stays if key held
    // (atk.p1Block is kept true while Q is held via keyup listener)

    this._animate(delta, elapsed);

    // Aura pulse
    const pulse = 0.2 + Math.sin(elapsed*3)*0.12;
    this.auraMesh.material.opacity = pulse;
    this.auraMesh.scale.setScalar(1 + Math.sin(elapsed*2.5)*0.08);
    this.eyeLight.intensity = this.state==='special' ? 2+Math.sin(elapsed*20)*1.5 : 0.8;
  }

  // ── ANIMATIONS ───────────────────────────────────────────────────────────
  // All animations in LOCAL space — +Z is forward (toward opponent).
  // Group Y-rotation handles world-space facing.

  _animate(delta, elapsed) {
    const t  = elapsed;
    const st = this.stateTime;
    this._resetPose();

    switch (this.state) {

      case 'idle': {
        const bob = Math.sin(t*2.2)*0.025;
        this.torso.position.y = 1.16 + bob;
        this.head.position.y  = 1.68 + bob;
        // fighting stance arms
        this.upperArmL.rotation.z = -0.25;
        this.upperArmR.rotation.z =  0.25;
        this.forearmL.rotation.x  = -0.2;
        this.forearmR.rotation.x  = -0.2;
        // slight forward lean
        this.torso.rotation.x = 0.04;
        break;
      }

      case 'walk': {
        const wc = Math.sin(t*9);
        this.torso.position.y = 1.16 + Math.abs(Math.sin(t*9))*0.04;
        this.head.position.y  = 1.68 + Math.abs(Math.sin(t*9))*0.04;
        this.upperArmL.rotation.x =  wc*0.55;
        this.upperArmR.rotation.x = -wc*0.55;
        this.forearmL.rotation.x  =  Math.max(0,wc)*0.4 - 0.1;
        this.forearmR.rotation.x  =  Math.max(0,-wc)*0.4 - 0.1;
        this.upperLegL.rotation.x = -wc*0.6;
        this.upperLegR.rotation.x =  wc*0.6;
        this.shinL.rotation.x     =  Math.max(0,wc)*0.75;
        this.shinR.rotation.x     =  Math.max(0,-wc)*0.75;
        this.torso.rotation.z     =  wc*0.03;
        break;
      }

      case 'jump': {
        const tuck = Math.min(st/0.22,1);
        this.upperArmL.rotation.z = -0.9;
        this.upperArmR.rotation.z =  0.9;
        this.forearmL.rotation.x  = -0.4;
        this.forearmR.rotation.x  = -0.4;
        this.upperLegL.rotation.x = -tuck*0.8;
        this.upperLegR.rotation.x = -tuck*0.8;
        this.shinL.rotation.x     =  tuck*1.2;
        this.shinR.rotation.x     =  tuck*1.2;
        this.torso.rotation.x     = -0.1;
        break;
      }

      case 'block': {
        // Defensive stance — arms cross in front
        this.upperArmL.rotation.x = -0.8;
        this.upperArmR.rotation.x = -0.8;
        this.upperArmL.rotation.z = -0.4;
        this.upperArmR.rotation.z =  0.4;
        this.forearmL.rotation.x  = -1.1;
        this.forearmR.rotation.x  = -1.1;
        this.forearmL.rotation.y  =  0.5;
        this.forearmR.rotation.y  = -0.5;
        this.torso.rotation.x     = 0.12;
        // slight squat
        this.upperLegL.rotation.x = -0.2;
        this.upperLegR.rotation.x = -0.2;
        this.shinL.rotation.x     = 0.3;
        this.shinR.rotation.x     = 0.3;
        break;
      }

      case 'crouch': {
        this.torso.position.y     = 0.82;
        this.head.position.y      = 1.33;
        this.upperLegL.rotation.x = -0.9;
        this.upperLegR.rotation.x = -0.9;
        this.shinL.rotation.x     =  1.45;
        this.shinR.rotation.x     =  1.45;
        this.upperArmL.rotation.z = -0.5;
        this.upperArmR.rotation.z =  0.5;
        this.forearmL.rotation.x  = -0.3;
        this.forearmR.rotation.x  = -0.3;
        break;
      }

      case 'punch': {
        const prog = Math.min(st/CFG.PUNCH_DURATION,1);
        const ext  = Math.sin(prog*Math.PI);
        // Right arm jabs FORWARD (+Z in local space)
        this.upperArmR.rotation.x = -ext*1.6;
        this.forearmR.rotation.x  =  ext*0.5 - 0.3;
        // Guard left arm
        this.upperArmL.rotation.z = -0.75;
        this.forearmL.rotation.x  = -0.65;
        // Body lean forward
        this.torso.rotation.x     = -ext*0.12;
        this.head.position.z      =  ext*0.04;
        break;
      }

      case 'kick': {
        const prog = Math.min(st/CFG.KICK_DURATION,1);
        const arc  = Math.sin(prog*Math.PI);
        // Right leg roundhouse kicks FORWARD
        this.upperLegR.rotation.x = -arc*1.75;
        this.shinR.rotation.x     =  arc*0.6;
        // Arms balance
        this.upperArmL.rotation.z = -0.65 - arc*0.3;
        this.upperArmR.rotation.z =  0.65 + arc*0.3;
        this.torso.rotation.x     =  arc*0.08;
        break;
      }

      case 'jumpKick': {
        const prog = Math.min(st/CFG.JUMP_KICK_DURATION,1);
        const arc  = Math.sin(prog*Math.PI);
        // Flying kick — both legs, right leg extends forward
        this.upperLegR.rotation.x = -arc*1.9;
        this.shinR.rotation.x     =  arc*0.5;
        this.upperLegL.rotation.x = -0.45;
        this.shinL.rotation.x     =  0.85;
        this.torso.rotation.x     = -arc*0.3;
        this.upperArmL.rotation.x = -1.0;
        this.upperArmR.rotation.x =  0.35;
        break;
      }

      case 'jumpPunch': {
        const prog = Math.min(st/CFG.PUNCH_DURATION,1);
        const ext  = Math.sin(prog*Math.PI);
        // Overhead down-punch
        this.upperArmR.rotation.x = -1.0 - ext*0.85;
        this.forearmR.rotation.x  =  ext*0.5;
        this.upperLegL.rotation.x = -0.6;
        this.shinL.rotation.x     =  1.0;
        this.torso.rotation.x     = -ext*0.25;
        break;
      }

      case 'crouchPunch': {
        const prog = Math.min(st/CFG.PUNCH_DURATION,1);
        const ext  = Math.sin(prog*Math.PI);
        this.torso.position.y     = 0.82;
        this.head.position.y      = 1.33;
        this.upperLegL.rotation.x = -0.9;
        this.upperLegR.rotation.x = -0.9;
        this.shinL.rotation.x     =  1.45;
        this.shinR.rotation.x     =  1.45;
        this.upperArmR.rotation.x = -ext*1.4;
        this.forearmR.rotation.x  =  ext*0.3 - 0.2;
        this.torso.rotation.x     = -ext*0.1;
        break;
      }

      case 'crouchKick': {
        const prog = Math.min(st/CFG.KICK_DURATION,1);
        const arc  = Math.sin(prog*Math.PI);
        this.torso.position.y     = 0.72;
        this.head.position.y      = 1.23;
        this.upperLegL.rotation.x = -0.85;
        this.shinL.rotation.x     =  1.35;
        // Sweep kick goes sideways (rotation.z in local space)
        this.upperLegR.rotation.z =  arc*1.35;
        this.upperLegR.rotation.x = -0.35;
        this.shinR.rotation.x     =  0.2;
        this.upperArmL.rotation.z = -0.85;
        this.upperArmR.rotation.z =  0.85;
        break;
      }

      case 'hurt': {
        const prog  = st/0.38;
        const shake = Math.sin(st*35)*(1-prog)*0.14;
        this.torso.rotation.z = shake;
        this.head.rotation.z  = shake*1.5;
        this.upperArmL.rotation.x =  0.45;
        this.upperArmR.rotation.x =  0.45;
        this.upperArmL.rotation.z = -0.8;
        this.upperArmR.rotation.z =  0.8;
        break;
      }

      case 'special': {
        const prog = Math.min(st/CFG.SPECIAL_DURATION,1);
        if (prog < 0.4) {
          // Charge — arms pull back and up
          this.upperArmL.rotation.x = -1.2;
          this.upperArmR.rotation.x = -1.2;
          this.upperArmL.rotation.z = -1.1;
          this.upperArmR.rotation.z =  1.1;
          this.forearmL.rotation.x  =  0.85;
          this.forearmR.rotation.x  =  0.85;
          this.torso.rotation.x     = -0.35;
        } else {
          // Release lunge forward
          const lunge = Math.sin(Math.min((prog-0.4)/0.6*Math.PI, Math.PI));
          this.upperArmL.rotation.x = -lunge*1.7;
          this.upperArmR.rotation.x = -lunge*1.7;
          this.upperArmL.rotation.z = -0.3;
          this.upperArmR.rotation.z =  0.3;
          this.torso.rotation.x     = -lunge*0.38;
          this.torso.position.y     = 1.16 + lunge*0.12;
        }
        break;
      }

      case 'death': {
        const fall = Math.min(st/0.85, 1);
        const ease = fall*fall;
        // Fall backwards (away from opponent = -Z in local space = +Z world when facing opp)
        this.bodyRoot.rotation.x =  ease*(Math.PI*0.48);
        this.bodyRoot.position.z = -ease*0.5;
        this.bodyRoot.position.y = -ease*0.25;
        break;
      }
    }
  }

  // ── HITBOX UPDATE ────────────────────────────────────────────────────────

  updateHitBoxes() {
    this.group.updateMatrixWorld(true);

    // ── Body / hurt box ──────────────────────────────────────────────────
    const tW = new THREE.Vector3();
    this.torso.getWorldPosition(tW);
    const crouching = ['crouch','crouchKick','crouchPunch'].includes(this.state);
    const bH  = crouching ? 0.55 : 0.85;
    const bOY = crouching ? 0.35 : 0;
    this.hitBox.body.setFromCenterAndSize(
      tW.clone().add(new THREE.Vector3(0,bOY,0)),
      new THREE.Vector3(0.58, bH, 0.55)
    );

    // ── Hand / attack box ────────────────────────────────────────────────
    const ATTACKING = ['punch','jumpPunch','crouchPunch'];
    const KICKING   = ['kick','jumpKick','crouchKick'];

    if (ATTACKING.includes(this.state)) {
      const fw = new THREE.Vector3();
      this.fistR.getWorldPosition(fw);
      this.hitBox.hand.setFromCenterAndSize(fw, CFG.HBOX[this.state]||CFG.HBOX.punch);
    } else if (KICKING.includes(this.state)) {
      const fw = new THREE.Vector3();
      this.footR.getWorldPosition(fw);
      this.hitBox.hand.setFromCenterAndSize(fw, CFG.HBOX[this.state]||CFG.HBOX.kick);
    } else {
      this.hitBox.hand.makeEmpty();
    }
  }
}

// ─── CIRCULAR ARENA BOUNDARY ─────────────────────────────────────────────────

function clampToArena(pos) {
  const xz = Math.sqrt(pos.x*pos.x + pos.z*pos.z);
  if (xz > CFG.ARENA_RADIUS) {
    const r = CFG.ARENA_RADIUS / xz;
    pos.x *= r;
    pos.z *= r;
  }
}

// ─── PROJECTILE ───────────────────────────────────────────────────────────────

const projectiles = [];

function spawnProjectile(fighter) {
  const col = ELEMENT_COLORS[fighter.data.stats?.element] || 0xff3c00;

  // Get fighter's local forward in world space
  const forward = new THREE.Vector3(0,0,1).applyEuler(fighter.group.rotation);

  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.28,0.07,12,32),
    new THREE.MeshBasicMaterial({ color:col }));
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.18,16,16),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.85 }));
  const grp = new THREE.Group();
  grp.add(outer,inner);
  const pLight = new THREE.PointLight(col,3,2.8);
  grp.add(pLight);

  const tw = new THREE.Vector3();
  fighter.torso.getWorldPosition(tw);
  grp.position.copy(tw).addScaledVector(forward, 0.7);
  scene.add(grp);

  projectiles.push({ mesh:grp, vel:forward.clone().multiplyScalar(9), owner:fighter.side, age:0, hitBox:new THREE.Box3() });
}

function updateProjectiles(delta) {
  for (let i=projectiles.length-1; i>=0; i--) {
    const p = projectiles[i];
    p.age += delta;
    p.mesh.rotation.z += delta*8;
    p.mesh.position.addScaledVector(p.vel, delta);
    p.hitBox.setFromCenterAndSize(p.mesh.position, new THREE.Vector3(0.56,0.56,0.56));

    const target   = p.owner==='p1' ? fighters.p2 : fighters.p1;
    const srcData  = p.owner==='p1' ? p1Data : p2Data;
    const destData = p.owner==='p1' ? p2Data : p1Data;
    const srcFighter = p.owner==='p1' ? fighters.p1 : fighters.p2;

    if (target && p.hitBox.intersectsBox(target.hitBox.body)) {
      const dmg = calcDamage(CFG.DMG.special, srcData.stats?.power, destData.stats?.defense);
      spawnHitEffect(p.mesh.position.clone(), srcData.stats?.element, 'special');
      scene.remove(p.mesh);
      projectiles.splice(i,1);
      const dead = target.takeDamage(dmg, srcFighter);
      screenShake(0.1);
      if (dead) handleKO(p.owner);
      continue;
    }

    const distFromCenter = p.mesh.position.length();
    if (distFromCenter > 25 || p.age > 4) {
      scene.remove(p.mesh);
      projectiles.splice(i,1);
    }
  }
}

// ─── SCENE INIT ───────────────────────────────────────────────────────────────

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020205);
  scene.fog = new THREE.FogExp2(0x020205, 0.008);

  camera = new THREE.PerspectiveCamera(60, canvas.clientWidth/canvas.clientHeight, 0.1, 400);
  camera.position.set(0, 5, 12);
  camera.lookAt(0, 1.5, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  clock = new THREE.Clock();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ─── LIGHTING ─────────────────────────────────────────────────────────────────

function setupLighting() {
  // Ambient
  scene.add(new THREE.HemisphereLight(0x1a1a3a, 0x0a0500, 0.6));

  // Top-down key light (casts clean shadows on circular arena)
  const key = new THREE.DirectionalLight(0xd0e8ff, 3.2);
  key.position.set(5, 20, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -12;
  key.shadow.camera.right = key.shadow.camera.top  =  12;
  key.shadow.camera.far   = 50;
  key.shadow.bias         = -0.0005;
  scene.add(key);

  // 4 fill lights from cardinal directions — illuminates all sides
  [[12,4,0],[- 12,4,0],[0,4,12],[0,4,-12]].forEach(([x,y,z],i) => {
    const fill = new THREE.DirectionalLight([0x4a2000,0x002a4a,0x4a004a,0x004a20][i], 0.45);
    fill.position.set(x,y,z);
    scene.add(fill);
  });

  // Purple floor bounce
  const bounce = new THREE.PointLight(0x6600cc,2.8,14);
  bounce.position.set(0,0.3,0);
  scene.add(bounce);

  // 4 rim lights matching cardinal directions (from low altitude)
  scene.userData.rimLights = [];
  [[0xff4400,1,0],[0x4400ff,-1,0],[0xff0066,0,1],[0x00cc88,0,-1]].forEach(([col,x,z],i) => {
    const rim = new THREE.PointLight(col, 2.8, 14);
    rim.position.set(x*9, 3.5, z*9);
    scene.add(rim);
    scene.userData.rimLights.push({ light:rim, seed:i*1.7 });
  });
}

// ─── ARENA (360-DEGREE CIRCULAR) ─────────────────────────────────────────────

function buildArena() {

  // ── Fighting platform (raised circular disc) ──────────────────────────────
  const platMat = new THREE.MeshStandardMaterial({ color:0x101020, roughness:0.88, metalness:0.08 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(8.5,9.2,0.45,48), platMat);
  platform.position.y = -0.225;
  platform.receiveShadow = true;
  platform.castShadow   = true;
  scene.add(platform);

  // Floor surface (flat disc on top of platform)
  const floorMat = new THREE.MeshStandardMaterial({ color:0x0d0d1e, roughness:0.92, metalness:0.04 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8.4,48), floorMat);
  floor.rotation.x  = -Math.PI/2;
  floor.position.y  = 0.002;
  floor.receiveShadow = true;
  scene.add(floor);

  // Concentric tile rings on floor
  for (let r=1; r<=5; r++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r*1.5, r*1.5+0.06, 64),
      new THREE.MeshBasicMaterial({ color:r%2===0?0x1e1e3a:0x1a1a2a, transparent:true, opacity:0.55, side:THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI/2;
    ring.position.y = 0.003;
    scene.add(ring);
  }

  // Centre star/emblem
  const centre = new THREE.Mesh(new THREE.CircleGeometry(1.1,8), // octagon
    new THREE.MeshBasicMaterial({ color:0x550011, transparent:true, opacity:0.55 }));
  centre.rotation.x = -Math.PI/2;
  centre.position.y = 0.004;
  scene.add(centre);

  // Edge danger ring (glows red near boundary)
  const edgeGlow = new THREE.Mesh(
    new THREE.RingGeometry(7.4, 8.4, 64),
    new THREE.MeshBasicMaterial({ color:0xcc0000, transparent:true, opacity:0.4, side:THREE.DoubleSide })
  );
  edgeGlow.rotation.x = -Math.PI/2;
  edgeGlow.position.y = 0.005;
  scene.add(edgeGlow);

  // Edge point lights (removed for performance)

  // ── Outer extended ground ─────────────────────────────────────────────────
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(200,200),
    new THREE.MeshStandardMaterial({ color:0x050510, roughness:0.99 })
  );
  outerGround.rotation.x = -Math.PI/2;
  outerGround.position.y = -0.45;
  outerGround.receiveShadow = true;
  scene.add(outerGround);

  // ── PILLARS (12 around perimeter at R=13) ─────────────────────────────────
  const PILLAR_COUNT  = 12;
  const PILLAR_RADIUS = 13;
  const pillarMat = new THREE.MeshStandardMaterial({ color:0x0d0818, roughness:0.9 });
  const capMat    = new THREE.MeshStandardMaterial({ color:0x1a0d2a, roughness:0.8 });
  scene.userData.flames     = [];
  scene.userData.torchLights= [];

  for (let i=0;i<PILLAR_COUNT;i++) {
    const angle = (i/PILLAR_COUNT)*Math.PI*2;
    const px = Math.cos(angle)*PILLAR_RADIUS;
    const pz = Math.sin(angle)*PILLAR_RADIUS;

    // Shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.52,11,10), pillarMat);
    shaft.position.set(px,5.5,pz);
    shaft.castShadow = true;
    scene.add(shaft);

    // Capital
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.3,1.3), capMat);
    cap.position.set(px,11.15,pz);
    scene.add(cap);

    // Skull ornament
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28,8,8), capMat);
    skull.position.set(px,11.5,pz);
    scene.add(skull);

    // Torch at mid-height (slightly inside pillar toward arena)
    const tx = Math.cos(angle)*(PILLAR_RADIUS-0.7);
    const tz = Math.sin(angle)*(PILLAR_RADIUS-0.7);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14,0.52,8),
      new THREE.MeshBasicMaterial({ color:0xff6600 }));
    flame.position.set(tx,7.2,tz);
    scene.add(flame);
    flame.userData.baseY = 7.2;
    flame.userData.seed  = angle*5;
    scene.userData.flames.push(flame);

    // Removed individual torch lights for performance

    // Banner between pillars (fabric plane facing arena center)
    if (i%2===0) {
      const bannerMat = new THREE.MeshBasicMaterial({
        color: [0x660011,0x001166,0x116600,0x661100][Math.floor(i/3)%4],
        transparent:true, opacity:0.7, side:THREE.DoubleSide
      });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.0,2.5), bannerMat);
      const ba = angle + (Math.PI/PILLAR_COUNT);
      banner.position.set(Math.cos(ba)*PILLAR_RADIUS, 8.5, Math.sin(ba)*PILLAR_RADIUS);
      banner.rotation.y = -ba;
      scene.add(banner);
    }
  }

  // ── CROWD (50 silhouettes in a circle at R=20) ────────────────────────────
  for (let i=0;i<52;i++) {
    const a = (i/52)*Math.PI*2;
    const r = 18 + (Math.random()-0.5)*3;
    const cx = Math.cos(a)*r, cz = Math.sin(a)*r;
    const h  = 0.5 + Math.random()*1.0;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.32,h,0.16),
      new THREE.MeshBasicMaterial({ color:0x0a0a10, transparent:true, opacity:0.55+Math.random()*0.45 })
    );
    body.position.set(cx, h*0.5-0.45, cz);
    body.rotation.y = -a; // face arena center
    scene.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14+Math.random()*0.05,8,8),
      new THREE.MeshBasicMaterial({ color:0x0d0d10 })
    );
    head.position.set(cx, h-0.45+0.16, cz);
    scene.add(head);

    // Occasional colored crowd glow (cheering sticks / phones)
    if (Math.random()<0.3) {
      const glow = new THREE.PointLight([0xff0040,0x0040ff,0xffcc00,0x00ffcc][Math.floor(Math.random()*4)],0.6,3);
      glow.position.set(cx,h-0.45+0.5,cz);
      scene.add(glow);
    }
  }

  // ── TIERED BLEACHERS (3 rings) ────────────────────────────────────────────
  const blMat = new THREE.MeshStandardMaterial({ color:0x0a0a18, roughness:0.96 });
  for (let t=0;t<4;t++) {
    const br = 14 + t*3;
    const bh = 0.25;
    const by = -0.45 + t*0.5;
    const bleacher = new THREE.Mesh(new THREE.CylinderGeometry(br+1,br+1,bh,48,1,true), blMat);
    bleacher.position.y = by;
    scene.add(bleacher);
  }

  // ── ARENA WALLS (cylindrical, inside-facing) ──────────────────────────────
  const wallMat = new THREE.MeshStandardMaterial({
    color:0x07050f, roughness:0.97, side:THREE.BackSide
  });
  const arenaWall = new THREE.Mesh(new THREE.CylinderGeometry(32,32,28,32,1,true), wallMat);
  arenaWall.position.y = 14;
  scene.add(arenaWall);

  // Decorative wall runes (16 panels on inner wall)
  for (let i=0;i<16;i++) {
    const a = (i/16)*Math.PI*2;
    const wx = Math.cos(a)*31.5, wz = Math.sin(a)*31.5;
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(2.5,4),
      new THREE.MeshBasicMaterial({ color:[0x330044,0x440033,0x003344][i%3], transparent:true, opacity:0.45 }));
    rune.position.set(wx,7,wz);
    rune.rotation.y = -a + Math.PI;
    scene.add(rune);
  }

  // ── DOME CEILING ──────────────────────────────────────────────────────────
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(32,32,16,0,Math.PI*2,0,Math.PI*0.48),
    new THREE.MeshStandardMaterial({ color:0x030308, roughness:0.99, side:THREE.BackSide })
  );
  dome.position.y = 28;
  scene.add(dome);

  // ── STARS on dome ─────────────────────────────────────────────────────────
  const STAR_COUNT = 500;
  const sPos = new Float32Array(STAR_COUNT*3);
  for (let i=0;i<STAR_COUNT;i++) {
    const a = Math.random()*Math.PI*2;
    const ph = Math.random()*Math.PI*0.45;
    sPos[i*3]   = 30*Math.sin(ph)*Math.cos(a);
    sPos[i*3+1] = 24 + 30*Math.cos(ph);
    sPos[i*3+2] = 30*Math.sin(ph)*Math.sin(a);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos,3));
  scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({
    color:0xffffff, size:0.14, transparent:true, opacity:0.85, sizeAttenuation:true
  })));

  // ── EMBER PARTICLES ───────────────────────────────────────────────────────
  const EC = 150; // Optimized
  const ePos = new Float32Array(EC*3), eCol = new Float32Array(EC*3);
  for (let i=0;i<EC;i++) {
    const a = Math.random()*Math.PI*2;
    const r = Math.random()*12;
    ePos[i*3]   = Math.cos(a)*r;
    ePos[i*3+1] = Math.random()*14;
    ePos[i*3+2] = Math.sin(a)*r;
    const c = new THREE.Color().setHSL(0.02+Math.random()*0.1,1,0.5+Math.random()*0.35);
    eCol[i*3]=c.r; eCol[i*3+1]=c.g; eCol[i*3+2]=c.b;
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos,3));
  eGeo.setAttribute('color',    new THREE.BufferAttribute(eCol,3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
    vertexColors:true, size:0.06, transparent:true, opacity:0.8, sizeAttenuation:true
  }));
  scene.add(embers);
  scene.userData.embers   = embers;
  scene.userData.emberPos = ePos;
}

// ─── ORBITAL CAMERA ───────────────────────────────────────────────────────────

function updateCamera3D(delta) {
  if (!fighters.p1 || !fighters.p2) return;

  const p1 = fighters.p1.group.position;
  const p2 = fighters.p2.group.position;
  const mid = new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5);

  // XZ vector between fighters
  const diff = new THREE.Vector3(p2.x-p1.x, 0, p2.z-p1.z);
  const sep  = diff.length();

  if (sep > 0.1) {
    // Camera should be perpendicular to the fighter-to-fighter line
    const fightAngle = Math.atan2(diff.x, diff.z);
    let perp1 = fightAngle + Math.PI*0.5;
    let perp2 = fightAngle - Math.PI*0.5;

    const normA = a => { while(a>Math.PI) a-=Math.PI*2; while(a<-Math.PI) a+=Math.PI*2; return a; };
    const d1 = Math.abs(normA(perp1 - cameraAngle));
    const d2 = Math.abs(normA(perp2 - cameraAngle));
    const targetAngle = d1 < d2 ? perp1 : perp2;

    // Slowly orbit toward target angle (lazy follow feels cinematic)
    const da = normA(targetAngle - cameraAngle);
    cameraAngle += da * Math.min(delta*6.0, 0.25);
  }

  // Distance scales with fighter separation (zoom out when far apart)
  const camDist   = Math.max(9, sep*0.85 + 7);
  const camHeight = 5.0;

  const targetPos = new THREE.Vector3(
    mid.x + Math.sin(cameraAngle)*camDist,
    mid.y + camHeight,
    mid.z + Math.cos(cameraAngle)*camDist
  );

  camera.position.lerp(targetPos, 0.055);
  cameraLookTarget.lerp(new THREE.Vector3(mid.x, mid.y+1.5, mid.z), 0.08);
  camera.lookAt(cameraLookTarget);
}

// ─── INPUT ────────────────────────────────────────────────────────────────────

function getMoveVectors(fighter, opponent) {
  // Forward = direction FROM fighter TOWARD opponent (XZ plane)
  const fwd = new THREE.Vector3()
    .subVectors(opponent.group.position, fighter.group.position)
    .setY(0);
  if (fwd.length() < 0.01) fwd.set(1,0,0);
  fwd.normalize();
  // Left = perpendicular (fighter's left when facing opponent)
  const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
  return { fwd, left };
}

function handleInput(delta) {
  if (!gameState.running || gameState.over) return;
  const p1 = fighters.p1, p2 = fighters.p2;

  // ── P1 (WASD + Space + LeftCtrl) ─────────────────────────────────────────
  if (p1 && p2 && p1.state !== 'death') {
    const canMove = !['punch','kick','jumpKick','jumpPunch','crouchPunch','crouchKick','hurt','special'].includes(p1.state);
    const crouching = p1.state === 'crouch';

    // Block (hold Q)
    if (atk.p1Block) {
      p1.block();
    } else if (p1.state === 'block') {
      p1.setState('idle');
    }

    // Crouch (hold Ctrl or C)
    if (keys['ControlLeft'] || keys['KeyC']) {
      if (p1.onGround && canMove && !crouching) p1.crouch();
    } else if (crouching) {
      p1.setState('idle');
    }

    const isBlocking = p1.state === 'block';
    if (!isBlocking) {
      if (canMove && !crouching) {
        const { fwd, left } = getMoveVectors(p1, p2);
        const mv = new THREE.Vector3();
        if (keys['KeyW']) mv.addScaledVector(fwd,   1);
        if (keys['KeyS']) mv.addScaledVector(fwd,  -1);
        if (keys['KeyA']) mv.addScaledVector(left,  1);
        if (keys['KeyD']) mv.addScaledVector(left, -1);

        if (mv.lengthSq() > 0.001) {
          mv.normalize().multiplyScalar(CFG.MOVE_SPEED * delta);
          p1.group.position.add(mv);
          clampToArena(p1.group.position);
          if (p1.state !== 'jump') p1.setState('walk');
        } else if (p1.state === 'walk') {
          p1.setState('idle');
        }
      }

      if (atk.p1Jump)    { p1.jump();    atk.p1Jump    = false; }
      if (atk.p1Punch)   { p1.punch();   atk.p1Punch   = false; }
      if (atk.p1Kick)    { p1.kick();    atk.p1Kick    = false; }
      if (atk.p1Special) { p1.special(); atk.p1Special = false; }
    } else {
      // Clear attack buffers while blocking so they don't fire on release
      atk.p1Jump = atk.p1Punch = atk.p1Kick = atk.p1Special = false;
    }

    if (isMultiplayer && socket && roomId) {
      const now = Date.now();
      if (now - (p1.lastEmitTime || 0) > 50) {
        socket.emit('opponentUpdate', {
          roomId,
          update: {
            x:     p1.group.position.x,
            y:     p1.group.position.y,
            z:     p1.group.position.z,
            state: p1.state,
            hp:    p1.hp
          }
        });
        p1.lastEmitTime = now;
      }
    }
  }

  // ── P2: DIFFICULTY-AWARE AI ───────────────────────────────────────────────
  if (p1 && p2 && p2.state !== 'death' && !isMultiplayer) {
    const blocking = p2.state === 'block';
    const crouching = p2.state === 'crouch';
    const canMove = !['punch','kick','jumpKick','jumpPunch','crouchPunch','crouchKick','hurt','special','block'].includes(p2.state);
    const dist = p1.group.position.distanceTo(p2.group.position);
    const p1Attacking = ['punch','kick','jumpKick','jumpPunch','crouchPunch','crouchKick','special'].includes(p1.state);

    // ── BLOCKING (Hard AI only, react to incoming attacks) ────────────────
    if (AID.blockChance > 0 && p1Attacking && dist < 1.8 && Math.random() < AID.blockChance) {
      p2.block();
    } else if (blocking && (!p1Attacking || Math.random() < 0.04)) {
      p2.setState('idle'); // release block
    }

    if (!blocking) {
      // ── MOVEMENT ──────────────────────────────────────────────────────────
      if (canMove && !crouching) {
        const { fwd } = getMoveVectors(p2, p1);
        const mv = new THREE.Vector3();

        // Approach or retreat based on distance + aggression
        if (dist > AID.approachDist) {
          mv.addScaledVector(fwd, AID.aggressionBias);
        } else if (dist < AID.retreatDist) {
          mv.addScaledVector(fwd, -1);
        } else if (Math.random() < AID.aggressionBias * 0.3) {
          // Lunge in when close — Hard AI is relentless
          mv.addScaledVector(fwd, 0.6);
        }

        // Strafe to be unpredictable
        if (Math.random() < AID.strafeChance) {
          const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
          mv.addScaledVector(left, (Math.random() < 0.5 ? 1 : -1) * 0.8);
        }

        if (mv.lengthSq() > 0.001) {
          mv.normalize().multiplyScalar(CFG.MOVE_SPEED * delta);
          p2.group.position.add(mv);
          clampToArena(p2.group.position);
          if (p2.state !== 'jump') p2.setState('walk');
        } else if (p2.state === 'walk') {
          p2.setState('idle');
        }
      }

      // ── CROUCH to dodge jump kicks ─────────────────────────────────────
      if (p1.state === 'jumpKick' && dist < 2.0 && Math.random() < AID.blockChance * 2 && p2.onGround && canMove) {
        p2.crouch();
      } else if (crouching && Math.random() < (0.01 + AID.aggressionBias * 0.03)) {
        p2.setState('idle');
      }

      // ── ATTACKS ───────────────────────────────────────────────────────────
      // Hard AI: combo — if punch landed, immediately follow with kick
      const p2JustPunched = p2.state === 'punch' && p2.stateTime > CFG.PUNCH_DURATION * 0.7;
      if (diffParam === 'hard' && p2JustPunched && dist <= 1.3) {
        atk.p2Kick = true;
      }

      // Hard AI: crouching attacks when opponent is standing close
      if (diffParam === 'hard' && dist <= 1.2 && p2.onGround && !crouching && Math.random() < 0.008) {
        p2.crouch();
        atk.p2Punch = true;
      }

      if (dist <= 1.2 && Math.random() < AID.attackChance)  atk.p2Punch   = true;
      if (dist <= 1.6 && Math.random() < AID.kickChance)    atk.p2Kick    = true;
      if (dist <= 1.0 && Math.random() < AID.kickChance * 0.5) atk.p2Kick = true; // sweep at ultra-close
      if (dist > 2.5  && Math.random() < AID.specialChance) atk.p2Special = true;
      if (dist > AID.approachDist && Math.random() < AID.jumpChance) atk.p2Jump = true;

      // Hard AI: use special aggressively when P1 is recovering from hurt
      if (diffParam === 'hard' && p1.state === 'hurt' && dist < 2.0 && Math.random() < 0.04) {
        atk.p2Punch = true;
      }
    }

    if (atk.p2Jump)    { p2.jump();    atk.p2Jump    = false; }
    if (atk.p2Punch)   { p2.punch();   atk.p2Punch   = false; }
    if (atk.p2Kick)    { p2.kick();    atk.p2Kick    = false; }
    if (atk.p2Special) { p2.special(); atk.p2Special = false; }
  }
}


// ─── MECH ARENAS TOWARD EACH OTHER ─────────────────────────────────────────

function updateFacing() {
  const p1 = fighters.p1, p2 = fighters.p2;
  if (!p1 || !p2) return;

  // P1 faces P2
  const dirToP2 = new THREE.Vector3().subVectors(p2.group.position, p1.group.position).setY(0);
  if (dirToP2.length() > 0.4) {
    p1.targetYRot = Math.atan2(dirToP2.x, dirToP2.z);
  }

  // P2 faces P1
  const dirToP1 = new THREE.Vector3().subVectors(p1.group.position, p2.group.position).setY(0);
  if (dirToP1.length() > 0.4) {
    p2.targetYRot = Math.atan2(dirToP1.x, dirToP1.z);
  }
}

// ─── COLLISION ────────────────────────────────────────────────────────────────

const ATTACK_STATES = ['punch','kick','jumpKick','jumpPunch','crouchPunch','crouchKick'];

function checkCollisions() {
  const p1 = fighters.p1, p2 = fighters.p2;
  if (!p1||!p2) return;
  const now = Date.now();

  if (ATTACK_STATES.includes(p1.state) && now-gameState.lastHitTime.p1 > CFG.HIT_COOLDOWN) {
    if (!p1.hitBox.hand.isEmpty() && p1.hitBox.hand.intersectsBox(p2.hitBox.body)) {
      const dmg = calcDamage(CFG.DMG[p1.state]??CFG.DMG.punch, p1Data.stats?.power, p2Data.stats?.defense);
      gameState.lastHitTime.p1 = now;
      spawnHitEffect(p1.hitBox.hand.getCenter(new THREE.Vector3()), p1Data.stats?.element, p1.state);
      screenShake(0.06);
      
      if (isMultiplayer && socket && roomId) {
        socket.emit('hitOpponent', { roomId, dmg, attackState: p1.state });
      } else {
        if (p2.takeDamage(dmg, p1)) handleKO('p1');
      }
    }
  }

  if (ATTACK_STATES.includes(p2.state) && now-gameState.lastHitTime.p2 > CFG.HIT_COOLDOWN) {
    if (!p2.hitBox.hand.isEmpty() && p2.hitBox.hand.intersectsBox(p1.hitBox.body)) {
      const dmg = calcDamage(CFG.DMG[p2.state]??CFG.DMG.punch, p2Data.stats?.power, p1Data.stats?.defense);
      gameState.lastHitTime.p2 = now;
      spawnHitEffect(p2.hitBox.hand.getCenter(new THREE.Vector3()), p2Data.stats?.element, p2.state);
      screenShake(0.06);
      if (p1.takeDamage(dmg, p2)) handleKO('p2');
    }
  }
}

function calcDamage(base, atk, def) {
  const a = ((atk||70)-60)/35;
  const d = ((def||70)-60)/35;
  return Math.max(2, Math.round(base*(1+a*0.5)*(1-d*0.3)+Math.random()*3));
}

// ─── VFX ──────────────────────────────────────────────────────────────────────

function spawnHitEffect(pos, element, attackType) {
  const col    = ELEMENT_COLORS[element] || 0xff4400;
  const isHeavy = ['kick','jumpKick','special'].includes(attackType);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, isHeavy?0.85:0.6, 20),
    new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.9, side:THREE.DoubleSide })
  );
  ring.position.copy(pos);
  ring.lookAt(camera.position);
  scene.add(ring);

  // Particle burst
  const pCount = isHeavy?18:10;
  const parts = [];
  for (let i=0;i<pCount;i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.04+Math.random()*0.04,6,6),
      new THREE.MeshBasicMaterial({ color:col })
    );
    p.position.copy(pos);
    const a = (i/pCount)*Math.PI*2, sp = 3+Math.random()*5;
    p.userData.vel = new THREE.Vector3(Math.cos(a)*sp,(Math.abs(Math.sin(a))+0.5)*sp*0.7,(Math.random()-0.5)*2);
    p.userData.life = 0;
    scene.add(p);
    parts.push(p);
  }

  const flash = new THREE.PointLight(col, isHeavy?9:5, isHeavy?5:3.5);
  flash.position.copy(pos);
  scene.add(flash);

  let sc=0.1, op=0.9, frame=0;
  (function expand() {
    sc+=0.15; op-=0.048;
    ring.scale.setScalar(sc);
    ring.material.opacity = Math.max(0,op);
    const dt=0.016;
    parts.forEach(p => {
      p.userData.life+=dt;
      p.userData.vel.y -= 9*dt;
      p.position.addScaledVector(p.userData.vel,dt);
      p.material.opacity=Math.max(0,1-p.userData.life*2.5);
      p.material.transparent=true;
      p.scale.setScalar(Math.max(0.1,1-p.userData.life*2));
    });
    frame++;
    if (op>0||frame<22) requestAnimationFrame(expand);
    else { scene.remove(ring); parts.forEach(p=>scene.remove(p)); }
    if (frame===5) scene.remove(flash);
  })();
}

// Camera shake
let shakeAmt=0, shakeDur=0;
function screenShake(a) { shakeAmt=a; shakeDur=0.12; }

// ─── KO / ROUND SYSTEM ────────────────────────────────────────────────────────

async function handleKO(winnerSide) {
  if (gameState.over) return;
  gameState.over = true; gameState.running = false;
  if (timerInterval) clearInterval(timerInterval);

  const winner = winnerSide === 'p1' ? p1Data : p2Data;
  const loser  = winnerSide === 'p1' ? p2Data : p1Data;

  // Accumulate round wins
  gameState.wins[winnerSide]++;
  const roundsWon = gameState.wins[winnerSide];

  // Zoom toward winner
  const wf = fighters[winnerSide];
  if (wf) {
    const sp = camera.position.clone();
    const wp = wf.group.position;
    const tp = new THREE.Vector3(wp.x + Math.sin(cameraAngle)*5, wp.y+3.5, wp.z + Math.cos(cameraAngle)*5);
    const start = Date.now();
    (function zoom() {
      const t = Math.min((Date.now()-start)/2200,1);
      const e = t<0.5?2*t*t:-1+(4-2*t)*t;
      camera.position.lerpVectors(sp,tp,e);
      camera.lookAt(wp.x,wp.y+1.4,wp.z);
      if (t<1) requestAnimationFrame(zoom);
    })();
  }

  await sleep(900);
  let commentary = `${winner.name.toUpperCase()} WINS!`;

  // Has anyone won enough rounds?
  if (roundsWon >= CFG.ROUNDS_TO_WIN) {
    // MATCH OVER
    try {
      const tok = localStorage.getItem('ff_token');
      const r = await fetch('/api/commentary/ko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        body: JSON.stringify({ winner_name: winner.name, loser_name: loser.name }),
      });
      if (r.ok) { const d = await r.json(); commentary = d.commentary; }
    } catch(_) {}

    koText.textContent        = 'K.O.';
    winnerText.textContent    = `${winner.name.toUpperCase()} WINS THE MATCH!`;
    announcerText.textContent = commentary;
    announcerOverlay.classList.add('visible');
  } else {
    // Next round
    koText.textContent        = `ROUND ${gameState.round} — ${winner.name.toUpperCase()} WINS!`;
    winnerText.textContent    = `⚔️ ${gameState.wins.p1} — ${gameState.wins.p2} ⚔️`;
    announcerText.textContent = 'NEXT ROUND...';
    announcerOverlay.classList.add('visible');

    await sleep(2800);
    announcerOverlay.classList.remove('visible');

    // Reset for next round
    gameState.round++;
    await sleep(400);
    await startNextRound();
  }
}

async function startNextRound() {
  const p1 = fighters.p1, p2 = fighters.p2;
  if (!p1 || !p2) return;

  // Force-reset state (bypass death check)
  p1.state = 'idle'; p1.stateTime = 0;
  p2.state = 'idle'; p2.stateTime = 0;

  p1.hp = CFG.MAX_HP;
  p2.hp = CFG.MAX_HP;
  p1.group.position.set(-2.5, CFG.GROUND_Y, 0);
  p2.group.position.set(2.5, CFG.GROUND_Y, 0);
  p1.group.rotation.set(0,0,0);
  p2.group.rotation.set(0,0,0);
  p1.bodyRoot.rotation.set(0,0,0);
  p2.bodyRoot.rotation.set(0,0,0);
  p1.bodyRoot.position.set(0,0,0);
  p2.bodyRoot.position.set(0,0,0);
  p1.velY = p2.velY = 0;
  p1.onGround = p2.onGround = true;
  p1.knockbackVel.set(0,0,0);
  p2.knockbackVel.set(0,0,0);
  gameState.lastHitTime = { p1: 0, p2: 0 };

  updateHpHUD();

  showRoundText(`ROUND ${gameState.round}`);
  await sleep(1500);
  gameState.over = false;
  startGameLoop();
}

function handleTimeout() {
  const p1=fighters.p1, p2=fighters.p2;
  if (!p1||!p2) return;
  if (p1.hp > p2.hp) handleKO('p1');
  else if (p2.hp > p1.hp) handleKO('p2');
  else {
    // Draw this round — neither wins, just start next round unless match max
    gameState.over = true; gameState.running = false;
    if (timerInterval) clearInterval(timerInterval);
    koText.textContent = 'DRAW!';
    winnerText.textContent = `⚔️ ${gameState.wins.p1} — ${gameState.wins.p2} ⚔️`;
    announcerText.textContent = gameState.round >= CFG.ROUNDS_TO_WIN ? 'MATCH DRAW!' : 'NEXT ROUND...';
    announcerOverlay.classList.add('visible');
    if (gameState.round < CFG.ROUNDS_TO_WIN) {
      sleep(2800).then(() => {
        announcerOverlay.classList.remove('visible');
        gameState.round++;
        sleep(400).then(() => startNextRound());
      });
    }
  }
}


// ─── HUD ──────────────────────────────────────────────────────────────────────

function updateHpHUD() {
  const pct1 = fighters.p1?.getHpPercent()??100;
  const pct2 = fighters.p2?.getHpPercent()??100;
  p1HpBar.style.width = `${pct1}%`;
  p1HpBar.style.background = pct1>50
    ? 'linear-gradient(90deg,var(--hp-red),var(--hp-green))'
    : pct1>25 ? 'linear-gradient(90deg,var(--hp-red),var(--hp-yellow))' : 'var(--hp-red)';
  p2HpBar.style.width = `${pct2}%`;
  p2HpBar.style.background = pct2>50
    ? 'linear-gradient(270deg,var(--hp-red),var(--hp-green))'
    : pct2>25 ? 'linear-gradient(270deg,var(--hp-red),var(--hp-yellow))' : 'var(--hp-red)';
}

function setHUDInfo() {
  p1NameEl.textContent    = p1Data.name.toUpperCase();
  p2NameEl.textContent    = (p2Data?.name || 'AI FIGHTER').toUpperCase();
  p1ElementEl.textContent = (p1Data.stats?.element||'fire').toUpperCase();
  p2ElementEl.textContent = (p2Data?.stats?.element||'shadow').toUpperCase();
  p1SpecialEl.textContent = p1Data.stats?.special_move||'???';
  p2SpecialEl.textContent = p2Data?.stats?.special_move||'???';

  // Show only P1 controls (P2 is AI or remote player)
  const hint = document.querySelector('.controls-hint');
  if (hint) {
    if (isMultiplayer) {
      hint.innerHTML = `
        <div>MOVE: <span class="control-key">W</span><span class="control-key">A</span><span class="control-key">S</span><span class="control-key">D</span> &nbsp;
        <span class="control-key">Space</span> Jump &nbsp;
        <span class="control-key">Ctrl</span> Crouch &nbsp;
        <span class="control-key">Q</span> Block &nbsp;
        <span class="control-key">F</span> Punch &nbsp;
        <span class="control-key">G</span> Kick &nbsp;
        <span class="control-key">H</span> Special</div>
        <div style="color:var(--fire-orange)">OPPONENT: ONLINE PLAYER</div>
      `;
    } else {
      hint.innerHTML = `
        <div>MOVE: <span class="control-key">W</span><span class="control-key">A</span><span class="control-key">S</span><span class="control-key">D</span> &nbsp;
        <span class="control-key">Space</span> Jump &nbsp;
        <span class="control-key">Ctrl</span> Crouch &nbsp;
        <span class="control-key">Q</span> Block &nbsp;
        <span class="control-key">F</span> Punch &nbsp;
        <span class="control-key">G</span> Kick &nbsp;
        <span class="control-key">H</span> Special</div>
        <div style="color:var(--text-muted)">OPPONENT: AI CONTROLLED</div>
      `;
    }
  }
}

let timerInterval=null;
function startTimer() {
  gameState.timer = CFG.MATCH_DURATION;
  timerInterval = setInterval(() => {
    if (!gameState.running||gameState.over) return;
    gameState.timer = Math.max(0,gameState.timer-1);
    timerEl.textContent = String(gameState.timer).padStart(2,'0');
    if (gameState.timer<=10) timerEl.classList.add('urgent');
    if (gameState.timer===0) handleTimeout();
  },1000);
}

// ─── FIGHTER DATA ─────────────────────────────────────────────────────────────

let socket = null;
let roomId = null;
const urlParams = new URLSearchParams(window.location.search);
const modeParam = urlParams.get('mode');
const diffParam = urlParams.get('diff') || 'normal'; // easy | normal | hard
const roleParam = urlParams.get('role') || 'p1'; // p1 = host, p2 = joiner
let isMultiplayer = modeParam === 'mp';

// ─── AI DIFFICULTY CONFIG ─────────────────────────────────────────────────────
const AI_DIFF = {
  easy: {
    reactionTime: 0.6,      // seconds before AI reacts
    attackChance: 0.008,    // punch chance per frame at close range
    kickChance:   0.004,
    specialChance:0.001,
    blockChance:  0.0,      // AI never blocks
    approachDist: 1.8,
    retreatDist:  0.6,
    aggressionBias: 0.3,    // 0=passive, 1=aggressive
    jumpChance:   0.001,
    strafeChance: 0.005,
  },
  normal: {
    reactionTime: 0.25,
    attackChance: 0.020,
    kickChance:   0.012,
    specialChance:0.005,
    blockChance:  0.003,
    approachDist: 1.6,
    retreatDist:  0.8,
    aggressionBias: 0.6,
    jumpChance:   0.003,
    strafeChance: 0.010,
  },
  hard: {
    reactionTime: 0.08,
    attackChance: 0.045,
    kickChance:   0.028,
    specialChance:0.012,
    blockChance:  0.020,    // blocks frequently
    approachDist: 1.4,
    retreatDist:  1.0,
    aggressionBias: 0.9,
    jumpChance:   0.006,
    strafeChance: 0.018,
  }
};
const AID = AI_DIFF[diffParam] || AI_DIFF.normal;


function loadFighterData() {
  const r1=sessionStorage.getItem('ff_p1'), r2=sessionStorage.getItem('ff_p2');
  let p1 = r1 ? JSON.parse(r1) : {id:'dev-p1',name:'CRIMSON FIST',stats:{power:85,speed:78,defense:70,special_move:'Dragon Uppercut',element:'fire'},face_image_base64:null,mime_type:'image/jpeg'};
  let p2 = r2 ? JSON.parse(r2) : {id:'dev-p2',name:'SHADOW BLADE',stats:{power:72,speed:90,defense:65,special_move:'Void Step',element:'shadow'},face_image_base64:null,mime_type:'image/jpeg'};
  
  if (isMultiplayer) {
    p2 = null;
  }
  return { p1, p2 };
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────

let elapsed=0;

function startGameLoop() {
  gameState.running=true;
  startTimer();
  requestAnimationFrame(gameLoop);
}

// ── Mobile fix: pause/resume clock on visibility change to prevent huge delta spikes ──
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && clock) {
    clock.getDelta(); // consume accumulated time so next frame delta = ~0
  }
});

function gameLoop() {
  if (!gameState.over) requestAnimationFrame(gameLoop);
  // Cap delta hard — prevents huge jump after tab switch/phone unlock
  const delta = Math.min(clock.getDelta(), 0.033); // max ~30fps worth of delta
  elapsed += delta;


  // Environment animations
  (scene.userData.torchLights||[]).forEach(({light,seed}) => {
    light.intensity = 2.2 + Math.sin(Date.now()*0.009+seed)*0.7;
  });
  (scene.userData.flames||[]).forEach(f => {
    f.position.y = f.userData.baseY + Math.sin(Date.now()*0.012+f.userData.seed)*0.05;
    f.scale.x    = 1 + Math.sin(Date.now()*0.018+f.userData.seed)*0.1;
  });
  // Rim light pulse
  (scene.userData.rimLights||[]).forEach(({light,seed}) => {
    light.intensity = 2.8 + Math.sin(elapsed*2.5+seed)*0.8;
  });

  handleInput(delta);
  updateFacing();

  fighters.p1?.update(delta,elapsed);
  fighters.p2?.update(delta,elapsed);

  // Smooth opponent interpolation in multiplayer
  if (isMultiplayer && fighters.p2 && window._mpOppTarget) {
    const t  = window._mpOppTarget;
    const p2 = fighters.p2;
    const lf = 12 * delta; // lerp factor
    p2.group.position.x += (t.x - p2.group.position.x) * lf;
    p2.group.position.y += (t.y - p2.group.position.y) * lf;
    p2.group.position.z += (t.z - p2.group.position.z) * lf;
    p2.hp = t.hp;
    const os = window._mpGetOppState ? window._mpGetOppState() : 'idle';
    if (p2.state !== os && os !== undefined) p2.setState(os);
  }

  scene.updateMatrixWorld();
  fighters.p1?.updateHitBoxes();
  fighters.p2?.updateHitBoxes();

  if (gameState.running&&!gameState.over) {
    checkCollisions();
    updateProjectiles(delta);
  }

  // Ember drift (radially outward + upward)
  const ePos=scene.userData.emberPos;
  if (ePos) {
    for (let i=0;i<ePos.length/3;i++) {
      ePos[i*3+1] += delta*0.28;
      const ax=ePos[i*3], az=ePos[i*3+2];
      const a=Math.atan2(ax,az)+delta*0.05;
      const r=Math.sqrt(ax*ax+az*az);
      ePos[i*3]   = Math.sin(a)*r;
      ePos[i*3+2] = Math.cos(a)*r;
      if (ePos[i*3+1]>14||r>14) {
        const na=Math.random()*Math.PI*2, nr=Math.random()*5;
        ePos[i*3]=Math.cos(na)*nr; ePos[i*3+1]=0; ePos[i*3+2]=Math.sin(na)*nr;
      }
    }
    scene.userData.embers.geometry.attributes.position.needsUpdate=true;
  }

  // 3D orbital camera
  updateCamera3D(delta);

  // Camera shake
  if (shakeDur>0) {
    shakeDur-=delta;
    camera.position.x+=(Math.random()-0.5)*shakeAmt;
    camera.position.y+=(Math.random()-0.5)*shakeAmt*0.6;
  }

  updateHpHUD();
  renderer.render(scene,camera);
}

// ─── LOADING ──────────────────────────────────────────────────────────────────

function setProgress(pct,msg) {
  loadingBar.style.width=`${pct}%`;
  if (msg) loadingStatus.textContent=msg;
}

function showRoundText(txt) {
  const el=document.createElement('div');
  el.style.cssText=`
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    font-family:'Bebas Neue',cursive;font-size:clamp(52px,14vw,130px);letter-spacing:8px;
    color:#ffd700;z-index:1000;pointer-events:none;
    text-shadow:0 0 50px rgba(255,215,0,0.9),0 0 100px rgba(255,100,0,0.5);
    animation:koSlam .4s cubic-bezier(.17,.67,.35,1.3) both;
  `;
  el.textContent=txt;
  document.body.appendChild(el);
  setTimeout(()=>{el.style.transition='opacity .5s';el.style.opacity='0';setTimeout(()=>el.remove(),500);},1400);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    setProgress(5,'LOADING FIGHTER DATA...');
    const fd=loadFighterData();
    p1Data=fd.p1; p2Data=fd.p2;

    if (isMultiplayer) {
      setProgress(10, 'CONNECTING TO ARENA...');

      // Data was set by lobby.html before navigating here
      const myRole   = sessionStorage.getItem('ff_mp_role');   // 'p1' or 'p2'
      const myRoom   = sessionStorage.getItem('ff_mp_room');
      const oppStr   = sessionStorage.getItem('ff_mp_opp');
      const oppData  = oppStr ? JSON.parse(oppStr) : null;

      if (!myRole || !myRoom || !oppData) {
        // Lobby data missing — go back
        window.location.href = '/lobby.html?mode=create';
        return;
      }

      roomId = myRoom;

      // Assign fighter roles: I am always P1 visually, opponent is P2
      // But server assigned real roles — we use them for socket sync direction
      socket = io({ transports: ['websocket'] });

      // Rejoin the socket room so we can receive events
      socket.on('connect', () => {
        socket.emit('rejoinRoom', { roomId, role: myRole, fighterData: p1Data });
      });

      // Smooth interpolation target for opponent
      const oppTarget = { x: 2.5, y: 0, z: 0, hp: 100 };
      let oppState = 'idle';

      socket.on('opponentUpdate', (update) => {
        // Smooth target — lerp applied in game loop
        oppTarget.x  = update.x;
        oppTarget.y  = update.y;
        oppTarget.z  = update.z;
        oppTarget.hp = update.hp;
        oppState     = update.state;
      });

      socket.on('opponentHitMe', ({ dmg, attackState }) => {
        if (gameState.running && !gameState.over && fighters.p1 && fighters.p1.state !== 'death') {
          // Play hit effect on our body
          spawnHitEffect(fighters.p1.hitBox.body.getCenter(new THREE.Vector3()), fighters.p2?.data?.stats?.element || 'fire', attackState);
          screenShake(0.06);
          if (fighters.p1.takeDamage(dmg, fighters.p2)) handleKO('p2');
        }
      });

      socket.on('opponentDisconnected', () => {
        gameState.running = false;
        gameState.over    = true;
        koText.textContent        = 'VICTORY!';
        winnerText.textContent    = 'OPPONENT LEFT';
        announcerText.textContent = 'YOUR RIVAL HAS FLED THE ARENA!';
        announcerOverlay.classList.add('visible');
        rematchBtn.textContent = '🏠 MAIN MENU';
        rematchBtn.onclick = () => window.location.href = '/select.html';
      });

      socket.on('rematchAccepted', () => {
        // Reset game state for a fresh round
        announcerOverlay.classList.remove('visible');
        if (timerInterval) clearInterval(timerInterval);
        gameState.running = false;
        gameState.over    = false;
        gameState.round   = 1;
        gameState.wins    = { p1: 0, p2: 0 };
        // Reset fighter HP and positions
        if (fighters.p1) { fighters.p1.hp = CFG.MAX_HP; fighters.p1.setState('idle'); fighters.p1.group.position.set(-2.5, 0, 0); }
        if (fighters.p2) { fighters.p2.hp = CFG.MAX_HP; fighters.p2.setState('idle'); fighters.p2.group.position.set(2.5, 0, 0); }
        // Update oppTarget to reflect reset
        oppTarget.x = 2.5; oppTarget.y = 0; oppTarget.z = 0; oppTarget.hp = CFG.MAX_HP;
        rematchBtn.textContent = '⚔️ PLAY AGAIN';
        rematchBtn.disabled = false;
        sleep(400).then(() => { showRoundText('ROUND 1'); sleep(1500).then(() => startGameLoop()); });
      });

      // Multiplayer rematch button
      rematchBtn.onclick = () => {
        rematchBtn.textContent = '⏳ WAITING FOR OPPONENT...';
        rematchBtn.disabled = true;
        socket.emit('rematchRequested', { roomId });
      };

      // Expose oppTarget + oppState for game loop to use
      window._mpOppTarget = oppTarget;
      window._mpGetOppState = () => oppState;

      p2Data = oppData;

      setProgress(20, `ENTERING ARENA AS ${myRole.toUpperCase()}...`);
    } else {
      // Single-player: rematch just goes back to menu
      if (rematchBtn) rematchBtn.onclick = () => window.location.href = '/select.html';
    }

    setProgress(25,'INITIALIZING 3D ENGINE...');
    initScene();

    setProgress(40,'BUILDING ARENA...');
    setupLighting();
    buildArena();

    setProgress(60,'FORGING FIGHTERS...');
    fighters.p1=new Fighter(p1Data,'p1');
    fighters.p2=new Fighter(p2Data,'p2');

    setProgress(90,'APPLYING TEXTURES...');
    await sleep(500);

    setProgress(100,'FIGHT!');
    await sleep(250);

    loadingEl.style.transition='opacity .8s';
    loadingEl.style.opacity='0';
    setTimeout(()=>{loadingEl.style.display='none';},800);

    setHUDInfo();
    timerEl.textContent=String(CFG.MATCH_DURATION).padStart(2,'0');

    await sleep(600);
    showRoundText('ROUND 1');
    await sleep(1500);
    startGameLoop();

  } catch(err) {
    console.error('Game init error:',err);
    loadingStatus.textContent=`ERROR: ${err.message}`;
    loadingStatus.style.color='#ff3c00';
  }
}

const sleep = ms => new Promise(r => setTimeout(r,ms));
const clamp = (v,lo,hi) => Math.min(Math.max(v,lo),hi);

main();
