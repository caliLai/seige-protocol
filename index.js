const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

gameCanvas.fillStyle = 'black';
gameCanvas.fillRect(100, 100,gameCanvasElement.width, gameCanvasElement.height);

const backgfloorImage = new Image();
backgfloorImage.onload = () => {
	animate();
}
backgfloorImage.src = "./calista-map.png";


const attackUnit = new Unit({x: path[0].x, y: path[0].y});

const animate = () => {
	requestAnimationFrame(animate);

	// re-render the backgfloor first
	gameCanvas.drawImage(backgfloorImage, 0, 0);

	attackUnit.updateFrame();
	
}