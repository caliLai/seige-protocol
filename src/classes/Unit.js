// todo: should different types of units inherit from this class?
// also we should probably make an interface. But also this is javascript
// so maybe it doesn't really matter
class Unit extends Sprite {
    width = 50;
    height = 50;
    pathIndex = 0;

    attackRadius = 100;
    attackStrength = 0.5;

    _target = null;

    constructor(position) {
        super(position);
    }

    set target(newTarget) {
        this._target = newTarget;
    }

    get target() {
        return this._target;
    }

    render() {
        gameCanvas.fillStyle = 'red';
        gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);
    }

    attack() {
        if (!this.target) return;

        this.target.takeDamage(this.attackStrength);
    }

    calculateAndUpdatePathMovement() {
        const pathPoint = path[this.pathIndex];

        if (!pathPoint) return;

        const dx = pathPoint.x - this.centre.x;
        const dy = pathPoint.y - this.centre.y;

        const distance = Math.hypot(dx, dy);

        if (distance < 2 && this.pathIndex < path.length - 1) {
            this.pathIndex++;
            return;
        }

        const angle = Math.atan2(dy, dx);

        this.position.x += Math.cos(angle);
        this.position.y += Math.sin(angle);
    }

    updateFrame() {
        this.render();

        if (this.target) {
            this.attack();
        } else {
            this.calculateAndUpdatePathMovement();
        }
    }
}