import { Unit } from "./Unit.js";

export class Knight extends Unit {
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

    static idleImage = null;
    static idleImageLoaded = false;

    static attackImage = null;
    static attackImageLoaded = false;

    static walkImage = null;
    static walkImageLoaded = false;

    constructor(position, gameCanvas) {
        super(position, gameCanvas);
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

    attack() {
        if (!this.target || this.target.isDead) {
            this.isAttacking = false;
            this.hasAppliedHit = false;
            this.currentAttackFrame = 0;
            return;
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

        const movedDistance = Math.hypot(this.position.x - beforeX, this.position.y - beforeY);
        this.isMoving = movedDistance > 0.001;
    }

}