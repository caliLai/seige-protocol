import { MeleeUnit } from "./MeleeUnit.js";

export class Soldier extends MeleeUnit {
    role = 'Versatile Melee';

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

    // Melee range: needs to be touching the target. The exact striking
    // distance is enforced inside MeleeUnit.isCloseEnoughToHit; this
    // attackRadius is just the engagement-trigger threshold.
    attackRadius = 82;
    attackStrength = 14;
    attackCooldownMs = 1000 / 1.2;

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
    }

    get attackFrameCount() {
        if (!Soldier.attackImageLoaded) return 1;
        return Math.max(1, Math.floor(Soldier.attackImage.width / Soldier.attackImage.height));
    }

    get walkFrameCount() {
        if (!Soldier.walkImageLoaded) return 1;
        return Math.max(1, Math.floor(Soldier.walkImage.width / Soldier.walkImage.height));
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
