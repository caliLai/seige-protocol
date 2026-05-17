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

    gameCanvas.clearRect(0, 0, gameCanvasElement.width, gameCanvasElement.height);
    gameCanvas.drawImage(backgroundImage, 0, 0);

    const tower = towers[0];

    if (tower && attackUnit && !gameFinished) {
        const dx = Math.abs(tower.centre.x - attackUnit.centre.x);
        const dy = Math.abs(tower.centre.y - attackUnit.centre.y);
        const distance = Math.hypot(dx, dy);

        if (tower.health > 0 && distance <= attackUnit.attackRadius) {
            attackUnit.target = tower;
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

    towers.forEach(tower => {
        if (!tower.isDead) {
            tower.findTarget(attackUnit);
            tower.attack();
            tower.updateProjectiles();
        }
    });

    towers.forEach(tower => {
        if (!tower.isDead) {
            tower.render();
        }
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

    switch (selectedUnitType) {
        case "archer":
            attackUnit = new Archer(pathStart);
            break;
        case "knight":
            attackUnit = new Knight(pathStart);
            break;
        case "unit":
            attackUnit = new Unit(pathStart);
            break;
        default:
            throw new Error("Invalid unit type");
    }

    animate();
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