class Slime extends Unit {
    role = 'Melee Brawler';

    width = 48;
    height = 48;
    drawWidth = 112;
    drawHeight = 112;

    maxHealth = 90;
    health = 90;
    shield = 0;
    armor = 0;
    cost = 0;

    moveSpeedPxPerSecond = 46;

    attackRadius = 78;
    attackStrength = 12;
    attackCooldownMs = 1000 / 1.35;

    attackFrameDurationMs = 70;
    attackReleaseFrame = 4;
    isAttacking = false;
    hasAppliedHit = false;
    currentAttackFrame = 0;
    lastAttackFrameAt = 0;

    walkFrameDurationMs = 95;
    isMoving = false;
    currentWalkFrame = 0;
    lastWalkFrameAt = 0;
    facingDirection = 1;

    static idleImage = null;
    static idleImageLoaded = false;

    static attackImage = null;
    static attackImageLoaded = false;

    static walkImage = null;
    static walkImageLoaded = false;

    constructor(position) {
        super(position);
        Slime.loadAssets();
    }

    static loadAssets() {
        if (!Slime.idleImage) {
            Slime.idleImage = new Image();
            Slime.idleImage.onload = () => {
                Slime.idleImageLoaded = true;
            };
            Slime.idleImage.src = "/assets/Slime/Slime/Slime-Idle.png";
        }

        if (!Slime.attackImage) {
            Slime.attackImage = new Image();
            Slime.attackImage.onload = () => {
                Slime.attackImageLoaded = true;
            };
            Slime.attackImage.src = "/assets/Slime/Slime/Slime-Attack01.png";
        }

        if (!Slime.walkImage) {
            Slime.walkImage = new Image();
            Slime.walkImage.onload = () => {
                Slime.walkImageLoaded = true;
            };
            Slime.walkImage.src = "/assets/Slime/Slime/Slime-Walk.png";
        }
    }

    get attackFrameCount() {
        if (!Slime.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Slime.attackImage.width / Slime.attackImage.height));
    }

    get walkFrameCount() {
        if (!Slime.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Slime.walkImage.width / Slime.walkImage.height));
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
        if (Slime.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && Slime.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && Slime.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? Slime.attackImage
                : (usingWalkSheet ? Slime.walkImage : Slime.idleImage);

            const frameSize = spriteSheet.height;
            const frameIndex = usingAttackSheet
                ? Math.min(this.currentAttackFrame, this.attackFrameCount - 1)
                : (usingWalkSheet ? this.currentWalkFrame : 0);

            const sx = frameIndex * frameSize;
            const sy = 0;
            const sw = frameSize;
            const sh = frameSize;

            const drawX = this.position.x - (this.drawWidth - this.width) / 2;
            const drawY = this.position.y - (this.drawHeight - this.height) / 2;

            if (this.facingDirection >= 0) {
                gameCanvas.drawImage(
                    spriteSheet,
                    sx,
                    sy,
                    sw,
                    sh,
                    drawX,
                    drawY,
                    this.drawWidth,
                    this.drawHeight
                );
            } else {
                gameCanvas.save();
                gameCanvas.translate(drawX + this.drawWidth / 2, 0);
                gameCanvas.scale(-1, 1);
                gameCanvas.drawImage(
                    spriteSheet,
                    sx,
                    sy,
                    sw,
                    sh,
                    -this.drawWidth / 2,
                    drawY,
                    this.drawWidth,
                    this.drawHeight
                );
                gameCanvas.restore();
            }
            return;
        }

        super.render();
    }

    attack() {
        if (!this.target || this.target.isDead) {
            this.isAttacking = false;
            this.hasAppliedHit = false;
            this.currentAttackFrame = 0;
            return;
        }

        const targetDx = this.target.centre.x - this.centre.x;
        if (Math.abs(targetDx) > 0.001) {
            this.facingDirection = targetDx >= 0 ? 1 : -1;
        }

        const now = performance.now();

        if (!this.isAttacking) {
            if (now - this.lastAttackAt < this.attackCooldownMs) return;

            this.isAttacking = true;
            this.hasAppliedHit = false;
            this.currentAttackFrame = 0;
            this.lastAttackFrameAt = now;
            this.lastAttackAt = now;
            return;
        }

        if (now - this.lastAttackFrameAt < this.attackFrameDurationMs) return;

        this.lastAttackFrameAt = now;
        this.currentAttackFrame++;

        if (!this.hasAppliedHit && this.currentAttackFrame >= this.attackReleaseFrame) {
            if (!this.target.isDead) {
                this.target.takeDamage(this.attackStrength);
            }
            this.hasAppliedHit = true;
        }

        if (this.currentAttackFrame >= this.attackFrameCount - 1) {
            this.isAttacking = false;
            this.hasAppliedHit = false;
            this.currentAttackFrame = 0;
        }
    }

    calculateAndUpdatePathMovement() {
        const beforeX = this.position.x;
        const beforeY = this.position.y;

        super.calculateAndUpdatePathMovement();

        const deltaX = this.position.x - beforeX;
        if (Math.abs(deltaX) > 0.001) {
            this.facingDirection = deltaX >= 0 ? 1 : -1;
        }

        const movedDistance = Math.hypot(this.position.x - beforeX, this.position.y - beforeY);
        this.isMoving = movedDistance > 0.001;
    }
}
