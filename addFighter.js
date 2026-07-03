const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');
const imgPath = "C:\\Users\\evilm\\.gemini\\antigravity-ide\\brain\\6df7c238-7c71-4c27-9255-5bbba1402c3e\\alt_face_portrait_1781815491137.png";

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const imgBase64 = fs.readFileSync(imgPath, 'base64');

const newFighter = {
  id: "fighter-" + Date.now(),
  name: "ALT",
  face_image_base64: imgBase64,
  mime_type: "image/png",
  base_model_url: "/assets/models/fighter.glb",
  face_texture_url: "/assets/textures/face_default.png",
  stats: {
    power: 85,
    speed: 80,
    defense: 75,
    special_move: "Flame Throw",
    element: "fire",
    fighter_title: "The Infernal Avatar",
    backstory: "Wields the power of flames to obliterate any opponent."
  },
  created_at: new Date().toISOString()
};

// add to the first user
if(db.users && db.users.length > 0 && db.users[0].fighters) {
  const existing = db.users[0].fighters.findIndex(f => f.name === "ALT");
  if(existing !== -1) {
    db.users[0].fighters[existing] = newFighter;
  } else {
    db.users[0].fighters.push(newFighter);
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log("Fighter added successfully!");
