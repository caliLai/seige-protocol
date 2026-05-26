import { Unit } from "./Unit.js";

export class Archer extends Unit {
    role = 'Ranged Damage Dealer';

    width = 50;
    height = 50;
    drawWidth = 120;
    drawHeight = 120;
    maxHealth = 80;
    health = 80;
    shield = 0;
    armor = 0;
    cost = 55;

    moveSpeedPxPerSecond = 55;

    attackRadius = 160;
    attackStrength = 14;
    attackCooldownMs = 1000 / 1.4;

    projectileSpeed = 6;
    projectileSize = 10;
    projectileDrawSize = 22;
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

    static bodyImage = null;
    static bodyImageLoaded = false;

    static attackImage = null;
    static attackImageLoaded = false;

    static walkImage = null;
    static walkImageLoaded = false;

    static projectileImage = null;
    static projectileImageLoaded = false;

    constructor(position, gameCanvas) {
        super(position, gameCanvas);
        Archer.loadAssets();
    }

    static loadAssets() {
        if (!Archer.bodyImage) {
            Archer.bodyImage = new Image();
            Archer.bodyImage.onload = () => { Archer.bodyImageLoaded = true; };
            Archer.bodyImage.src = "../assets/Archer/Archer/Archer-Idle.png";
            Archer.bodyImage.onload = () => {
                Archer.bodyImageLoaded = true;
            };
            Archer.bodyImage.src = "/assets/Archer/Archer/Archer-Idle.png";
        }

        if (!Archer.attackImage) {
            Archer.attackImage = new Image();
            Archer.attackImage.onload = () => { Archer.attackImageLoaded = true; };
            Archer.attackImage.src = "../assets/Archer/Archer/Archer-Attack01.png";
            Archer.attackImage.onload = () => {
                Archer.attackImageLoaded = true;
            };
            Archer.attackImage.src = "/assets/Archer/Archer/Archer-Attack01.png";
        }

        if (!Archer.walkImage) {
            Archer.walkImage = new Image();
            Archer.walkImage.onload = () => { Archer.walkImageLoaded = true; };
            Archer.walkImage.src = "../assets/Archer/Archer/Archer-Walk.png";
            Archer.walkImage.onload = () => {
                Archer.walkImageLoaded = true;
            };
            Archer.walkImage.src = "/assets/Archer/Archer/Archer-Walk.png";
        }

        if (!Archer.projectileImage) {
            Archer.projectileImage = new Image();
            Archer.projectileImage.onload = () => { Archer.projectileImageLoaded = true; };
            Archer.projectileImage.src = "../assets/Archer/Arrow(projectile)/Arrow02(32x32).png";
            Archer.projectileImage.onload = () => {
                Archer.projectileImageLoaded = true;
            };
            Archer.projectileImage.src = "/assets/Archer/Arrow(projectile)/Arrow02(32x32).png";
        }
    }

    get attackFrameCount() {
        if (!Archer.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Archer.attackImage.width / Archer.attackImage.height));
    }

    get walkFrameCount() {
        if (!Archer.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Archer.walkImage.width / Archer.walkImage.height));
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
        if (Archer.bodyImageLoaded) {
            const usingAttackSheet = this.isAttacking && Archer.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && Archer.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? Archer.attackImage
                : (usingWalkSheet ? Archer.walkImage : Archer.bodyImage);

            const frameSize = spriteSheet.height;
            const frameIndex = usingAttackSheet
                ? Math.min(this.currentAttackFrame, this.attackFrameCount - 1)
                : (usingWalkSheet ? this.currentWalkFrame : 0);

            const sx = frameIndex * frameSize;

            this.gameCanvas.drawImage(
                spriteSheet,
                sx,
                0,
                frameSize,
                frameSize,
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

        const angle = Math.atan2(
            target.centre.y - this.centre.y,
            target.centre.x - this.centre.x
        );

        this.projectiles.push({
            x: from.x,
            y: from.y,
            vx: Math.cos(angle) * this.projectileSpeed,
            vy: Math.sin(angle) * this.projectileSpeed,
            damage: this.attackStrength,
            target: target,
            ownerId: this.ownerId
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

        if (!this.hasReleasedProjectile && this.currentAttackFrame >= this.attackReleaseFrame) {
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
        this.projectiles = this.projectiles.filter(projectile => {
            projectile.x += projectile.vx;
            projectile.y += projectile.vy;

            if (Archer.projectileImageLoaded) {
                const centerX = projectile.x + this.projectileSize / 2;
                const centerY = projectile.y + this.projectileSize / 2;
                const angle = Math.atan2(projectile.vy, projectile.vx) + this.projectileRotationOffset;

                this.gameCanvas.save();
                this.gameCanvas.translate(centerX, centerY);
                this.gameCanvas.rotate(angle);
                this.gameCanvas.drawImage(
                    Archer.projectileImage,
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

            const dx = target.centre.x - (projectile.x + this.projectileSize / 2);
            const dy = target.centre.y - (projectile.y + this.projectileSize / 2);

            if (Math.hypot(dx, dy) <= this.projectileSize + 4) {
                const attackerId = projectile.ownerId || this.ownerId || null;
                target.takeDamage(projectile.damage, attackerId);
                return false;
            }

            return true;
        });
    }
}