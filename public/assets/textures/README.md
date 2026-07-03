# 🎨 Fighter Face Textures

Place face/skin texture images here. These are **NOT** the user's uploaded photos — those are
stored as base64 in `db.json`. This folder is for **arena environment textures** and
**default/fallback face textures** used when no user photo is available.

## Supported Formats

| Format | Use |
|---|---|
| `.jpg` / `.jpeg` | Best for photographic face textures (smaller file size) |
| `.png` | Use when transparency is needed |
| `.webp` | Modern format, great compression |

## Recommended Textures to Add

```
floor_stone.jpg       ← Dark stone arena floor texture
wall_dark.jpg         ← Background arena wall texture
face_default.png      ← Default face when user has no photo (neutral avatar)
arena_fog.png         ← Optional fog/atmosphere overlay
```

## How Face Textures Work in MECH ARENA

1. **User-uploaded photo** → stored as `base64` string in `db.json` → loaded via
   `THREE.TextureLoader` from a `data:image/...;base64,...` URL at runtime.
   The photo is applied **unchanged** to the head mesh front face.

2. **Fallback textures** (from this folder) → loaded via:
   ```js
   const loader = new THREE.TextureLoader();
   loader.load('/assets/textures/face_default.png', (texture) => { ... });
   ```

## Texture Loading in game.js

```js
// Environment texture example
const floorTex = new THREE.TextureLoader().load('/assets/textures/floor_stone.jpg');
floorTex.wrapS = THREE.RepeatWrapping;
floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(4, 4);
```

> ⚠️ Keep individual texture files under 2MB for optimal load times.
> For face textures, 512×512px is sufficient; 1024×1024px is ideal.
