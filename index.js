const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

const towers = [];
let attackUnit = null;

let playerGold = 0;
let animationId = null;
let gameFinished = false;

// GOLD SYSTEM
const addGold = (amount) => {
    playerGold += amount;
};

// INIT TOWERS
const initialiseTowers = () => {
    towers.length = 0;

    for (let location of towerLocations) {
        towers.push(new Tower(location));
    }
};

// WIN CONDITION
const checkWinCondition = () => {
    if (towers.length === 0 && !gameFinished) {
        gameFinished = true;

        addGold(100); // bonus

        cancelAnimationFrame(animationId);
    }
};

// DRAW TOP UI BAR
const drawUI = () => {
    // top black bar
    gameCanvas.fillStyle = "black";
    gameCanvas.fillRect(0, 0, gameCanvasElement.width, 50);

    // gold text
    gameCanvas.fillStyle = "white";
    gameCanvas.font = "20px Arial";
    gameCanvas.fillText("Gold: " + playerGold, 20, 30);

    // game title
    gameCanvas.fillText("Siege Protocol", 400, 30);
};

// DRAW END SCREEN
const drawEndScreen = () => {
    if (!gameFinished) return;

    // dark overlay
    gameCanvas.fillStyle = "rgba(0,0,0,0.7)";
    gameCanvas.fillRect(0, 0, gameCanvasElement.width, gameCanvasElement.height);

    // panel
    gameCanvas.fillStyle = "white";
    gameCanvas.fillRect(300, 150, 500, 300);

    gameCanvas.fillStyle = "black";
    gameCanvas.font = "24px Arial";
    gameCanvas.fillText("Wave Complete!", 430, 200);

    gameCanvas.font = "18px Arial";
    gameCanvas.fillText("Gold Earned: " + playerGold, 400, 250);
    gameCanvas.fillText("Towers Destroyed: ✅", 400, 280);
    gameCanvas.fillText("Units Lost: 0", 400, 310);

    // button
    gameCanvas.fillStyle = "black";
    gameCanvas.fillRect(450, 360, 200, 50);

    gameCanvas.fillStyle = "white";
    gameCanvas.fillText("Next Wave", 480, 392);
};

// MAIN LOOP
const animate = () => {
    animationId = requestAnimationFrame(animate);

    gameCanvas.clearRect(0, 0, gameCanvasElement.width, gameCanvasElement.height);
    gameCanvas.drawImage(backgroundImage, 0, 0);

    if (attackUnit && !gameFinished) {
        const tower = towers[0];

        if (tower) {
            const dx = tower.centre.x - attackUnit.centre.x;
            const dy = tower.centre.y - attackUnit.centre.y;
            const distance = Math.hypot(dx, dy);

            if (!tower.isDead && distance <= attackUnit.attackRadius) {
                attackUnit.target = tower;

                gameCanvas.beginPath();
                gameCanvas.moveTo(attackUnit.centre.x, attackUnit.centre.y);
                gameCanvas.lineTo(tower.centre.x, tower.centre.y);
                gameCanvas.stroke();
            } else {
                if (tower.isDead) {
                    towers.shift();
                    checkWinCondition();
                }

                attackUnit.target = null;
            }
        }

        attackUnit.updateFrame();
    }

    towers.forEach(tower => tower.updateFrame());

    // UI ALWAYS ON TOP
    drawUI();

    // END SCREEN OVERLAY
    drawEndScreen();
};

// START GAME
const startGame = () => {
    let selectedUnitType = document.querySelector('input[name="unitSelection"]:checked')?.value;

    if (!selectedUnitType) {
        alert("Select a unit first!");
        return;
    }

    playerGold = 0;
    gameFinished = false;

    const pathStart = { x: path[0].x, y: path[0].y };

    attackUnit = new Unit(pathStart);

    animate();
};

// LOAD MAP
const backgroundImage = new Image();
backgroundImage.onload = () => {
    initialiseTowers();
    gameCanvas.drawImage(backgroundImage, 0, 0);
};
backgroundImage.src = "./img/calista-map.png";