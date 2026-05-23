/* ═══════════════════════════════════════════════
   UNIT ROSTER — view and unlock playable units
   ═══════════════════════════════════════════════ */

import { supabase } from '/lib/supabase.js';

// ── UNIT CATALOG ──
// `starter: true` means the unit is always available — those rows are not
// stored in profiles.unlocked_units. Cost is in gold for everyone else.
// `attack` is the sprite filename suffix (most use Attack01; Priest is the
// odd one out with just Attack).
const UNITS = [
  { id: 'Soldier',             cost: 0,   starter: true, hp: 100, damage: 15, speed: 5, attack: 'Attack01',
    desc: 'A loyal recruit, honed by drills and stale gruel.' },
  { id: 'Archer',              cost: 0,   starter: true, hp: 75,  damage: 18, speed: 6, attack: 'Attack01',
    desc: 'Strikes from afar — never seen, always feared.' },
  { id: 'Slime',               cost: 0,   starter: true, hp: 50,  damage: 8,  speed: 3, attack: 'Attack01',
    desc: 'Squishy. Loyal. Mildly corrosive on the carpet.' },
  { id: 'Swordsman',           cost: 50,  hp: 110, damage: 20, speed: 5, attack: 'Attack01',
    desc: 'A blade for hire who learned chivalry late in life.' },
  { id: 'Orc',                 cost: 50,  hp: 130, damage: 22, speed: 4, attack: 'Attack01',
    desc: 'Brutish, simple, and surprisingly fond of poetry.' },
  { id: 'Skeleton',            cost: 50,  hp: 80,  damage: 14, speed: 5, attack: 'Attack01',
    desc: 'Rises again each dawn. Hates squeaky knees.' },
  { id: 'Skeleton Archer',     cost: 100, hp: 70,  damage: 20, speed: 6, attack: 'Attack',
    desc: 'Notches a fresh arrow with each missing rib.' },
  { id: 'Armored Axeman',      cost: 100, hp: 140, damage: 25, speed: 4, attack: 'Attack01',
    desc: 'Cleaves through gates and conversations alike.' },
  { id: 'Knight',              cost: 100, hp: 150, damage: 22, speed: 5, attack: 'Attack01',
    desc: 'Sworn to the realm, the lord, and a fine bottle of mead.' },
  { id: 'Lancer',              cost: 100, hp: 120, damage: 26, speed: 6, attack: 'Attack01',
    desc: 'Charges first, asks for directions never.' },
  { id: 'Priest',              cost: 100, hp: 80,  damage: 12, speed: 4, attack: 'Attack',
    desc: 'Mends the faithful, smites the wicked, files the paperwork.' },
  { id: 'Wizard',              cost: 150, hp: 70,  damage: 32, speed: 4, attack: 'Attack01',
    desc: 'Burns parchment, foes, and the occasional eyebrow.' },
  { id: 'Armored Skeleton',    cost: 200, hp: 130, damage: 20, speed: 4, attack: 'Attack01',
    desc: 'Plate over bone — clatters louder than it kills.' },
  { id: 'Greatsword Skeleton', cost: 200, hp: 140, damage: 30, speed: 3, attack: 'Attack01',
    desc: 'Swings a sword bigger than its grave was deep.' },
  { id: 'Armored Orc',         cost: 200, hp: 180, damage: 28, speed: 3, attack: 'Attack01',
    desc: 'Heavier, meaner, still terrible at chess.' },
  { id: 'Knight Templar',      cost: 250, hp: 170, damage: 28, speed: 5, attack: 'Attack01',
    desc: 'Holy zeal sharpened on a thousand campaigns.' },
  { id: 'Elite Orc',           cost: 300, hp: 200, damage: 32, speed: 4, attack: 'Attack01',
    desc: 'The biggest, baddest greenskin in the warband.' },
  { id: 'Orc rider',           cost: 350, hp: 180, damage: 30, speed: 8, attack: 'Attack01',
    desc: 'Mounted fury. The boar is angrier than the rider.' },
  { id: 'Werebear',            cost: 400, hp: 240, damage: 36, speed: 5, attack: 'Attack01',
    desc: 'By day a scholar. By moonrise, a problem.' },
  { id: 'Werewolf',            cost: 400, hp: 200, damage: 38, speed: 8, attack: 'Attack01',
    desc: 'Faster than rumour, hungrier than a tax collector.' },
];

// ── DOM REFS ──
const grid = document.getElementById('rosterGrid');
const backBtn = document.getElementById('backBtn');
const alertEl = document.getElementById('alertBanner');
const treasuryAmount = document.getElementById('treasuryAmount');

