import { Sprite } from "./Sprite.js";
import { creditDamage } from "../runtime/contribution.js";
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

  maxHealth = 100;
  health = 100;

  reward = 80;

  attackRadius = 200;
  attackDamage = 10;
  attackCooldownMs = 800;
  lastAttackAt = 0;

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

  static image = null;
  static loaded = false;

  constructor(position, gameCanvas) {
    super(position, gameCanvas);
    Tower.loadAssets();

    this.hitEffects = [];
  }

  static loadAssets() {
    if (!Tower.image) {
      Tower.image = new Image();
      Tower.image.onload = () => {
        Tower.loaded = true;
      };
      Tower.image.src = "../assets/Tower/PNG/25.png";
    }
  }

  render() {
    if (!Tower.image || !Tower.loaded) return;

    const drawX = this.position.x - (this.drawWidth - this.width) / 2;
    const drawY = this.position.y - (this.drawHeight - this.height);

    if (this.selected) {
      // Brighten the sprite toward white so the clicked tower stands out
      // while its stats show in the info panel. The filter only affects this
      // draw, so it tints the tower shape itself, not the surrounding tiles.
      this.gameCanvas.save();
      this.gameCanvas.filter = "brightness(1.5)";
      this.gameCanvas.drawImage(
        Tower.image,
        drawX,
        drawY,
        this.drawWidth,
        this.drawHeight,
      );
      this.gameCanvas.restore();
    } else {
      this.gameCanvas.drawImage(
        Tower.image,
        drawX,
        drawY,
        this.drawWidth,
        this.drawHeight,
      );
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
    const dealt = amount * damageToTowerMultiplier(attackerUnitType);

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
    if (now - this.lastAttackAt < this.attackCooldownMs) return;

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

      ctx.save();
      ctx.fillStyle = "#cc3300";
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.projectileSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

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
        hit.takeDamage(p.damage * damageFromTowerMultiplier(hit.unitType));

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
