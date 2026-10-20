// Tracks when each user can next execute a particular command.
const cooldowns = new Map();

function checkCooldown(userId, commandName, cooldownMs) {
  const key = `${userId}:${commandName}`;
  const now = Date.now();

  for (const [storedKey, expiresAt] of cooldowns) {
    if (expiresAt <= now) {
      cooldowns.delete(storedKey);
    }
  }

  const nextAllowedAt = cooldowns.get(key) ?? 0;

  if (nextAllowedAt > now) {
    return nextAllowedAt - now;
  }
  cooldowns.set(key, now + cooldownMs);
  return 0;
}

module.exports = { checkCooldown };
