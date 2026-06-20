/* ═══════════════════════════════════════════════
   SIMULATION TIMING
   Shared deltaTime reference so entity classes can step in
   wall-clock time instead of being tied to the rAF frame rate.
   battle.js writes sim.dt every frame; entity updateFrame()
   methods read it.
   ═══════════════════════════════════════════════ */

export const sim = {
  // Milliseconds since last frame. Default ~16ms (60fps) so the first
  // frame before battle.js has assigned a real value still looks sane.
  dt: 16,

  // Gameplay speed multiplier set by the x1/x2/x4 button in the battle HUD.
  // Unit movement scales by this per frame, and attack cooldowns elapse this
  // many times faster, so the whole match plays at 1x/2x/4x wall-clock pace.
  speed: 1,
};
