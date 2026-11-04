// Friendship with Byte: every right answer (and Byte's challenge) fills friendship hearts; each heart unlocks an accessory
// Byte can wear.

export const HEARTS_AT = [10, 30, 60, 100, 160];      // friendship points for hearts 1..5

export function heartsFor(points = 0) {
  return HEARTS_AT.filter((need) => points >= need).length;
}

/** Progress to the next heart: { hearts, have, need } (need 0 at the top). */
export function heartProgress(points = 0) {
  const hearts = heartsFor(points);
  const from = hearts ? HEARTS_AT[hearts - 1] : 0, to = HEARTS_AT[hearts];
  return { hearts, have: points - from, need: to ? to - from : 0 };
}

/** Adds friendship. @returns {number|null} the new heart count if it just went up */
export function addBond(save, catId, points) {
  const before = heartsFor(save.bonds[catId]);
  save.bonds[catId] = (save.bonds[catId] || 0) + points;
  const after = heartsFor(save.bonds[catId]);
  return after > before ? after : null;
}

/** Accessories this cat has unlocked (accessory.hearts <= its hearts). */
export const unlockedAccessories = (save, catId, accessories) => accessories.filter((a) => a.hearts <= heartsFor(save.bonds[catId]));
