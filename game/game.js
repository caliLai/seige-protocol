const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

const towers = [];
let attackUnit = null;

let playerGold = 0;
let animationId = null;
let gameFinished = false;
let towersDestroyedCount = 0;

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

// SHOW END SCREEN
const showEndScreen = () => {
    document.getElementById("goldEarned").innerText = "Gold Earned: " + playerGold;
    document.getElementById("towersDestroyed").innerText = "Towers Destroyed: " + towersDestroyedCount;
    document.getElementById("unitsLost").innerText = "Units Lost: 0";

    document.getElementById("endScreen").style.display = "flex";
};

// WIN CONDITION
const checkWinCondition = () => {
    if (towers.length === 0 && !gameFinished) {
        gameFinished = true;

        addGold(100);

        cancelAnimationFrame(animationId);

        showEndScreen();
    }
};

// MAIN LOOP
const animate = () => {
    animationId = requestAnimationFrame(animate);

    // background redraw clears previous frame
    gameCanvas.drawImage(backgroundImage, 0, 0);

    const tower = towers[0];

    if (tower && attackUnit && !gameFinished) {
        const dx = Math.abs(tower.centre.x - attackUnit.centre.x);
        const dy = Math.abs(tower.centre.y - attackUnit.centre.y);
        const distance = Math.hypot(dx, dy);

        if (tower.health > 0 && distance <= attackUnit.attackRadius) {
            attackUnit.target = tower;

            gameCanvas.beginPath();
            gameCanvas.moveTo(attackUnit.centre.x, attackUnit.centre.y);
            gameCanvas.lineTo(tower.centre.x, tower.centre.y);
            gameCanvas.stroke();
        } else {
            if (tower.health <= 0) {
                towers.shift();

                towersDestroyedCount++;
                addGold(80);

                checkWinCondition();
            }

            attackUnit.target = null;
        }
    }

    if (attackUnit) {
        attackUnit.updateFrame();
    }

    towers.forEach(tower => tower.updateFrame());
};

// START GAME
const startGame = () => {
    let selectedUnitType = document.querySelector('input[name="unitSelection"]:checked')?.value;

    if (!selectedUnitType) {
        alert("Select a unit first!");
        return;
    }

    playerGold = 0;
    towersDestroyedCount = 0;
    gameFinished = false;

    const pathStart = { x: path[0].x, y: path[0].y };

    attackUnit = new Unit(pathStart);

    animate();
};

// NEXT WAVE
const nextWave = () => {
    location.reload();
};

// LOAD MAP
const backgroundImage = new Image();
backgroundImage.onload = () => {
    initialiseTowers();
    gameCanvas.drawImage(backgroundImage, 0, 0);
};
backgroundImage.src = "../assets/maps/calista-map.png";