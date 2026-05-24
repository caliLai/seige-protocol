import { path } from "../data/path.js";
import { Unit } from "./Unit.js";

export class MeleeUnit extends Unit {
    isRecenteringToPath = false;

    set target(newTarget) {
        const hadTarget = !!this._target;
        const clearingTarget = hadTarget && !newTarget;

        if (clearingTarget && this.isAttacking) {
            this.isRecenteringToPath = true;
        }

        super.target = newTarget;
    }

    get target() {
        return super.target;
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

    updateFacingDirectionToTarget() {
        if (typeof this.facingDirection !== 'number') return;
        if (!this.target || this.target.isDead) return;

        const targetDx = this.target.centre.x - this.centre.x;
        if (Math.abs(targetDx) > 0.001) {
            this.facingDirection = targetDx >= 0 ? 1 : -1;
        }
    }

    updateFacingDirectionFromMovement(deltaX) {
        if (typeof this.facingDirection !== 'number') return;

        if (Math.abs(deltaX) > 0.001) {
            this.facingDirection = deltaX >= 0 ? 1 : -1;
        }
    }

    moveCloserToTargetWhileAttacking() {
        if (!this.target || this.target.isDead) return;

        const dx = this.target.centre.x - this.centre.x;
        const dy = this.target.centre.y - this.centre.y;
        const distance = Math.hypot(dx, dy);

        const desiredDistance = (this.width + this.target.width) / 2 + 4;
        if (distance <= desiredDistance) return;

        const angle = Math.atan2(dy, dx);
        const frameStep = (this.moveSpeedPxPerSecond / 60) * 0.9;
        const maxStep = Math.max(0, distance - desiredDistance);
        const step = Math.min(frameStep, maxStep);

        this.position.x += Math.cos(angle) * step;
        this.position.y += Math.sin(angle) * step;
    }

    updateRecenteringState() {
        if (this.target) {
            this.isRecenteringToPath = false;
            return;
        }

        if (this.isAttacking) {
            this.isRecenteringToPath = true;
        }
    }

    moveTowardCurrentPathPoint() {
        const pathPoint = path[this.pathIndex];
        if (!pathPoint) return false;

        const dx = pathPoint.x - this.centre.x;
        const dy = pathPoint.y - this.centre.y;
        const distance = Math.hypot(dx, dy);

        const stopDistance = 6;
        if (distance <= stopDistance) return false;

        const angle = Math.atan2(dy, dx);
        const frameStep = this.moveSpeedPxPerSecond / 60;
        const step = Math.min(frameStep, distance - stopDistance);

        this.position.x += Math.cos(angle) * step;
        this.position.y += Math.sin(angle) * step;
        return true;
    }

    attack() {
        if (!this.target || this.target.isDead) {
            this.isAttacking = false;
            this.hasAppliedHit = false;
            this.currentAttackFrame = 0;
            return;
        }

        this.updateFacingDirectionToTarget();
        this.moveCloserToTargetWhileAttacking();

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

        this.updateRecenteringState();

        let movedByRecentering = false;
        if (this.isRecenteringToPath) {
            movedByRecentering = this.moveTowardCurrentPathPoint();
            if (!movedByRecentering) {
                this.isRecenteringToPath = false;
            }
        }

        if (!movedByRecentering) {
            super.calculateAndUpdatePathMovement();
        }

        const deltaX = this.position.x - beforeX;
        this.updateFacingDirectionFromMovement(deltaX);

        const movedDistance = Math.hypot(this.position.x - beforeX, this.position.y - beforeY);
        this.isMoving = movedDistance > 0.001;
    }
}