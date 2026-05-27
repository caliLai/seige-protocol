import { Unit } from "./Unit.js";

export class Soldier extends Unit {
    role = 'Versatile Ranged';

    width = 50;
    height = 50;
    drawWidth = 120;
    drawHeight = 120;
    maxHealth = 110;
    health = 110;
    shield = 0;
    armor = 2;
    cost = 60;

    moveSpeedPxPerSecond = 52;

    attackRadius = 135;
    attackStrength = 11;
    attackCooldownMs = 1000 / 1.25;

    projectileSpeed = 5.5;
    projectileSize = 10;
    projectileDrawSize = 20;
    projectileRotationOffset = 0;

    attackFrameDurationMs = 70;
    attackReleaseFrame = 6;
    isAttacking = false;
    hasReleasedProjectile = false;
    currentAttackFrame = 0;
    lastAttackFrameAt = 0;

    walkFrameDurationMs = 90;
    isMoving = false;
    currentWalkFrame = 0;
    lastWalkFrameAt = 0;

    static idleImage = null;
    static idleImageLoaded = false;

    static attackImage = null;
    static attackImageLoaded = false;

    static walkImage = null;
    static walkImageLoaded = false;

    static projectileImage = null;
    static projectileImageLoaded = false;

    constructor(position, gameCanvas) {
        super(position, gameCanvas);
        Soldier.loadAssets();
    }

    static loadAssets() {
        if (!Soldier.idleImage) {
            Soldier.idleImage = new Image();
            Soldier.idleImage.onload = () => {
                Soldier.idleImageLoaded = true;
            };
            Soldier.idleImage.src = "/assets/Soldier/Soldier/Soldier-Idle.png";
        }

        if (!Soldier.attackImage) {
            Soldier.attackImage = new Image();
            Soldier.attackImage.onload = () => {
                Soldier.attackImageLoaded = true;
            };
            Soldier.attackImage.src = "/assets/Soldier/Soldier/Soldier-Attack01.png";
        }

        if (!Soldier.walkImage) {
            Soldier.walkImage = new Image();
            Soldier.walkImage.onload = () => {
                Soldier.walkImageLoaded = true;
            };
            Soldier.walkImage.src = "/assets/Soldier/Soldier/Soldier-Walk.png";
        }

        if (!Soldier.projectileImage) {
            Soldier.projectileImage = new Image();
            Soldier.projectileImage.onload = () => {
                Soldier.projectileImageLoaded = true;
            };
            Soldier.projectileImage.src = "/assets/Soldier/Arrow(projectile)/Arrow01(32x32).png";
        }
    }

