/* ═══════════════════════════════════════════════
   PROCEDURAL TOWER PLACEMENT
   Generates tower positions hugging the SIDES of a map's road, plus a tower
   type drawn from the map's pool. Fully deterministic: seeded from the siege
   id + map index so both clients produce the IDENTICAL layout without any DB
   round-trip (same pattern as the stone-tower matchup roll).
   ═══════════════════════════════════════════════ */

// FNV-1a hash → 32-bit seed.
const hashString = (str) => {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

// mulberry32 — small, fast, deterministic PRNG.
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Returns [{ x, y, type }] — tower anchor positions just off the road edge,
// each tagged with a type from `types`. `seed` is any stable string.
export const generateTowers = ({
  seed,
  path,
  types,
  count = 7,
  canvasW = 1120,
  canvasH = 640,
}) => {
  const pts = Array.isArray(path) ? path : [];
  if (pts.length < 2 || !Array.isArray(types) || !types.length) return [];

  const rng = mulberry32(hashString(seed || "siege"));

  // Cumulative-length table so we can sample uniformly along the road.
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, acc: total });
    total += len;
  }
  if (total <= 0) return [];

  const HALF = 25;             // tower footprint half-size (centre = anchor + HALF)
  const margin = 60;           // keep tower centres on-canvas
  const minGap = 95;           // no two tower centres closer than this
  // Perpendicular distance of the tower CENTRE from the road centreline. Kept
  // under the shortest unit melee reach (~97 = attackRadius 80 + buffer) so
  // EVERY unit type can engage a tower as it marches past — otherwise melee
  // units walk straight by towers placed too far off the road. The footprint
  // still sits at the road's edge (inner edge ~29–49px out), so towers read as
  // standing alongside the road rather than on it.
  const offMin = 54, offMax = 74;

  const inBounds = (cx, cy) =>
    cx >= margin && cx <= canvasW - margin && cy >= margin && cy <= canvasH - margin;

  const placed = [];   // each: { x, y (anchor), cx, cy (centre), type }
  let attempts = 0;
  while (placed.length < count && attempts < count * 50) {
    attempts++;
    const d = rng() * total;
    const seg = segs.find((s) => d >= s.acc && d <= s.acc + s.len) || segs[segs.length - 1];
    const t = seg.len ? (d - seg.acc) / seg.len : 0;
    const px = seg.a.x + (seg.b.x - seg.a.x) * t;
    const py = seg.a.y + (seg.b.y - seg.a.y) * t;

    // Unit perpendicular to the road, then offset the CENTRE to one side.
    const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const side = rng() < 0.5 ? 1 : -1;
    const off = offMin + rng() * (offMax - offMin);
    const cx = px + nx * off * side;
    const cy = py + ny * off * side;

    if (!inBounds(cx, cy)) continue;
    if (placed.some((p) => Math.hypot(p.cx - cx, p.cy - cy) < minGap)) continue;

    const type = types[Math.floor(rng() * types.length)];
    placed.push({ x: Math.round(cx - HALF), y: Math.round(cy - HALF), cx, cy, type });
  }

  return placed.map(({ x, y, type }) => ({ x, y, type }));
};
