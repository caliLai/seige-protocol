const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

// increase canvas height by 50px for UI bar
gameCanvasElement.width = 1120;
gameCanvasElement.height = 690;

const UI_HEIGHT = 50;

const towers = [];
let attackUnit = null;

let playerGold = 0;
let animationId = null;
let gameFinished = false;
let towersDestroyedCount = 0;

// GOLD SYSTEM
const addGold = (amount) => {
    playerGold += amount;
    drawUI();
};

// INIT TOWERS
const initialiseTowers = () => {
    towers.length = 0;
    for (let location of towerLocations) {
        towers.push(new Tower(location));
    }
};

// DRAW UI (top bar)
const drawUI = () => {
    gameCanvas.fillStyle = "black";
    gameCanvas.fillRect(0, 0, gameCanvasElement.width, UI_HEIGHT);

    gameCanvas.fillStyle = "white";
    gameCanvas.font = "20px Arial";
    gameCanvas.fillText("Gold: " + playerGold, 20, 30);

    gameCanvas.fillText("Siege Protocol", 450, 30);
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

    // draw map BELOW UI bar
    gameCanvas.drawImage(backgroundImage, 0, UI_HEIGHT);

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

// START GAME (with switch restored)
const startGame = () => {
    let selectedUnitType = document.querySelector('input[name="unitSelection"]:checked')?.value;

    if (!selectedUnitType) {
        alert("Select a unit first!");
        return;
    }

    playerGold = 0;
    towersDestroyedCount = 0;
    gameFinished = false;

    const pathStart = { x: path[0].x, y: path[0].y + UI_HEIGHT };

    // todo: create a factory somewhere else?
    switch (selectedUnitType) {
        case "unit":
            attackUnit = new Unit(pathStart);
            break;
        default:
            throw new Error("Invalid unit type");
    }

    drawUI();
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
    drawUI();
};
backgroundImage.src = "../assets/maps/calista-map.png";