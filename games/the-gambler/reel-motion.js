// Presentation only: no game RNG, wagers or payout state are used here.
export const REEL_TIMING = { firstStop: 1900, stagger: 320, settle: 240 };

export function reelDuration(column) {
  return REEL_TIMING.firstStop + column * REEL_TIMING.stagger;
}

// Integral of a smooth velocity ramp. Position is continuous, with zero
// velocity and acceleration at either end of the main downward travel.
export function travelProgress(t) {
  const p = Math.max(0, Math.min(1, t));
  const acceleration = .18, braking = .42, cruiseEnd = 1 - braking;
  const area = 1 - (acceleration + braking) / 2;
  if (p < acceleration) {
    const q = p / acceleration;
    return acceleration * (q ** 3 - .5 * q ** 4) / area;
  }
  if (p < cruiseEnd) return (acceleration / 2 + p - acceleration) / area;
  const q = (p - cruiseEnd) / braking;
  return (acceleration / 2 + cruiseEnd - acceleration
    + braking * (q - q ** 3 + .5 * q ** 4)) / area;
}

export function reelFrame(elapsed, column, steps) {
  const duration = reelDuration(column);
  if (elapsed >= duration) return { position: steps, blur: 0, state: 'stopped' };
  const travelTime = duration - REEL_TIMING.settle;
  if (elapsed >= travelTime) {
    // Braking already reaches the target with zero velocity. Hold that exact
    // position through the existing settle interval; never restart motion.
    // Keeping this interval preserves stop order, total duration and sound cues.
    return { position: steps, blur: 0, state: 'settling' };
  }
  const p = Math.max(0, elapsed / travelTime);
  const ramp = x => { const q = Math.max(0, Math.min(1, x)); return q * q * (3 - 2 * q); };
  return {
    position: steps * travelProgress(p),
    blur: 1.6 * ramp(p / .18) * (1 - ramp((p - .58) / .42)),
    state: 'spinning',
  };
}

export function buildReelStrip(initial, outcome, filler, steps) {
  // One padding cell above the result keeps the existing strip alignment. The
  // first window is the old grid; downward travel reveals the exact outcome.
  const symbols = [filler(0), ...outcome];
  while (symbols.length < steps + 1) symbols.push(filler(symbols.length));
  symbols.push(...initial);
  return { symbols, startIndex: steps + 1, endIndex: 1 };
}
