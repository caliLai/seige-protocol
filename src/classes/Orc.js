import { MeleeUnit } from "./MeleeUnit.js";

export class Orc extends MeleeUnit {
    role = 'Bruiser';

    width = 54;
    height = 54;
    drawWidth = 132;
    drawHeight = 132;

    maxHealth = 130;
    health = 130;
    shield = 0;
    armor = 2;
    cost = 50;

    moveSpeedPxPerSecond = 44;

    attackRadius = 85;
    attackStrength = 22;
    attackCooldownMs = 1000 / 1.0;

    attackFrameDurationMs = 75;
    attackReleaseFrame = 5;
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

    constructor(position, gameCanvas) {
        super(position, gameCanvas);
        Orc.loadAssets();
    }

    static loadAssets() {
        if (!Orc.idleImage) {
            Orc.idleImage = new Image();
            Orc.idleImage.onload = () => {
                Orc.idleImageLoaded = true;
            };
            Orc.idleImage.src = "/assets/Orc/Orc/Orc-Idle.png";
        }

        if (!Orc.attackImage) {
            Orc.attackImage = new Image();
            Orc.attackImage.onload = () => {
                Orc.attackImageLoaded = true;
            };
            Orc.attackImage.src = "/assets/Orc/Orc/Orc-Attack01.png";
        }

        if (!Orc.walkImage) {
            Orc.walkImage = new Image();
            Orc.walkImage.onload = () => {
                Orc.walkImageLoaded = true;
            };
            Orc.walkImage.src = "/assets/Orc/Orc/Orc-Walk.png";
        }
    }

    get attackFrameCount() {
        if (!Orc.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Orc.attackImage.width / Orc.attackImage.height));
    }

    get walkFrameCount() {
        if (!Orc.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Orc.walkImage.width / Orc.walkImage.height));
    }

    render() {
        if (Orc.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && Orc.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && Orc.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? Orc.attackImage
                : (usingWalkSheet ? Orc.walkImage : Orc.idleImage);

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
                this.gameCanvas.drawImage(
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
                this.gameCanvas.save();
                this.gameCanvas.translate(drawX + this.drawWidth / 2, 0);
                this.gameCanvas.scale(-1, 1);
                this.gameCanvas.drawImage(
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
                this.gameCanvas.restore();
            }

            this.drawHealthBar();

            return;
        }

        super.render();
    }

}
