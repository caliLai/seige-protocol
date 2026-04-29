const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

gameCanvas.fillStyle = 'black';
gameCanvas.fillRect(100, 100,gameCanvasElement.width, gameCanvasElement.height);

const backgroundImage = new Image();
backgroundImage.onload = () => {
	animate();
}
backgroundImage.src = "./img/calista-map.png";

const attackUnit = new Unit({x: path[0].x, y: path[0].y});
const tower = new Tower({x: 300, y: 230});

const animate = () => {
	requestAnimationFrame(animate);

	// re-render the backgfloor first
	gameCanvas.drawImage(backgroundImage, 0, 0);

	//todo: update this to work with multiple towers to find nearest target
	//check to see if tower is in a unit's attack range
	const towerUnitDistanceX = Math.abs(tower.centre.x - attackUnit.centre.x);
	const towerUnitDistanceY = Math.abs(tower.centre.y - attackUnit.centre.y);
	const towerUnitDistance = Math.hypot(towerUnitDistanceX, towerUnitDistanceY);
	if(towerUnitDistance <= attackUnit.attackRadius && tower.health > 0){
		attackUnit.target = tower;
		// temp, draw line to target;
		gameCanvas.beginPath();
		gameCanvas.moveTo(attackUnit.centre.x, attackUnit.centre.y);
		gameCanvas.lineTo(tower.centre.x, tower.centre.y);
		gameCanvas.stroke();
	} else {
		attackUnit.target = null;
	}

	attackUnit.updateFrame();
	tower.updateFrame();
	
}