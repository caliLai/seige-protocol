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
};
