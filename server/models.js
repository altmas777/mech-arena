const mongoose = require('mongoose');

// ─── FIGHTER SCHEMA ───────────────────────────────────────────────────────────

const FighterSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true, minlength: 2, maxlength: 20 },
  face_image_base64: { type: String },
  mime_type:         { type: String, default: 'image/jpeg' },
  suit:              { type: String, default: 'default' },
  stats: {
    power:        { type: Number, default: 75 },
    speed:        { type: Number, default: 75 },
    defense:      { type: Number, default: 75 },
    element:      { type: String, default: 'fire' },
    special_move: { type: String, default: 'FIRE BLAST' }
  },
  wins:   { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
}, { timestamps: true });

// ─── USER SCHEMA ─────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  username:      { type: String, required: true, trim: true },
  password_hash: { type: String },
  isVerified:    { type: Boolean, default: false },
  google_id:     { type: String },
  fighters:      { type: [FighterSchema], default: [] },
  // OTP for email auth
  otp_hash:    { type: String },
  otp_expires: { type: Date },
}, { timestamps: true });

// Virtual for legacy "id" field (maps _id → id)
UserSchema.virtual('id').get(function () {
  return this._id.toHexString();
});
UserSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model('User', UserSchema);

module.exports = { User };
