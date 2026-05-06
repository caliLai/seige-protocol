class Sprite {
	position;
	width = 0;
	height = 0;

	constructor(position = {x:0, y:0}) {
		this.position = position;
	}

    // getters
	get centre() {
		return {
			x: this.position.x + (this.width / 2),
			y: this.position.y + (this.height / 2)
		}
	}
}