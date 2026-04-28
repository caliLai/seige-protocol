// todo: should different types of units inherit from this class?
// also we should probably make an interface. But also this is javascript
// so maybe it doesn't really matter
class Unit {
	constructor(position = {x: 0, y:0}) {
		this.position = position;
		this.width = 50;
		this.height = 50;
		this.pathIndex = 0;
	}

	get centre() {
		return {
			x: this.position.x + (this.width / 2),
			y: this.position.y + (this.height / 2)
		}
	}

	render() {
		gameCanvas.fillStyle = 'red';
		gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);
	}

	updateFrame() {
		this.render();

		// calculate path
		const pathPoint = path[this.pathIndex];
		const distanceY = pathPoint.y - this.centre.y;
		const distanceX = pathPoint.x - this.centre.x;
		const angle = Math.atan2(distanceY, distanceX);

		this.position.x += Math.cos(angle);
		this.position.y += Math.sin(angle);
		
		// update index for current position in path
		if(Math.round(this.centre.x) === Math.round(pathPoint.x)
			&& Math.round(this.centre.y) === Math.round(pathPoint.y)
			&& this.pathIndex < path.length - 1
		) {
			this.pathIndex++;
		}
	}
}