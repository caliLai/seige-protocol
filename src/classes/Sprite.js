export class Sprite {
    position;
	gameCanvas;

    width = 0;
    height = 0;

    maxHealth = 0;
    health = 0;

    constructor(position = { x: 0, y: 0 }, gameCanvas) {
        this.position = position;
        this.gameCanvas = gameCanvas;
    }

    get centre() {
        return {
            x: this.position.x + this.width / 2,
            y: this.position.y + this.height / 2
        };
    }

    get isDead() {
        return this.health <= 0;
    }
}