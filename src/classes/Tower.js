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

        this.gameCanvas.drawImage(
            Tower.image,
            this.position.x - (this.drawWidth - this.width) / 2,
            this.position.y - (this.drawHeight - this.height),
            this.drawWidth,
            this.drawHeight
        );

        this.drawHealthBar();
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

    findTarget(unit) {
        if (!unit || unit.isDead) {
            this.target = null;
            return;
        }

        const dx = unit.centre.x - this.centre.x;
        const dy = unit.centre.y - this.centre.y;
        const distance = Math.hypot(dx, dy);

        this.target = distance <= this.attackRadius ? unit : null;
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
    }

    updateProjectiles() {
        this.projectiles = this.projectiles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;

            this.gameCanvas.fillStyle = "yellow";
            this.gameCanvas.fillRect(p.x, p.y, this.projectileSize, this.projectileSize);

            const target = p.target;
            if (!target || target.isDead) return false;

            const dx = target.centre.x - p.x;
            const dy = target.centre.y - p.y;
            const distance = Math.hypot(dx, dy);

            if (distance <= 10) {
                if (typeof target.takeDamage === "function") {
                    target.takeDamage(p.damage);
                }
                return false;
            }

            return true;
        });
    }

    updateFrame(unit) {
        if (this.isDead) return;

        this.findTarget(unit);
        this.attack();
        this.updateProjectiles();
        this.render();
    }
}
