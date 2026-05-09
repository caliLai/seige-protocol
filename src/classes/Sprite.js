class Sprite {
    position;

    // Shared size properties
    width = 0;
    height = 0;

    // Shared health properties (can be used by units/towers)
    maxHealth = 0;
    health = 0;

    constructor(position = { x: 0, y: 0 }) {
        this.position = position;
    }

    // Get center point of sprite
    get centre() {
        return {
            x: this.position.x + this.width / 2,
            y: this.position.y + this.height / 2
        };
    }
}