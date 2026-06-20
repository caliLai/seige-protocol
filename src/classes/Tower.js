import { Sprite } from "./Sprite.js";
import { creditDamage } from "../runtime/contribution.js";
import { sim } from "../runtime/sim.js";
import {
  damageToTowerMultiplier,
  damageFromTowerMultiplier,
} from "../runtime/towerMatchups.js";

export class Tower extends Sprite {
  width = 50;
  height = 50;

  // Drawn larger than the 50x50 footprint and sized to the source art's
  // aspect ratio (157x120 -> ~1.31) so the new tower sprite isn't squashed.
  drawWidth = 104;
  drawHeight = 80;

  maxHealth = 300;
  health = 300;

  reward = 80;

  attackRadius = 200;
  attackDamage = 10;
  attackCooldownMs = 800;
  lastAttackAt = 0;

  // Which assets/Tower/PNG/<type>.png sprite this tower uses. Higher numbers
  // are stronger (see statsForType). Set in the constructor.
  type = 25;
  // General incoming-damage multiplier from the tower's type (stacks on top
  // of the per-unit matchup multiplier). <1 means it shrugs off damage.
  damageTakenMult = 1;

  target = null;

  // Team that landed the last hit on this tower. battle.js reads this
  // when the tower dies so the killing-blow side gets towers_destroyed
  // credit and the per-side gold reward.
  lastAttackerTeam = null;

  projectiles = [];
  projectileSpeed = 5;
  projectileSize = 8;

  lastHitBy = null;
  rewardGranted = false;

  // Set by battle.js when this tower is clicked for the info panel. Drives
  // the subtle white highlight in render() so the player can see which tower
  // the panel is describing.
  selected = false;

  // Per-type sprite cache: type number → { img, loaded }. Towers of the same
  // type share one Image so each PNG is fetched at most once.
  static images = new Map();

  constructor(position, gameCanvas, type = 25) {
    super(position, gameCanvas);
    this.type = Number(type) || 25;
    Tower.loadAssets(this.type);

    // Scale combat stats off the type number.
    const s = Tower.statsForType(this.type);
    this.maxHealth = s.maxHealth;
    this.health = s.maxHealth;
    this.attackDamage = s.attackDamage;
    this.damageTakenMult = s.damageTakenMult;

    // Each type fires a visually distinct projectile (colour + shape + spin).
    this.projectileStyle = Tower.projectileStyleForType(this.type);

    this.hitEffects = [];
  }

  static PROJECTILE_SHAPES = ["orb", "diamond", "ring", "bolt", "star", "comet"];

  // Deterministic projectile look per tower type: a distinct hue, shape, size
  // and spin direction so each PNG type's shots read differently on screen.
  static projectileStyleForType(type) {
    const n = Number(type) || 25;
    const hue = (n * 47) % 360;
    return {
      core: `hsl(${hue} 95% 78%)`,
      glow: `hsla(${hue}, 95%, 55%, 0.45)`,
      edge: `hsl(${hue} 90% 45%)`,
      shape: Tower.PROJECTILE_SHAPES[n % Tower.PROJECTILE_SHAPES.length],
      size: 6 + (n % 4),
      spin: (n % 2 ? 1 : -1) * (1.2 + (n % 3) * 0.6),
    };
  }

  // Strength scaling by tower PNG type number. Higher number = more health,
  // harder hits, and stronger general resistance (less damage taken). Tuned so
  // the per-map pools (calista 3–12, arshdeep 13–16, eric 17–26) ramp up
  // across the run.
  static statsForType(type) {
    const n = Number(type) || 25;
    return {
      maxHealth: Math.round(180 + n * 22),                  // n3→246 … n26→752
      attackDamage: Math.round((6 + n * 0.9) * 10) / 10,    // n3→8.7 … n26→29.4
      damageTakenMult: Math.max(0.4, 1 - (n - 3) * 0.018),  // n3→1.0 … n26→0.59
    };
  }

  static loadAssets(type = 25) {
    const key = Number(type) || 25;
    if (!Tower.images.has(key)) {
      const entry = { img: new Image(), loaded: false };
      entry.img.onload = () => { entry.loaded = true; };
      entry.img.src = `../assets/Tower/PNG/${key}.png`;
      Tower.images.set(key, entry);
    }
    return Tower.images.get(key);
  }

  // The loaded Image for this tower's type, or null while it's still fetching.
  get image() {
    const e = Tower.images.get(this.type);
    return e && e.loaded ? e.img : null;
  }

