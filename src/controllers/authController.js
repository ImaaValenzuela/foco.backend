const { ensureProfile } = require('../services/profileService');

async function me(req, res) {
  const profile = await ensureProfile(req.user);
  return res.json({ auth_user_id: req.user.id, profile });
}

module.exports = { me };
