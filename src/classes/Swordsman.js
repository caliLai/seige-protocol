class Swordsman extends MeleeUnit {
    role = 'Balanced Melee';

    width = 52;
    height = 52;
    drawWidth = 128;
    drawHeight = 128;

    maxHealth = 110;
    health = 110;
    shield = 0;
    armor = 2;
    cost = 50;

    moveSpeedPxPerSecond = 50;

    attackRadius = 82;
    attackStrength = 20;
    attackCooldownMs = 1000 / 1.2;

    attackFrameDurationMs = 72;
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
        Swordsman.loadAssets();
    }

    static loadAssets() {
        if (!Swordsman.idleImage) {
            Swordsman.idleImage = new Image();
            Swordsman.idleImage.onload = () => {
                Swordsman.idleImageLoaded = true;
            };
            Swordsman.idleImage.src = "/assets/Swordsman/Swordsman/Swordsman-Idle.png";
        }

        if (!Swordsman.attackImage) {
            Swordsman.attackImage = new Image();
            Swordsman.attackImage.onload = () => {
                Swordsman.attackImageLoaded = true;
            };
            Swordsman.attackImage.src = "/assets/Swordsman/Swordsman/Swordsman-Attack01.png";
        }

        if (!Swordsman.walkImage) {
            Swordsman.walkImage = new Image();
            Swordsman.walkImage.onload = () => {
                Swordsman.walkImageLoaded = true;
            };
            Swordsman.walkImage.src = "/assets/Swordsman/Swordsman/Swordsman-Walk.png";
        }
    }

    get attackFrameCount() {
        if (!Swordsman.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Swordsman.attackImage.width / Swordsman.attackImage.height));
    }

    get walkFrameCount() {
        if (!Swordsman.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Swordsman.walkImage.width / Swordsman.walkImage.height));
    }

    render() {
        if (Swordsman.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && Swordsman.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && Swordsman.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? Swordsman.attackImage
                : (usingWalkSheet ? Swordsman.walkImage : Swordsman.idleImage);

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