// ── HOVER TOOLTIP ──
// Created once and reused so we don't churn DOM nodes per hover.
const tooltip = document.createElement('div');
tooltip.id = 'unitTooltip';
tooltip.className = 'unit-tooltip hidden';
tooltip.setAttribute('aria-hidden', 'true');
document.body.appendChild(tooltip);

// ── HELPERS ──
const showAlert = (msg, type = 'info') => {
  alertEl.textContent = msg;
  alertEl.style.display = 'block';
  alertEl.style.background = type === 'error' ? '#7b241c' : '#7a600c';
  alertEl.style.color = '#f0d9a0';
  alertEl.style.boxShadow = '3px 3px 0 #000';
  clearTimeout(alertEl._t);
  alertEl._t = setTimeout(() => { alertEl.style.display = 'none'; }, 2600);
};

const setTreasury = (points) => {
  treasuryAmount.textContent = (points ?? 0).toLocaleString();
};

// Matches start-screen.js: use the browser's cross-document View Transitions
// (Chrome 126+, Safari 18+) for the same smooth handoff used when entering
// the roster. Fall back to a body fade on older browsers.
const smoothNavigate = (url) => {
  if ('startViewTransition' in document) {
    setTimeout(() => { window.location.href = url; }, 200);
    return;
  }
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = url; }, 400);
};

// ── AUTH GATE ──
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  window.location.href = '/login/login.html';
}

// ── STATE ──
let currentPoints = 0;
let unlockedSet = new Set();

const loadProfile = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('points, unlocked_units')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) console.error('profile load failed', error);
  currentPoints = data?.points ?? 0;
  unlockedSet = new Set(data?.unlocked_units ?? []);
  setTreasury(currentPoints);
};

// ── RENDERING ──
const lockSvg = `<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
  <rect x="2" y="1" width="4" height="1" fill="currentColor"/>
  <rect x="1" y="2" width="1" height="2" fill="currentColor"/>
  <rect x="6" y="2" width="1" height="2" fill="currentColor"/>
  <rect x="0" y="3" width="8" height="4" fill="currentColor"/>
  <rect x="3" y="4" width="2" height="2" fill="#1a0f08"/>
</svg>`;

const isUnlocked = (unit) => unit.starter || unlockedSet.has(unit.id);

const renderCard = (unit) => {
  const unlocked = isUnlocked(unit);
  const card = document.createElement('div');
  card.className = `unit-card ${unlocked ? 'unlocked' : 'locked'}`;
  card.setAttribute('role', 'listitem');
  card.dataset.unitId = unit.id;

  card.innerHTML = `
    ${unlocked ? '' : `
      <div class="unit-lock-badge">
        <span style="color:#a89880">${lockSvg}</span>
        ${unit.cost}
      </div>
    `}
    <div class="unit-sprite-stage">
      <div class="unit-sprite"></div>
    </div>
    <div class="unit-name">${unit.id.toUpperCase()}</div>
  `;

  const spriteEl = card.querySelector('.unit-sprite');
  applyIdleAnimation(spriteEl, unit);

  if (!unlocked) {
    card.addEventListener('click', () => attemptUnlock(unit, card));
  }

  card.addEventListener('mouseenter', () => showTooltip(unit));
  card.addEventListener('mouseleave', hideTooltip);
  return card;
};

// ── IDLE SPRITE (card thumbnails) ──
// The CSS used to hardcode a 6-frame, 100px sheet, which broke for any unit
// whose Idle sheet differed. Measure the real sheet and drive the strip from
// JS so each card gets correct frame size + count.
const IDLE_STAGE_SIZE = 80;
const IDLE_VISUAL_BOX = IDLE_STAGE_SIZE * 3.0;
const IDLE_FRAME_DURATION_MS = 140;
const idleMetaCache = new Map();

const loadIdleMeta = (unit) => {
  if (idleMetaCache.has(unit.id)) return Promise.resolve(idleMetaCache.get(unit.id));
  const safe = unit.id.replace(/ /g, '%20');
  const src = `/assets/${safe}/${safe}/${safe}-Idle.png`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const frameHeight = img.naturalHeight;
      const frameWidth = frameHeight;
      const frameCount = Math.max(1, Math.round(img.naturalWidth / frameWidth));
      const meta = { sheetWidth: img.naturalWidth, frameWidth, frameHeight, frameCount, src };
      idleMetaCache.set(unit.id, meta);
      resolve(meta);
    };
    img.onerror = () => {
      const meta = { sheetWidth: 600, frameWidth: 100, frameHeight: 100, frameCount: 6, src };
      idleMetaCache.set(unit.id, meta);
      resolve(meta);
    };
    img.src = src;
  });
};

