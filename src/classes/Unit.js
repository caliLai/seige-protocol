import { Sprite } from "./Sprite.js";
import { path } from "../data/path.js";
import { sim } from "../runtime/sim.js";

export class Unit extends Sprite {
  width = 50;
  height = 50;
  pathIndex = 0;
  moveSpeedPxPerSecond = 60;

  attackRadius = 100;
  attackStrength = 8;
  attackCooldownMs = 250;
  lastAttackAt = 0;

  projectileSpeed = 4;
  projectileSize = 8;
  projectiles = [];

  _target = null;

  laneOffset = 0;
  pathRef = null;

  ownerId = null;
  team = null;

  constructor(position, gameCanvas) {
    super(position, gameCanvas);
    this.pathRef = null;
    this.laneOffset = 0;
    this.ownerId = null;
    this.team = null;
  }

  set target(newTarget) {
    this._target = newTarget;
  }

  get target() {
    return this._target;
  }

  render() {
    this.gameCanvas.fillStyle = 'red';
    this.gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);
    this.drawHealthBar();
  }

  drawHealthBar() {
    if (this.maxHealth <= 0) return;

    const barWidth = this.width;
    const barHeight = 5;

    const x = this.position.x;
    const y = this.position.y - 8;

    this.gameCanvas.fillStyle = "#3a3a3a";
    this.gameCanvas.fillRect(x, y, barWidth, barHeight);

    const hpRatio = this.health / this.maxHealth;

    if (hpRatio > 0.6) this.gameCanvas.fillStyle = "limegreen";
    else if (hpRatio > 0.3) this.gameCanvas.fillStyle = "yellow";
    else this.gameCanvas.fillStyle = "#ff3b30";

    this.gameCanvas.fillRect(x, y, barWidth * hpRatio, barHeight);

    this.gameCanvas.strokeStyle = "black";
    this.gameCanvas.strokeRect(x, y, barWidth, barHeight);
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
    }
  }

  attack() {
    if (!this.target) return;

    const now = performance.now();
    if (now - this.lastAttackAt < this.attackCooldownMs) return;

    this.lastAttackAt = now;

    const from = {
      x: this.centre.x - this.projectileSize / 2,
      y: this.centre.y - this.projectileSize / 2,
    };

    const to = this.target.centre;
    const angle = Math.atan2(to.y - this.centre.y, to.x - this.centre.x);

    this.projectiles.push({
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * this.projectileSpeed,
      vy: Math.sin(angle) * this.projectileSpeed,
      damage: this.attackStrength,
      target: this.target,
      ownerId: this.ownerId
    });
  }

  updateProjectiles() {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;

      this.gameCanvas.fillStyle = '#ff2b2b';
      this.gameCanvas.fillRect(projectile.x, projectile.y, this.projectileSize, this.projectileSize);

      const target = projectile.target;
      if (!target || target.isDead) return false;

      const projectileCenterX = projectile.x + this.projectileSize / 2;
      const projectileCenterY = projectile.y + this.projectileSize / 2;

      const dx = target.centre.x - projectileCenterX;
      const dy = target.centre.y - projectileCenterY;

      if (Math.hypot(dx, dy) <= this.projectileSize + 4) {
        target.takeDamage(projectile.damage, projectile.ownerId);
        return false;
      }

      return true;
    });
  }

  calculateAndUpdatePathMovement() {
    const activePath =
      (this.pathRef && Array.isArray(this.pathRef) && this.pathRef.length)
        ? this.pathRef
        : path;

    const pathPoint = activePath[this.pathIndex];
    if (!pathPoint) return;

    const laneOffset = (typeof this.laneOffset === 'number') ? this.laneOffset : 0;

    let dirX = 0;
    let dirY = 0;

    const nextPoint = activePath[this.pathIndex + 1];
    const prevPoint = activePath[this.pathIndex - 1];

    if (nextPoint) {
      dirX = nextPoint.x - pathPoint.x;
      dirY = nextPoint.y - pathPoint.y;
    } else if (prevPoint) {
      dirX = pathPoint.x - prevPoint.x;
      dirY = pathPoint.y - prevPoint.y;
    } else {
      dirX = 1;
      dirY = 0;
    }

    const len = Math.hypot(dirX, dirY) || 1;
    const perpX = -dirY / len;
    const perpY = dirX / len;

    const targetX = pathPoint.x + perpX * laneOffset;
    const targetY = pathPoint.y + perpY * laneOffset;

    const dx = targetX - this.centre.x;
    const dy = targetY - this.centre.y;

    const distance = Math.hypot(dx, dy);

    const waypointReachDistance = 8;
    if (distance <= waypointReachDistance && this.pathIndex < activePath.length - 1) {
      this.pathIndex++;
      return;
    }

    const angle = Math.atan2(dy, dx);
    const frameStep = Math.min(this.moveSpeedPxPerSecond / 60, distance);

    this.position.x += Math.cos(angle) * frameStep;
    this.position.y += Math.sin(angle) * frameStep;
  }

  resetAttackState() {
    if (typeof this.isAttacking === 'boolean') this.isAttacking = false;
    if (typeof this.hasReleasedProjectile === 'boolean') this.hasReleasedProjectile = false;
    if (typeof this.hasAppliedHit === 'boolean') this.hasAppliedHit = false;
    if (typeof this.currentAttackFrame === 'number') this.currentAttackFrame = 0;
  }

  updateFrame() {
    if (this.isDead) return;

    this.render();

    if (this.target) {
      this.attack();
    } else {
      this.resetAttackState();
      this.calculateAndUpdatePathMovement();
    }

    this.updateProjectiles();
  }
}
