import { Sprite } from "./Sprite.js";
import { creditDamage } from "../runtime/contribution.js";

export class Tower extends Sprite {
  width = 50;
  height = 50;

  drawWidth = 96;
  drawHeight = 96;

  maxHealth = 100;
  health = 100;

  reward = 80;

  attackRadius = 200;
  attackDamage = 10;
  attackCooldownMs = 800;
  lastAttackAt = 0;

  target = null;
  lastAttackerTeam = null;

  projectiles = [];
  projectileSpeed = 5;
  projectileSize = 6;

  hitEffects = [];

  lastHitBy = null;
  rewardGranted = false;

  static image = null;
  static loaded = false;

  static loadAssets() {
    if (!Tower.image) {
      Tower.image = new Image();
      Tower.image.onload = () => {
        Tower.loaded = true;
      };
      Tower.image.src = "../assets/Tower/tower_1.png";
    }
  }

  constructor(position, gameCanvas, options = {}) {
    // Incoming tower position = centre point
    super(
      {
        x: position.x - 25,
        y: position.y - 25,
      },
      gameCanvas
    );

    Tower.loadAssets();

    this.showSprite = options.showSprite !== false;
    this.anchorX = position.x;
    this.anchorY = position.y;
  }

  render() {
    const ctx = this.gameCanvas;

    // Stable integer positions to reduce visual twitch
    const spriteX = Math.round(this.anchorX - this.drawWidth / 2);
    const spriteY = Math.round(this.anchorY - this.drawHeight + 10);

    ctx.save();

    if (this.lastShotTime && performance.now() - this.lastShotTime < 90) {
      ctx.globalAlpha = 0.82;
    }

    if (Tower.image && Tower.loaded) {
      ctx.drawImage(
        Tower.image,
        spriteX,
        spriteY,
        this.drawWidth,
        this.drawHeight
      );
    } else {
      // fallback block while image loads
      ctx.fillStyle = "#7a5a2a";
      ctx.fillRect(
        Math.round(this.anchorX - 24),
        Math.round(this.anchorY - 36),
        48,
        48
      );
    }

    ctx.restore();

    this.drawProjectiles();
    this.drawHitEffects();

    this.drawHealthBar(
      Math.round(this.anchorX - this.width / 2),
      Math.round(spriteY - 10)
    );
  }

  drawHealthBar(x = this.anchorX - this.width / 2, y = this.anchorY - 55) {
    const ctx = this.gameCanvas;

    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(x, y, this.width, 6);

    const hpRatio = Math.max(0, this.health / this.maxHealth);

    if (hpRatio > 0.6) ctx.fillStyle = "limegreen";
    else if (hpRatio > 0.3) ctx.fillStyle = "yellow";
    else ctx.fillStyle = "#ff3b30";

    ctx.fillRect(x, y, this.width * hpRatio, 6);

    ctx.strokeStyle = "black";
    ctx.strokeRect(x, y, this.width, 6);
  }

  drawProjectiles() {
    const ctx = this.gameCanvas;

    for (const p of this.projectiles) {
      ctx.save();

      // glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.projectileSize + 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 160, 60, 0.30)";
      ctx.fill();

      // main shot
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.projectileSize, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb347";
      ctx.fill();

      // bright core
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, this.projectileSize / 2), 0, Math.PI * 2);
      ctx.fillStyle = "#fff5cc";
      ctx.fill();

      ctx.restore();
    }
  }

  drawHitEffects() {
    const ctx = this.gameCanvas;
    const now = performance.now();

    this.hitEffects = this.hitEffects.filter((fx) => {
      const age = now - fx.createdAt;
      if (age > 140) return false;

      const alpha = 1 - age / 140;
      const radius = 4 + age * 0.05;

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#fff0a0";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "#ff7a00";
      ctx.fill();

      ctx.restore();

      return true;
    });
  }

  takeDamage(amount, attackerId = null) {
    if (this.isDead) return;

    if (attackerId) {
      this.lastHitBy = attackerId;
      if (attackerId === "host" || attackerId === "ally") {
        this.lastAttackerTeam = attackerId;
        creditDamage(attackerId, amount);
      }
    }

    this.health -= amount;

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
    const from = {
      x: this.centre.x,
      y: this.centre.y,
    };

    const dx = target.centre.x - from.x;
    const dy = target.centre.y - from.y;
    const angle = Math.atan2(dy, dx);

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
    this.lastShotTime = performance.now();
  }

  updateProjectiles() {
    this.projectiles = this.projectiles.filter((p) => {
      const target = p.target;

      if (target && !target.isDead) {
        const dx = target.centre.x - p.x;
        const dy = target.centre.y - p.y;
        const angle = Math.atan2(dy, dx);

        p.vx = Math.cos(angle) * this.projectileSpeed;
        p.vy = Math.sin(angle) * this.projectileSpeed;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (!target || target.isDead) return false;

      const dx = target.centre.x - p.x;
      const dy = target.centre.y - p.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= 10) {
        if (typeof target.takeDamage === "function") {
          target.takeDamage(p.damage);
        }

        this.hitEffects.push({
          x: p.x,
          y: p.y,
          createdAt: performance.now(),
        });

        return false;
      }

      return true;
    });
  }

  updateFrame(units) {
    if (this.isDead) return;

    this.findTarget(units);
    this.attack();
    this.updateProjectiles();
    this.render();
  }

  get isDead() {
    return this.health <= 0;
  }
}