  render() {
    const img = this.image;
    if (!img) return;

    const drawX = this.position.x - (this.drawWidth - this.width) / 2;
    const drawY = this.position.y - (this.drawHeight - this.height);

    if (this.selected) {
      // Brighten the sprite toward white so the clicked tower stands out
      // while its stats show in the info panel. The filter only affects this
      // draw, so it tints the tower shape itself, not the surrounding tiles.
      this.gameCanvas.save();
      this.gameCanvas.filter = "brightness(1.5)";
      this.gameCanvas.drawImage(img, drawX, drawY, this.drawWidth, this.drawHeight);
      this.gameCanvas.restore();
    } else {
      this.gameCanvas.drawImage(img, drawX, drawY, this.drawWidth, this.drawHeight);
    }

    this.drawHealthBar();
    this.gameCanvas.globalAlpha = 1;
  }

  drawHealthBar() {
    const x = this.position.x;
    const y = this.position.y - 10;

    this.gameCanvas.fillStyle = "#3a3a3a";
    this.gameCanvas.fillRect(x, y, this.width, 6);

    const hpRatio = this.health / this.maxHealth;

    if (hpRatio > 0.6) this.gameCanvas.fillStyle = "limegreen";
    else if (hpRatio > 0.3) this.gameCanvas.fillStyle = "yellow";
    else this.gameCanvas.fillStyle = "#ff3b30";

    this.gameCanvas.fillRect(x, y, this.width * hpRatio, 6);

    this.gameCanvas.strokeStyle = "black";
    this.gameCanvas.strokeRect(x, y, this.width, 6);
  }

  takeDamage(amount, attackerId = null, attackerUnitType = null) {
    if (this.isDead) return;

    // Stone-tower matchup: units this tower type is weak to hit harder,
    // units it resists hit softer. Credit the team with the ACTUAL damage
    // landed so the reward split reflects what really happened.
    const dealt = amount * damageToTowerMultiplier(attackerUnitType, this.type) * this.damageTakenMult;

    if (attackerId) {
      this.lastHitBy = attackerId;
      if (attackerId === "host" || attackerId === "ally") {
        this.lastAttackerTeam = attackerId;
        creditDamage(attackerId, dealt);
      }
    }

    this.health -= dealt;

    if (this.health <= 0) {
      this.grantRewardOnce();
    }
  }

  grantRewardOnce() {
    if (this.rewardGranted) return;
    this.rewardGranted = true;

    const winnerId = this.lastHitBy;

    if (typeof window.awardTowerReward === "function") {
      window.awardTowerReward(winnerId, this.reward);
      return;
    }

    if (typeof window.addGold === "function") {
      window.addGold(this.reward);
    }
  }

  findTarget(units) {
    if (!Array.isArray(units) || units.length === 0) {
      this.target = null;
      return;
    }

    // Keep current target if still valid and still in range
    if (this.target && !this.target.isDead) {
      const dx = this.target.centre.x - this.centre.x;
      const dy = this.target.centre.y - this.centre.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= this.attackRadius) {
        return;
      }
    }

    let nearest = null;
    let nearestDistance = Infinity;

