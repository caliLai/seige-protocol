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
        // DRAW TOWER
        gameCanvas.fillStyle = 'blue';
        gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);

        // DRAW HP BAR (above tower)
        this.drawHealthBar();
    }

    drawHealthBar() {
        const barWidth = this.width;
        const barHeight = 6;

        const x = this.position.x;
        const y = this.position.y - 10;

        // background (missing HP)
        gameCanvas.fillStyle = 'red';
        gameCanvas.fillRect(x, y, barWidth, barHeight);

        // current HP
        const healthPercent = this.health / this.maxHealth;

        if (healthPercent > 0.6) {
    	gameCanvas.fillStyle = 'limegreen';
		} else if (healthPercent > 0.3) {
    		gameCanvas.fillStyle = 'yellow';
		} else {
    	    gameCanvas.fillStyle = 'red';
		}
        gameCanvas.fillRect(
            x,
            y,
            barWidth * healthPercent,
            barHeight
        );

        // border (optional but nice)
        gameCanvas.strokeStyle = 'black';
        gameCanvas.strokeRect(x, y, barWidth, barHeight);
    }

    takeDamage(amount) {
        if (this.isDead) return;

        this.health -= amount;

        // clamp health
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