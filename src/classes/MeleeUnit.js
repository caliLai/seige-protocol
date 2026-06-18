import { Unit } from "./Unit.js";

export class MeleeUnit extends Unit {
    isRecenteringToPath = false;

    set target(newTarget) {
        const hadTarget = !!this._target;
        const clearingTarget = hadTarget && !newTarget;

        if (clearingTarget && this.isAttacking) {
            this.syncPathIndexToNearestPathPoint();
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

    activePath() {
        return (this.pathRef && Array.isArray(this.pathRef) && this.pathRef.length)
            ? this.pathRef
            : [];
    }

    syncPathIndexToNearestPathPoint() {
        const activePath = this.activePath();
        if (!activePath.length) return;

        let closestIndex = this.pathIndex;
        let closestDistance = Infinity;

        activePath.forEach((point, index) => {
            if (index < this.pathIndex) return;

            const distance = Math.hypot(point.x - this.centre.x, point.y - this.centre.y);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });

        this.pathIndex = closestIndex;
    }

    moveCloserToTargetWhileAttacking() {
        if (!this.target || this.target.isDead) return;

        const dx = this.target.centre.x - this.centre.x;
        const dy = this.target.centre.y - this.centre.y;
        const distance = Math.hypot(dx, dy);

        const desiredDistance = this.meleeContactDistance();
        if (distance <= desiredDistance) return;

        const angle = Math.atan2(dy, dx);
        const frameStep = (this.moveSpeedPxPerSecond / 60) * 0.9;
        const maxStep = Math.max(0, distance - desiredDistance);
        const step = Math.min(frameStep, maxStep);

        this.position.x += Math.cos(angle) * step;
        this.position.y += Math.sin(angle) * step;
    }

    meleeContactDistance() {
        if (!this.target) return 0;
        return (this.width + this.target.width) / 2 + 8;
    }

    isCloseEnoughToHit() {
        if (!this.target || this.target.isDead) return false;

        const dx = this.target.centre.x - this.centre.x;
        const dy = this.target.centre.y - this.centre.y;
        return Math.hypot(dx, dy) <= this.meleeContactDistance() + 6;
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
        const activePath = this.activePath();
        const pathPoint = activePath[this.pathIndex];
        if (!pathPoint) return false;

        const laneOffset = (typeof this.laneOffset === 'number') ? this.laneOffset : 0;
        let dirX = 0;
        let dirY = 0;

        const nextPoint = activePath[this.pathIndex + 1];
        const prevPoint = activePath[this.pathIndex - 1];

        if (nextPoint) {
            dirX = nextPoint.x - pathPoint.x;
            dirY = nextPoint.y - pathPoint.y;
        } else if (prevPoint) {
            dirX = pathPoint.x - prevPoint.x;
            dirY = pathPoint.y - prevPoint.y;
        } else {
            dirX = 1;
            dirY = 0;
        }

        const len = Math.hypot(dirX, dirY) || 1;
        const targetX = pathPoint.x + (-dirY / len) * laneOffset;
        const targetY = pathPoint.y + (dirX / len) * laneOffset;

        const dx = targetX - this.centre.x;
        const dy = targetY - this.centre.y;
        const distance = Math.hypot(dx, dy);

        const stopDistance = 8;
        if (distance <= stopDistance) {
            if (this.pathIndex < activePath.length - 1) {
                this.pathIndex++;
                return true;
            }
            return false;
        }

        const angle = Math.atan2(dy, dx);
        const frameStep = Math.min(this.moveSpeedPxPerSecond / 60, distance);
        const step = Math.min(frameStep, distance);

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

        const releaseFrame = Math.min(this.attackReleaseFrame, this.attackFrameCount - 1);
        if (!this.hasAppliedHit && this.currentAttackFrame >= releaseFrame) {
            if (!this.target.isDead && this.isCloseEnoughToHit()) {
                this.target.takeDamage(this.attackStrength, this.team || this.ownerId || null, this.unitType);
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
