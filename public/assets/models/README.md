# 📦 Fighter 3D Models

Place your rigged `.glb` or `.gltf` fighter models in this directory.

## Requirements

| Property | Requirement |
|---|---|
| Format | `.glb` (preferred) or `.gltf` |
| Rig | Must be rigged with a skeleton / armature |
| Animations | Must include baked animation clips (see names below) |
| Scale | ~1.8 units tall (adjust in game.js if needed) |

## Expected Animation Clip Names

The game's `AnimationStateMachine` resolves clips by keyword matching.
Name your clips using **any** of these words (case-insensitive):

| State | Accepted clip name keywords |
|---|---|
| Idle | `idle`, `stand`, `rest` |
| Walk | `walk`, `run`, `move` |
| Punch | `punch`, `jab`, `hit`, `attack`, `strike` |
| Kick | `kick`, `sweep`, `legattack` |
| Hurt | `hurt`, `hit_react`, `damage`, `stagger` |
| Death | `death`, `die`, `dead`, `fall` |

## Free Model Sources

- [Mixamo](https://www.mixamo.com/) — Free rigged humanoid models + animations
- [Sketchfab](https://sketchfab.com/3d-models?features=downloadable&sort_by=-likeCount&q=fighter) — Filter by "downloadable"
- [ReadyPlayerMe](https://readyplayer.me/) — Generate custom avatars (`.glb` export)

## Recommended File Name

```
fighter.glb       ← default model loaded by game.js (GAME_CONFIG.MODEL_PATH)
```

You can add multiple fighter models and reference them per-character via `base_model_url` in `db.json`.

> ⚠️ Do NOT commit large `.glb` files to Git. Add `*.glb` and `*.gltf` to your `.gitignore`.
