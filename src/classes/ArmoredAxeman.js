import { MeleeUnit } from "./MeleeUnit.js";

export class ArmoredAxeman extends MeleeUnit {
    role = 'Heavy Melee';

    width = 54;
    height = 54;
    drawWidth = 132;
    drawHeight = 132;

    maxHealth = 140;
    health = 140;
    shield = 0;
    armor = 4;
    cost = 100;

    moveSpeedPxPerSecond = 44;

    attackRadius = 86;
    attackStrength = 25;
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
        ArmoredAxeman.loadAssets();
    }

    static loadAssets() {
        if (!ArmoredAxeman.idleImage) {
            ArmoredAxeman.idleImage = new Image();
            ArmoredAxeman.idleImage.onload = () => {
                ArmoredAxeman.idleImageLoaded = true;
            };
            ArmoredAxeman.idleImage.src = "/assets/Armored Axeman/Armored Axeman/Armored Axeman-Idle.png";
        }

        if (!ArmoredAxeman.attackImage) {
            ArmoredAxeman.attackImage = new Image();
            ArmoredAxeman.attackImage.onload = () => {
                ArmoredAxeman.attackImageLoaded = true;
            };
            ArmoredAxeman.attackImage.src = "/assets/Armored Axeman/Armored Axeman/Armored Axeman-Attack01.png";
        }

        if (!ArmoredAxeman.walkImage) {
            ArmoredAxeman.walkImage = new Image();
            ArmoredAxeman.walkImage.onload = () => {
                ArmoredAxeman.walkImageLoaded = true;
            };
            ArmoredAxeman.walkImage.src = "/assets/Armored Axeman/Armored Axeman/Armored Axeman-Walk.png";
        }
    }

    get attackFrameCount() {
        if (!ArmoredAxeman.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(ArmoredAxeman.attackImage.width / ArmoredAxeman.attackImage.height));
    }

    get walkFrameCount() {
        if (!ArmoredAxeman.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(ArmoredAxeman.walkImage.width / ArmoredAxeman.walkImage.height));
    }

    render() {
        if (ArmoredAxeman.idleImageLoaded) {
            const usingAttackSheet = this.isAttacking && ArmoredAxeman.attackImageLoaded;
            const usingWalkSheet = !usingAttackSheet && this.isMoving && ArmoredAxeman.walkImageLoaded;

            if (usingWalkSheet) {
                this.updateWalkAnimation();
            } else {
                this.currentWalkFrame = 0;
            }

            const spriteSheet = usingAttackSheet
                ? ArmoredAxeman.attackImage
                : (usingWalkSheet ? ArmoredAxeman.walkImage : ArmoredAxeman.idleImage);

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
