const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

const towers = [];
let attackUnits = [];

let playerGold = 0;
let animationId = null;
let gameFinished = false;
let towersDestroyedCount = 0;
let mapLoaded = false;

const addGold = (amount) => {
    playerGold += amount;

    const goldDisplay = document.getElementById("goldDisplay");
    if (goldDisplay) {
        goldDisplay.innerText = "Gold: " + playerGold;
    }
};

const initialiseTowers = () => {
    towers.length = 0;
    for (let location of towerLocations) {
        towers.push(new Tower(location));
    }
};

const showEndScreen = () => {
    document.getElementById("goldEarned").innerText = "Gold Earned: " + playerGold;
    document.getElementById("towersDestroyed").innerText = "Towers Destroyed: " + towersDestroyedCount;
    document.getElementById("unitsLost").innerText = "Units Lost: 0";

    document.getElementById("endScreen").style.display = "flex";
};

const checkWinCondition = () => {
    if (towers.length === 0 && !gameFinished) {
        gameFinished = true;

        addGold(100);

        cancelAnimationFrame(animationId);
        showEndScreen();
    }
};

const animate = () => {
    animationId = requestAnimationFrame(animate);

    if (!mapLoaded) return;

    gameCanvas.drawImage(backgroundImage, 0, 0);

    for (let i = 0; i < attackUnits.length && towers.length && !gameFinished; i++) {
        let attackUnit = attackUnits[i];
        let tower = towers[0];

        if (!attackUnit || !tower) continue;

        const dx = tower.centre.x - attackUnit.centre.x;
        const dy = tower.centre.y - attackUnit.centre.y;
        const distance = Math.hypot(dx, dy);

        if (!tower.isDead && distance <= attackUnit.attackRadius) {
            attackUnit.target = tower;
        } else {
            if (tower.isDead) {
                towers.shift();

                towersDestroyedCount++;
                addGold(80);

                checkWinCondition();
            }

            attackUnit.target = null;
        }
    }
    attackUnits = attackUnits.filter(unit => !unit.isDead);

    attackUnits.forEach(unit => unit.updateFrame());
    
    towers.forEach(tower => {
        const target = attackUnits.find(unit => !unit.isDead);
        tower.updateFrame(target);
    });
};

const startGame = () => {
    if (!mapLoaded) {
        alert("Map is still loading. Try again in a moment.");
        return;
    }

    let selectedUnitType = document.querySelector('input[name="unitSelection"]:checked')?.value;

    if (!selectedUnitType) {
        alert("Select a unit first!");
        return;
    }

    playerGold = 0;
    towersDestroyedCount = 0;
    gameFinished = false;

    document.getElementById("goldDisplay").innerText = "Gold: 0";

    const pathStart = { x: path[0].x, y: path[0].y };

    let newUnit;

    switch (selectedUnitType) {
        case "archer":
            newUnit = new Archer(pathStart);
            break;
        case "knight":
            newUnit = new Knight(pathStart);
            break;
        case "unit":
            newUnit = new Unit(pathStart);
            break;
        default:
            throw new Error("Invalid unit type");
    }

    attackUnits.push(newUnit);

    if (!animationId) {
        animate();
    }
};

const nextWave = () => {
    location.reload();
};

const backgroundImage = new Image();
backgroundImage.onload = () => {
    mapLoaded = true;
    initialiseTowers();

    gameCanvas.drawImage(backgroundImage, 0, 0);
    towers.forEach(tower => tower.render());
};

backgroundImage.src = "../assets/maps/calista-map.png";