import { Unit } from "./Unit.js";

export class SkeletonArcher extends Unit {
    role = 'Undead Marksman';

    width = 50;
    height = 50;
    drawWidth = 120;
    drawHeight = 120;
    maxHealth = 70;
    health = 70;
    shield = 0;
    armor = 0;
    cost = 100;

    moveSpeedPxPerSecond = 56;

    attackRadius = 170;
    attackStrength = 20;
    attackCooldownMs = 1000 / 1.25;

    projectileSpeed = 6;
    projectileSize = 10;
    projectileDrawSize = 20;
    projectileRotationOffset = 0;

    attackFrameDurationMs = 70;
    attackReleaseFrame = 5;
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

    static deathImage = null;
    static deathImageLoaded = false;

    static projectileImage = null;
    static projectileImageLoaded = false;

    constructor(position, gameCanvas) {
        super(position, gameCanvas);
        SkeletonArcher.loadAssets();
    }

    static loadAssets() {
        if (!SkeletonArcher.idleImage) {
            SkeletonArcher.idleImage = new Image();
            SkeletonArcher.idleImage.onload = () => {
                SkeletonArcher.idleImageLoaded = true;
            };
            SkeletonArcher.idleImage.src = "/assets/Skeleton Archer/Skeleton Archer/Skeleton Archer-Idle.png";
        }

        if (!SkeletonArcher.attackImage) {
            SkeletonArcher.attackImage = new Image();
            SkeletonArcher.attackImage.onload = () => {
                SkeletonArcher.attackImageLoaded = true;
            };
            SkeletonArcher.attackImage.src = "/assets/Skeleton Archer/Skeleton Archer/Skeleton Archer-Attack.png";
        }

        if (!SkeletonArcher.walkImage) {
            SkeletonArcher.walkImage = new Image();
            SkeletonArcher.walkImage.onload = () => {
                SkeletonArcher.walkImageLoaded = true;
            };
            SkeletonArcher.walkImage.src = "/assets/Skeleton Archer/Skeleton Archer/Skeleton Archer-Walk.png";
        }

        if (!SkeletonArcher.deathImage) {
            SkeletonArcher.deathImage = new Image();
            SkeletonArcher.deathImage.onload = () => { SkeletonArcher.deathImageLoaded = true; };
            SkeletonArcher.deathImage.src = "/assets/Skeleton Archer/Skeleton Archer/Skeleton Archer-Death.png";
        }

        if (!SkeletonArcher.projectileImage) {
            SkeletonArcher.projectileImage = new Image();
            SkeletonArcher.projectileImage.onload = () => {
                SkeletonArcher.projectileImageLoaded = true;
            };
            SkeletonArcher.projectileImage.src = "/assets/Skeleton Archer/Arrow(projectile)/Arrow03(32x32).png";
        }
    }

    get attackFrameCount() {
        if (!SkeletonArcher.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(SkeletonArcher.attackImage.width / SkeletonArcher.attackImage.height));
    }

    get walkFrameCount() {
        if (!SkeletonArcher.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(SkeletonArcher.walkImage.width / SkeletonArcher.walkImage.height));
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
        if (SkeletonArcher.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && SkeletonArcher.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && SkeletonArcher.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? SkeletonArcher.attackImage
                : (usingWalkSheet ? SkeletonArcher.walkImage : SkeletonArcher.idleImage);
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

            if (SkeletonArcher.projectileImageLoaded) {
                const centerX = projectile.x + this.projectileSize / 2;
                const centerY = projectile.y + this.projectileSize / 2;
                const angle = Math.atan2(projectile.vy, projectile.vx) + this.projectileRotationOffset;

                this.gameCanvas.save();
                this.gameCanvas.translate(centerX, centerY);
                this.gameCanvas.rotate(angle);
                this.gameCanvas.drawImage(
                    SkeletonArcher.projectileImage,
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
