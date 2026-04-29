class Tower {
	position;
	width = 50;
	height = 50;
	health = 100;

	constructor(position = {x:0, y:0}){
		this.position = position;
	}

// getters
	get centre() {
		return {
			x: this.position.x + (this.width / 2),
			y: this.position.y + (this.height / 2)
		}
	}
	
	render(){
		gameCanvas.fillStyle = 'blue';
		gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);
	}

	updateFrame() {
		if(this.health > 0) {
			this.render();
		}
	}
	
}