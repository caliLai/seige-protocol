class Tower extends Sprite {
    width = 50;
    height = 50;

    maxHealth = 100;
    health = 100;

    reward = 80;
    isDead = false;

    constructor(position) {
        super(position);
    }

    render() {
        // Draw tower
        gameCanvas.fillStyle = "blue";
        gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);

        // Draw HP bar above tower
        this.drawHealthBar();
    }

    drawHealthBar() {
        const barWidth = this.width;
        const barHeight = 6;

        const x = this.position.x;
        const y = this.position.y - 10;

        // Background (missing HP)
        gameCanvas.fillStyle = "#3a3a3a";
        gameCanvas.fillRect(x, y, barWidth, barHeight);

        const healthPercent = this.health / this.maxHealth;

        // HP color based on percentage
        if (healthPercent > 0.6) {
            gameCanvas.fillStyle = "limegreen";
        } else if (healthPercent > 0.3) {
            gameCanvas.fillStyle = "yellow";
        } else {
            gameCanvas.fillStyle = "#ff3b30";
        }

        gameCanvas.fillRect(
            x,
            y,
            barWidth * healthPercent,
            barHeight
        );

        // Border
        gameCanvas.strokeStyle = "black";
        gameCanvas.strokeRect(x, y, barWidth, barHeight);
    }

    takeDamage(amount) {
        if (this.isDead) return;

        this.health -= amount;

        // Clamp health
        if (this.health < 0) {
            this.health = 0;
        }

        if (this.health === 0 && !this.isDead) {
            this.isDead = true;

            console.log("Tower destroyed! +" + this.reward + " gold");

            if (typeof addGold === "function") {
                addGold(this.reward);
            }
        }
    }

    updateFrame() {
        if (!this.isDead) {
            this.render();
        }
    }
}
