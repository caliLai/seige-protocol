// todo: should different types of units inherit from this class?
// also we should probably make an interface. But also this is javascript
// so maybe it doesn't really matter
class Unit {
	position;
	width = 50;
	height = 50;
	pathIndex = 0;
	attackRadius = 100;
	attackStrength = 0.4;
	target; // typeof Tower
	
	constructor(position = {x: 0, y:0}) {
		this.position = position;
	}

// getters
	get centre() {
		return {
			x: this.position.x + (this.width / 2),
			y: this.position.y + (this.height / 2)
		}
	}

// setters
	set target(target) {
		this.target = target;
	}

// methods

	render() {
		gameCanvas.fillStyle = 'red';
		gameCanvas.fillRect(this.position.x, this.position.y, this.width, this.height);
	}

	attack() {
		if(!this.target) return;
		this.target.health -= this.attackStrength;
		console.log(`attacking target, target health: ${this.target.health}`);
	}

	calculateAndUpdatePathMovement() {
		// calculate distance to next pathpoint
		const pathPoint = path[this.pathIndex];
		const distanceY = pathPoint.y - this.centre.y;
		const distanceX = pathPoint.x - this.centre.x;
		const angle = Math.atan2(distanceY, distanceX);

		// update position (for rendering)
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

	updateFrame() {
		this.render();

		if(this.target){
			this.attack();
		} else {
			this.calculateAndUpdatePathMovement();
		}

	}
}