class Skeleton extends MeleeUnit {
    role = 'Swift Melee';

    width = 50;
    height = 50;
    drawWidth = 120;
    drawHeight = 120;

    maxHealth = 80;
    health = 80;
    shield = 0;
    armor = 0;
    cost = 50;

    moveSpeedPxPerSecond = 52;

    attackRadius = 82;
    attackStrength = 14;
    attackCooldownMs = 1000 / 1.25;

    attackFrameDurationMs = 70;
    attackReleaseFrame = 5;
    isAttacking = false;
    hasAppliedHit = false;
    currentAttackFrame = 0;
    lastAttackFrameAt = 0;

    walkFrameDurationMs = 90;
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
        Skeleton.loadAssets();
    }

    static loadAssets() {
        if (!Skeleton.idleImage) {
            Skeleton.idleImage = new Image();
            Skeleton.idleImage.onload = () => {
                Skeleton.idleImageLoaded = true;
            };
            Skeleton.idleImage.src = "/assets/Skeleton/Skeleton/Skeleton-Idle.png";
        }

        if (!Skeleton.attackImage) {
            Skeleton.attackImage = new Image();
            Skeleton.attackImage.onload = () => {
                Skeleton.attackImageLoaded = true;
            };
            Skeleton.attackImage.src = "/assets/Skeleton/Skeleton/Skeleton-Attack01.png";
        }

        if (!Skeleton.walkImage) {
            Skeleton.walkImage = new Image();
            Skeleton.walkImage.onload = () => {
                Skeleton.walkImageLoaded = true;
            };
            Skeleton.walkImage.src = "/assets/Skeleton/Skeleton/Skeleton-Walk.png";
        }
    }

    get attackFrameCount() {
        if (!Skeleton.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Skeleton.attackImage.width / Skeleton.attackImage.height));
    }

    get walkFrameCount() {
        if (!Skeleton.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Skeleton.walkImage.width / Skeleton.walkImage.height));
    }

    render() {
        if (Skeleton.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && Skeleton.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && Skeleton.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? Skeleton.attackImage
                : (usingWalkSheet ? Skeleton.walkImage : Skeleton.idleImage);

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

}
