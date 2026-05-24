class Knight extends MeleeUnit {
    role = 'Frontline Bruiser';

    width = 52;
    height = 52;
    drawWidth = 128;
    drawHeight = 128;

    maxHealth = 140;
    health = 140;
    shield = 0;
    armor = 4;
    cost = 65;

    moveSpeedPxPerSecond = 48;

    attackRadius = 80;
    attackStrength = 18;
    attackCooldownMs = 1000 / 1.1;

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
        Knight.loadAssets();
    }

    static loadAssets() {
        if (!Knight.idleImage) {
            Knight.idleImage = new Image();
            Knight.idleImage.onload = () => {
                Knight.idleImageLoaded = true;
            };
            Knight.idleImage.src = "/assets/Knight/Knight/Knight-Idle.png";
        }

        if (!Knight.attackImage) {
            Knight.attackImage = new Image();
            Knight.attackImage.onload = () => {
                Knight.attackImageLoaded = true;
            };
            Knight.attackImage.src = "/assets/Knight/Knight/Knight-Attack01.png";
        }

        if (!Knight.walkImage) {
            Knight.walkImage = new Image();
            Knight.walkImage.onload = () => {
                Knight.walkImageLoaded = true;
            };
            Knight.walkImage.src = "/assets/Knight/Knight/Knight-Walk.png";
        }
    }

    get attackFrameCount() {
        if (!Knight.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Knight.attackImage.width / Knight.attackImage.height));
    }

    get walkFrameCount() {
        if (!Knight.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Knight.walkImage.width / Knight.walkImage.height));
    }

    render() {
        if (Knight.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && Knight.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && Knight.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? Knight.attackImage
                : (usingWalkSheet ? Knight.walkImage : Knight.idleImage);

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
