class Unit extends Sprite {
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

    constructor(position) {
        super(position);
    }

    set target(newTarget) {
        this._target = newTarget;
    }

    get target() {
        return this._target;
    }

    render() {
        gameCanvas.fillStyle = 'red';
        gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);

        this.drawHealthBar();
    }

    drawHealthBar() {
        if (this.maxHealth <= 0) return;

        const barWidth = this.width;
        const barHeight = 5;

        const x = this.position.x;
        const y = this.position.y - 8;

        gameCanvas.fillStyle = "#3a3a3a";
        gameCanvas.fillRect(x, y, barWidth, barHeight);

        const hpRatio = this.health / this.maxHealth;

        if (hpRatio > 0.6) gameCanvas.fillStyle = "limegreen";
        else if (hpRatio > 0.3) gameCanvas.fillStyle = "yellow";
        else gameCanvas.fillStyle = "#ff3b30";

        gameCanvas.fillRect(x, y, barWidth * hpRatio, barHeight);

        gameCanvas.strokeStyle = "black";
        gameCanvas.strokeRect(x, y, barWidth, barHeight);
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
        });
    }

    updateProjectiles() {
        this.projectiles = this.projectiles.filter((projectile) => {
            projectile.x += projectile.vx;
            projectile.y += projectile.vy;

            gameCanvas.fillStyle = '#ff2b2b';
            gameCanvas.fillRect(projectile.x, projectile.y, this.projectileSize, this.projectileSize);

            const target = projectile.target;
            if (!target || target.isDead) return false;

            const projectileCenterX = projectile.x + this.projectileSize / 2;
            const projectileCenterY = projectile.y + this.projectileSize / 2;

            const dx = target.centre.x - projectileCenterX;
            const dy = target.centre.y - projectileCenterY;

            if (Math.hypot(dx, dy) <= this.projectileSize + 4) {
                target.takeDamage(projectile.damage);
                return false;
            }

            return true;
        });
    }

    calculateAndUpdatePathMovement() {
        const pathPoint = path[this.pathIndex];
        if (!pathPoint) return;

        const dx = pathPoint.x - this.centre.x;
        const dy = pathPoint.y - this.centre.y;

        const distance = Math.hypot(dx, dy);

        if (distance < 2 && this.pathIndex < path.length - 1) {
            this.pathIndex++;
            return;
        }

        const angle = Math.atan2(dy, dx);
        const frameStep = this.moveSpeedPxPerSecond / 60;

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