const applyIdleAnimation = async (spriteEl, unit) => {
  const meta = await loadIdleMeta(unit);
  if (!spriteEl.isConnected) return;
  const scale = IDLE_VISUAL_BOX / Math.max(meta.frameWidth, meta.frameHeight);
  spriteEl.style.width = `${meta.frameWidth}px`;
  spriteEl.style.height = `${meta.frameHeight}px`;
  spriteEl.style.backgroundImage = `url('${meta.src}')`;
  spriteEl.style.backgroundSize = `${meta.sheetWidth}px ${meta.frameHeight}px`;
  spriteEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
  spriteEl.style.backgroundPosition = '0 0';

  let frame = 0;
  const tick = () => {
    if (!spriteEl.isConnected) return;
    frame = (frame + 1) % meta.frameCount;
    spriteEl.style.backgroundPosition = `${-frame * meta.frameWidth}px 0`;
  };
  setInterval(tick, IDLE_FRAME_DURATION_MS);
};

// ── TOOLTIP LOGIC ──
const TOOLTIP_OFFSET = 18;
const STAGE_SIZE = 140;
const FRAME_DURATION_MS = 110;

// Cache sprite-sheet dimensions so repeated hovers don't refetch the image.
// Each entry: { sheetWidth, sheetHeight, frameWidth, frameHeight, frameCount }.
const spriteMetaCache = new Map();

const loadSpriteMeta = (unit) => {
  if (spriteMetaCache.has(unit.id)) {
    return Promise.resolve(spriteMetaCache.get(unit.id));
  }
  const safe = unit.id.replace(/ /g, '%20');
  const src = `/assets/${safe}/${safe}/${safe}-${unit.attack}.png`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Sheets are horizontal strips — frame height == sheet height, and we
      // assume square frames so frameWidth == frameHeight. The frame count
      // then falls out of sheetWidth / frameWidth.
      const frameHeight = img.naturalHeight;
      const frameWidth = frameHeight;
      const frameCount = Math.max(1, Math.round(img.naturalWidth / frameWidth));
      const meta = {
        sheetWidth: img.naturalWidth,
        sheetHeight: img.naturalHeight,
        frameWidth,
        frameHeight,
        frameCount,
        src,
      };
      spriteMetaCache.set(unit.id, meta);
      resolve(meta);
    };
    img.onerror = () => {
      // Fall back to the legacy assumption if the image can't be measured.
      const meta = { sheetWidth: 600, sheetHeight: 100, frameWidth: 100, frameHeight: 100, frameCount: 6, src };
      spriteMetaCache.set(unit.id, meta);
      resolve(meta);
    };
    img.src = src;
  });
};

let attackAnimTimer = null;
const stopAttackAnim = () => {
  if (attackAnimTimer) { clearInterval(attackAnimTimer); attackAnimTimer = null; }
};

// Apply the detected sheet dimensions to the sprite element and drive the
// animation with a setInterval — robust against any frame count or size.
const applySpriteAnimation = (spriteEl, meta) => {
  stopAttackAnim();
  // Sprite frames pack the character into roughly the center half of the
  // frame, with transparent padding for attack FX. Scale to a larger "visual
  // box" than the stage so the character itself fills the panel — the stage
  // uses overflow: visible to let the padding spill.
  const VISUAL_BOX = STAGE_SIZE * 1.8;
  const scale = VISUAL_BOX / Math.max(meta.frameWidth, meta.frameHeight);
  spriteEl.style.width = `${meta.frameWidth}px`;
  spriteEl.style.height = `${meta.frameHeight}px`;
  spriteEl.style.backgroundSize = `${meta.sheetWidth}px ${meta.frameHeight}px`;
  spriteEl.style.backgroundImage = `url('${meta.src}')`;
  // Absolute-centered with translate so the visual midpoint of the frame
  // always lands on the stage center, regardless of frame dimensions.
  spriteEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
  spriteEl.style.backgroundPosition = '0 0';
  spriteEl.style.animation = 'none';

  let frame = 0;
  attackAnimTimer = setInterval(() => {
    frame = (frame + 1) % meta.frameCount;
    spriteEl.style.backgroundPosition = `${-frame * meta.frameWidth}px 0`;
  }, FRAME_DURATION_MS);
};

