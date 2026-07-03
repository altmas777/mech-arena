const { User } = require('./models');

async function findUserByEmail(email) {
  return await User.findOne({ email: email.toLowerCase() });
}

async function findUserById(id) {
  // `id` might be a UUID from legacy db.json, or an ObjectId. 
  // We can query by `_id` if it's a valid ObjectId, otherwise we might need a fallback.
  // Assuming new users will just use ObjectId string representation.
  // If we need to support legacy UUIDs, we could add an old_id field, but let's assume a fresh DB or handled by Mongoose.
  try {
    return await User.findById(id);
  } catch (err) {
    // If id is not a valid ObjectId (e.g. legacy uuid), it will throw CastError.
    return null;
  }
}

async function saveUser(userData) {
  // If it's already a Mongoose document with a save method, just save it
  if (userData && typeof userData.save === 'function') {
    return await userData.save();
  }

  // If it has an id, treat it as an update
  if (userData.id || userData._id) {
    const id = userData.id || userData._id;
    try {
      return await User.findByIdAndUpdate(id, userData, { new: true, upsert: true });
    } catch(err) {
      console.error('Error updating user:', err);
    }
  }
  
  // Otherwise, create a new user
  const user = new User(userData);
  return await user.save();
}

async function saveOTP(email, otpHash, expiresAt) {
  // If user doesn't exist, we create a temporary stub, or we just update if they exist.
  // Wait, OTP is usually for login/signup. We can just upsert.
  await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { otp_hash: otpHash, otp_expires: expiresAt },
    { upsert: true, new: true }
  );
}

async function findOTP(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && user.otp_hash) {
    return { email: user.email, otp_hash: user.otp_hash, otp_expires: user.otp_expires };
  }
  return null;
}

async function clearOTP(email) {
  await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $unset: { otp_hash: "", otp_expires: "" } }
  );
}

async function getAllUsers() {
  return await User.find({});
}

module.exports = {
  findUserByEmail,
  findUserById,
  saveUser,
  saveOTP,
  findOTP,
  clearOTP,
  getAllUsers
};