    get attackFrameCount() {
        if (!Soldier.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Soldier.attackImage.width / Soldier.attackImage.height));
    }

    get walkFrameCount() {
        if (!Soldier.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Soldier.walkImage.width / Soldier.walkImage.height));
    }

    updateWalkAnimation() {
        if (!this.isMoving) {
            this.currentWalkFrame = 0;
            return;
        }

        const now = performance.now();
        if (now - this.lastWalkFrameAt < this.walkFrameDurationMs) return;

        this.lastWalkFrameAt = now;
        this.currentWalkFrame = (this.currentWalkFrame + 1) % this.walkFrameCount;
    }

    render() {
        if (Soldier.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && Soldier.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && Soldier.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? Soldier.attackImage
                : (usingWalkSheet ? Soldier.walkImage : Soldier.idleImage);
            const frameSize = spriteSheet.height;
            const frameIndex = usingAttackSheet
                ? Math.min(this.currentAttackFrame, this.attackFrameCount - 1)
                : (usingWalkSheet ? this.currentWalkFrame : 0);

            const sx = frameIndex * frameSize;
            const sy = 0;
            const sw = frameSize;
            const sh = frameSize;

            this.gameCanvas.drawImage(
                spriteSheet,
                sx,
                sy,
                sw,
                sh,
                this.position.x - (this.drawWidth - this.width) / 2,
                this.position.y - (this.drawHeight - this.height) / 2,
                this.drawWidth,
                this.drawHeight
            );

            this.drawHealthBar();

            return;
        }

        super.render();
    }

    spawnProjectileAtTarget(target) {
        const from = {
            x: this.centre.x - this.projectileSize / 2,
            y: this.centre.y - this.projectileSize / 2,
        };
        const to = target.centre;
        const angle = Math.atan2(to.y - this.centre.y, to.x - this.centre.x);

        this.projectiles.push({
            x: from.x,
            y: from.y,
            vx: Math.cos(angle) * this.projectileSpeed,
            vy: Math.sin(angle) * this.projectileSpeed,
            damage: this.attackStrength,
            target,
            ownerId: this.team || this.ownerId || null,
        });
    }

    attack() {
        if (!this.target || this.target.isDead) {
            this.isAttacking = false;
            this.hasReleasedProjectile = false;
            this.currentAttackFrame = 0;
            return;
        }

        const now = performance.now();

        if (!this.isAttacking) {
            if (now - this.lastAttackAt < this.attackCooldownMs) return;

            this.isAttacking = true;
            this.hasReleasedProjectile = false;
            this.currentAttackFrame = 0;
            this.lastAttackFrameAt = now;
            this.lastAttackAt = now;
            return;
        }

        if (now - this.lastAttackFrameAt < this.attackFrameDurationMs) return;

        this.lastAttackFrameAt = now;
        this.currentAttackFrame++;

        const releaseFrame = Math.min(this.attackReleaseFrame, this.attackFrameCount - 1);
        if (!this.hasReleasedProjectile && this.currentAttackFrame >= releaseFrame) {
            this.spawnProjectileAtTarget(this.target);
            this.hasReleasedProjectile = true;
        }

        if (this.currentAttackFrame >= this.attackFrameCount - 1) {
            this.isAttacking = false;
            this.hasReleasedProjectile = false;
            this.currentAttackFrame = 0;
        }
    }

    calculateAndUpdatePathMovement() {
        const beforeX = this.position.x;
        const beforeY = this.position.y;

        super.calculateAndUpdatePathMovement();

        const movedDistance = Math.hypot(this.position.x - beforeX, this.position.y - beforeY);
        this.isMoving = movedDistance > 0.001;
    }

    updateProjectiles() {
        this.projectiles = this.projectiles.filter((projectile) => {
            projectile.x += projectile.vx;
            projectile.y += projectile.vy;

            if (Soldier.projectileImageLoaded) {
                const centerX = projectile.x + this.projectileSize / 2;
                const centerY = projectile.y + this.projectileSize / 2;
                const angle = Math.atan2(projectile.vy, projectile.vx) + this.projectileRotationOffset;

                this.gameCanvas.save();
                this.gameCanvas.translate(centerX, centerY);
                this.gameCanvas.rotate(angle);
                this.gameCanvas.drawImage(
                    Soldier.projectileImage,
                    -this.projectileDrawSize / 2,
                    -this.projectileDrawSize / 2,
                    this.projectileDrawSize,
                    this.projectileDrawSize
                );
                this.gameCanvas.restore();
            } else {
                this.gameCanvas.fillStyle = '#ff2b2b';
                this.gameCanvas.fillRect(projectile.x, projectile.y, this.projectileSize, this.projectileSize);
            }

            const target = projectile.target;
            if (!target || target.isDead) return false;

            const projectileCenterX = projectile.x + this.projectileSize / 2;
            const projectileCenterY = projectile.y + this.projectileSize / 2;
            const dx = target.centre.x - projectileCenterX;
            const dy = target.centre.y - projectileCenterY;
            const distance = Math.hypot(dx, dy);

            if (distance <= this.projectileSize + 4) {
                target.takeDamage(projectile.damage, projectile.ownerId || this.team || this.ownerId || null);
                return false;
            }

            return true;
        });
    }
}
