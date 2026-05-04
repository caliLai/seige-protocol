const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

gameCanvas.fillStyle = 'black';
gameCanvas.fillRect(100, 100,gameCanvasElement.width, gameCanvasElement.height);

const towers = [];
const attackUnit = new Unit({x: path[0].x, y: path[0].y});

const initaliseTowers = () => {
	for(let location of towerLocations) {
		towers.push(new Tower(location))
	};
}

const animate = () => {
	requestAnimationFrame(animate);
	
	// re-render the backgfloor first
	gameCanvas.drawImage(backgroundImage, 0, 0);

	// for now, assume units attack one tower at a time, in the order listed
	const tower = towers[0];
	
	//todo: update this to work with multiple towers to find nearest target. Need to take into
	// account of melee vs ranged units as melee are restricted to the path.

	//check to see if tower is in a unit's attack range
	if(tower) {
		const towerUnitDistanceX = Math.abs(tower.centre.x - attackUnit.centre.x);
		const towerUnitDistanceY = Math.abs(tower.centre.y - attackUnit.centre.y);
		const towerUnitDistance = Math.hypot(towerUnitDistanceX, towerUnitDistanceY);
		if(tower.health > 0 && towerUnitDistance <= attackUnit.attackRadius){
			attackUnit.target = tower;
			// temp, draw line to target;
			gameCanvas.beginPath();
			gameCanvas.moveTo(attackUnit.centre.x, attackUnit.centre.y);
			gameCanvas.lineTo(tower.centre.x, tower.centre.y);
			gameCanvas.stroke();
		} 
		else {
			if(tower.health <= 0) {
				towers.shift()
			}; // remove tower from list
			attackUnit.target = null;
		}
	}
	
	attackUnit.updateFrame();
	towers.forEach(tower => tower.updateFrame());
}
	
const backgroundImage = new Image();
backgroundImage.onload = () => {
	initaliseTowers();
	animate();
}
backgroundImage.src = "./img/calista-map.png";