    for (const unit of units) {
      if (!unit || unit.isDead) continue;

      const dx = unit.centre.x - this.centre.x;
      const dy = unit.centre.y - this.centre.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= this.attackRadius && distance < nearestDistance) {
        nearest = unit;
        nearestDistance = distance;
      }
    }

    this.target = nearest;
  }

  spawnProjectile(target) {
    const dx = target.centre.x - this.centre.x;
    const dy = target.centre.y - this.centre.y;
    const angle = Math.atan2(dy, dx);

    // Spawn the shot at the tower's edge along the firing direction so it
    // never overlaps (and visually pulses over) the tower sprite.
    const muzzleOffset = 55;
    const from = {
      x: this.centre.x + Math.cos(angle) * muzzleOffset,
      y: this.centre.y + Math.sin(angle) * muzzleOffset,
    };

    this.projectiles.push({
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * this.projectileSpeed,
      vy: Math.sin(angle) * this.projectileSpeed,
      damage: this.attackDamage,
      target,
    });
  }

  attack() {
    if (!this.target) return;

    const now = performance.now();
    if ((now - this.lastAttackAt) * sim.speed < this.attackCooldownMs) return;

    this.lastAttackAt = now;
    this.spawnProjectile(this.target);
  }

  renderHitEffects() {
    const now = performance.now();

    this.hitEffects = this.hitEffects.filter((effect) => {
      const elapsed = now - effect.createdAt;
      const duration = 200;

      const progress = elapsed / duration;
      if (progress >= 1) return false;

      const radius = 5 + progress * 15;
      const alpha = 1 - progress;

      this.gameCanvas.save();
      this.gameCanvas.globalAlpha = alpha;

      this.gameCanvas.fillStyle = "orange";
      this.gameCanvas.beginPath();
      this.gameCanvas.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      this.gameCanvas.fill();

      this.gameCanvas.restore();

      return true;
    });
  }

  // Draw one in-flight projectile in this tower type's style: a fading motion
  // trail, a pulsing glow, and a spinning shaped core.
  drawProjectile(p) {
    const ctx = this.gameCanvas;
    const st = this.projectileStyle;
    const t = performance.now() / 1000;

    // Motion trail.
    p.trail = p.trail || [];
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 6) p.trail.shift();
    for (let i = 0; i < p.trail.length - 1; i++) {
      const tp = p.trail[i];
      const frac = (i + 1) / p.trail.length;
      ctx.save();
      ctx.globalAlpha = frac * 0.4;
      ctx.fillStyle = st.glow;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, st.size * 0.6 * frac, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Pulsing glow halo.
    ctx.save();
    ctx.fillStyle = st.glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, st.size + 3 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Spinning shaped core.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.vy, p.vx) + t * st.spin);
    ctx.fillStyle = st.core;
    ctx.strokeStyle = st.edge;
    ctx.lineWidth = 1.5;
    this.drawShape(ctx, st.shape, st.size + Math.sin(t * 10) * 0.8);
    ctx.restore();
  }

  drawShape(ctx, shape, s) {
    ctx.beginPath();
    switch (shape) {
      case "diamond":
        ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case "ring":
        ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.fill();
        break;
      case "bolt":
        ctx.moveTo(-s, 0); ctx.lineTo(s, -s * 0.55); ctx.lineTo(s * 0.2, 0);
        ctx.lineTo(s, s * 0.55); ctx.closePath(); ctx.fill();
        break;
      case "star":
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? s * 0.45 : s;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        break;
      case "comet":
        ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(-s * 3, -s * 0.45); ctx.lineTo(-s * 3, s * 0.45);
        ctx.closePath(); ctx.fill();
        break;
      case "orb":
      default:
        ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
    }
  }

  updateProjectiles(units = []) {
    const list = Array.isArray(units) ? units : [];

    this.projectiles = this.projectiles.filter((p) => {
      const target = p.target;

      // Home toward the locked target while it lives; once it dies the
      // shot keeps its last heading and can still strike another unit.
      if (target && !target.isDead) {
        const dx = target.centre.x - p.x;
        const dy = target.centre.y - p.y;

        const angle = Math.atan2(dy, dx);

        p.vx = Math.cos(angle) * this.projectileSpeed;
        p.vy = Math.sin(angle) * this.projectileSpeed;
      }

      p.x += p.vx;
      p.y += p.vy;

      const ctx = this.gameCanvas;
      this.drawProjectile(p);

      // Damage whichever living unit the shot actually overlaps — not
      // only the unit it was originally aimed at. Without this, projectiles
      // visibly pass through other units in a cluster without hurting them.
      const hit = list.find((u) => {
        if (!u || u.isDead || typeof u.takeDamage !== "function") return false;
        const dx = u.centre.x - p.x;
        const dy = u.centre.y - p.y;
        return Math.hypot(dx, dy) <= u.width / 2 + this.projectileSize;
      });

      if (hit) {
        // Matchup also shapes outgoing fire: the tower hits units it
        // resists harder, and units it's weak to more gently.
        hit.takeDamage(p.damage * damageFromTowerMultiplier(hit.unitType, this.type));

        this.hitEffects.push({
          x: p.x,
          y: p.y,
          createdAt: performance.now(),
        });

        return false;
      }

      // Drop spent shots that leave the field (e.g. their target died and
      // they connected with nothing) so they don't fly on forever.
      const canvas = ctx.canvas;
      if (
        canvas &&
        (p.x < -20 ||
          p.y < -20 ||
          p.x > canvas.width + 20 ||
          p.y > canvas.height + 20)
      ) {
        return false;
      }

      return true;
    });
  }

  updateFrame(units) {
    if (this.isDead) {
      this.renderHitEffects();
      return;
    }

    this.findTarget(units);
    this.attack();
    this.updateProjectiles(units);
    this.render();
    this.renderHitEffects();
  }
}
