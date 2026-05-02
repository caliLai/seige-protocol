class Tower extends Sprite {
	width = 50;
	height = 50;
	health = 100;

	constructor(position){
		super(position);
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