const renderTooltip = async (unit) => {
  tooltip.innerHTML = `
    <div class="tt-corner tt-corner-tl"></div>
    <div class="tt-corner tt-corner-tr"></div>
    <div class="tt-corner tt-corner-bl"></div>
    <div class="tt-corner tt-corner-br"></div>
    <div class="tt-header">
      <div class="tt-attack-stage">
        <div class="tt-attack-sprite"></div>
      </div>
      <div class="tt-name">${unit.id.toUpperCase()}</div>
    </div>
    <div class="tt-stats">
      <div class="tt-stat"><span class="tt-stat-label">HP</span><span class="tt-stat-val tt-hp">${unit.hp}</span></div>
      <div class="tt-stat"><span class="tt-stat-label">DMG</span><span class="tt-stat-val tt-dmg">${unit.damage}</span></div>
      <div class="tt-stat"><span class="tt-stat-label">SPD</span><span class="tt-stat-val tt-spd">${unit.speed}</span></div>
    </div>
    <div class="tt-desc">${unit.desc}</div>
  `;

  const spriteEl = tooltip.querySelector('.tt-attack-sprite');
  const requestedId = unit.id;
  const meta = await loadSpriteMeta(unit);
  // Bail out if the user moved to a different card while we were loading.
  if (tooltip.classList.contains('hidden')) return;
  if (!spriteEl.isConnected || tooltip.dataset.currentUnit !== requestedId) return;
  applySpriteAnimation(spriteEl, meta);
};

const positionTooltip = (x, y) => {
  // Keep the tooltip on screen — flip to the other side of the cursor if it
  // would overflow the right/bottom edges.
  const rect = tooltip.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  let left = x + TOOLTIP_OFFSET;
  let top  = y + TOOLTIP_OFFSET;
  if (left + w > window.innerWidth  - 8) left = x - w - TOOLTIP_OFFSET;
  if (top  + h > window.innerHeight - 8) top  = y - h - TOOLTIP_OFFSET;
  if (left < 8) left = 8;
  if (top  < 8) top  = 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top  = `${top}px`;
};

const showTooltip = (unit) => {
  tooltip.dataset.currentUnit = unit.id;
  tooltip.classList.remove('hidden');
  tooltip.setAttribute('aria-hidden', 'false');
  renderTooltip(unit);
};

const hideTooltip = () => {
  stopAttackAnim();
  tooltip.classList.add('hidden');
  tooltip.setAttribute('aria-hidden', 'true');
  delete tooltip.dataset.currentUnit;
};

document.addEventListener('mousemove', (e) => {
  if (tooltip.classList.contains('hidden')) return;
  positionTooltip(e.clientX, e.clientY);
});

const renderGrid = () => {
  grid.innerHTML = '';
  UNITS.forEach(u => grid.appendChild(renderCard(u)));
};

// ── UNLOCK FLOW ──
const attemptUnlock = async (unit, card) => {
  if (isUnlocked(unit)) return;
  if (currentPoints < unit.cost) {
    showAlert(`✗ NOT ENOUGH GOLD! NEED ${unit.cost - currentPoints} MORE.`, 'error');
    return;
  }
  const ok = confirm(`Recruit ${unit.id} for ${unit.cost} gold?`);
  if (!ok) return;

  card.classList.add('purchasing');
  const newPoints = currentPoints - unit.cost;
  const newUnlocked = [...unlockedSet, unit.id];

  const { error } = await supabase
    .from('profiles')
    .update({ points: newPoints, unlocked_units: newUnlocked })
    .eq('user_id', user.id);

  if (error) {
    console.error('unlock failed', error);
    showAlert('✗ THE SCRIBES FAILED. TRY AGAIN.', 'error');
    card.classList.remove('purchasing');
    return;
  }

  currentPoints = newPoints;
  unlockedSet.add(unit.id);
  setTreasury(currentPoints);
  // Swap the card in place to avoid full re-render flicker.
  const fresh = renderCard(unit);
  card.replaceWith(fresh);
  showAlert(`✓ ${unit.id.toUpperCase()} JOINS THY RANKS!`, 'success');
};

// ── BACK NAVIGATION ──
// Tell the start-screen to skip its castle-door intro on return — the doors
// are a "first arrival" flourish, not a reusable transition.
const returnToStartScreen = () => {
  sessionStorage.setItem('skipDoorAnimation', '1');
  smoothNavigate('/start-screen/start-screen.html');
};
backBtn.addEventListener('click', returnToStartScreen);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') returnToStartScreen();
});

// ── INIT ──
// Show a themed loading hint inside the grid panel while the profile is
// fetched — avoids both the empty-bar gap and a "purchased units flash as
// locked" flicker.
grid.innerHTML = '<div class="roster-loading">⚜ MUSTERING THE WARRIORS… ⚜</div>';
loadProfile().then(renderGrid);
