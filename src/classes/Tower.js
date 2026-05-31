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

    // Team that landed the last hit on this tower. battle.js reads this
    // when the tower dies so the killing-blow side gets towers_destroyed
    // credit and the per-side gold reward.
    lastAttackerTeam = null;

    projectiles = [];
    projectileSpeed = 5;
    projectileSize = 8;

    lastHitBy = null;
    rewardGranted = false;

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
            Tower.image.src = "../assets/Tower/tower_1.png";
        }
    }

    render() {
    if (!Tower.image || !Tower.loaded) return;

    if (this.lastShotTime && performance.now() - this.lastShotTime < 100) {
        this.gameCanvas.globalAlpha = 0.7;
    }

        this.gameCanvas.drawImage(
            Tower.image,
            this.position.x - (this.drawWidth - this.width) / 2,
            this.position.y - (this.drawHeight - this.height),
            this.drawWidth,
            this.drawHeight
        );

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
        this.health = 0;
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
        const from = {
            x: this.centre.x,
            y: this.centre.y
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
            target
        });
    }

    attack() {
        if (!this.target) return;

        const now = performance.now();
        if (now - this.lastAttackAt < this.attackCooldownMs) return;

        this.lastAttackAt = now;
        this.spawnProjectile(this.target);

                // Flash effect
        this.lastShotTime = performance.now();
    }

    renderHitEffects() {
    const now = performance.now();

    this.hitEffects = this.hitEffects.filter(effect => {
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

updateProjectiles() {
    this.projectiles = this.projectiles.filter(p => {

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

        const ctx = this.gameCanvas;

        ctx.save();
        ctx.shadowColor = "rgba(255, 80, 0, 0.6)"; 
        ctx.shadowBlur = 6; 
        ctx.fillStyle = "#cc3300"; 
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.projectileSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

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
                createdAt: performance.now()
            });

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
    this.updateProjectiles();
    this.render();
    this.renderHitEffects();   
    }
}