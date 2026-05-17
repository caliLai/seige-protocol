class Tower extends Sprite {
    width = 50;
    height = 50;

    drawWidth = 96;
    drawHeight = 96;

    maxHealth = 100;
    health = 100;

    reward = 80;
    isDead = false;

    attackRadius = 200;
    attackDamage = 10;
    attackCooldownMs = 800;
    lastAttackAt = 0;

    target = null;

    projectiles = [];
    projectileSpeed = 5;
    projectileSize = 8;

    // ✅ IMAGE SYSTEM
    static image = null;
    static loaded = false;

    constructor(position) {
        super(position);
        Tower.loadAssets();
    }

    static loadAssets() {
        if (!Tower.image) {
            Tower.image = new Image();
            Tower.image.onload = () => {
                Tower.loaded = true;
            };

            // ✅ your asset
            Tower.image.src = "../assets/Tower/tower_1.png";
        }
    }

    render() {
        // ✅ ALWAYS attempt to draw image (no flicker fallback switching)
        if (Tower.image && Tower.loaded) {
            gameCanvas.drawImage(
                Tower.image,
                this.position.x - (this.drawWidth - this.width) / 2,
                // ✅ FIX: anchor to bottom instead of center
                this.position.y - (this.drawHeight - this.height),
                this.drawWidth,
                this.drawHeight
            );
        }

        this.drawHealthBar();
    }

    drawHealthBar() {
        const x = this.position.x;
        const y = this.position.y - 10;

        gameCanvas.fillStyle = "#3a3a3a";
        gameCanvas.fillRect(x, y, this.width, 6);

        const hpRatio = this.health / this.maxHealth;

        if (hpRatio > 0.6) gameCanvas.fillStyle = "limegreen";
        else if (hpRatio > 0.3) gameCanvas.fillStyle = "yellow";
        else gameCanvas.fillStyle = "#ff3b30";

        gameCanvas.fillRect(x, y, this.width * hpRatio, 6);

        gameCanvas.strokeStyle = "black";
        gameCanvas.strokeRect(x, y, this.width, 6);
    }

    takeDamage(amount) {
        if (this.isDead) return;

        this.health -= amount;
        if (this.health < 0) this.health = 0;

        if (this.health === 0 && !this.isDead) {
            this.isDead = true;

            console.log("Tower destroyed! +" + this.reward + " gold");

            if (typeof addGold === "function") {
                addGold(this.reward);
            }
        }
    }

    findTarget(unit) {
        if (!unit || unit.health <= 0) {
            this.target = null;
            return;
        }

        const dx = unit.centre.x - this.centre.x;
        const dy = unit.centre.y - this.centre.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= this.attackRadius) {
            this.target = unit;
        } else {
            this.target = null;
        }
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

            gameCanvas.fillStyle = "yellow";
            gameCanvas.fillRect(p.x, p.y, this.projectileSize, this.projectileSize);

            const target = p.target;
            if (!target || target.health <= 0) return false;

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