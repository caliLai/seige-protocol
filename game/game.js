const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

// ✅ restore original canvas size (fix movement issues)
gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

const towers = [];
let attackUnit = null;

let playerGold = 0;
let animationId = null;
let gameFinished = false;
let towersDestroyedCount = 0;
let mapLoaded = false;

// GOLD SYSTEM → updates HTML instead of canvas
const addGold = (amount) => {
    playerGold += amount;

    const goldDisplay = document.getElementById("goldDisplay");
    if (goldDisplay) {
        goldDisplay.innerText = "Gold: " + playerGold;
    }
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

    if (!mapLoaded) return;

    // ✅ normal rendering — no offset now
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

    towers.forEach(tower => tower.updateFrame());
};

// START GAME (with switch preserved)
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

    // reset UI
    document.getElementById("goldDisplay").innerText = "Gold: 0";

    const pathStart = { x: path[0].x, y: path[0].y };

    // todo: create a factory somewhere else?
    switch (selectedUnitType) {
        case "archer":
            attackUnit = new Archer(pathStart);
            break;
        case "soldier":
            attackUnit = new Soldier(pathStart);
            break;
        case "knight":
            attackUnit = new Knight(pathStart);
            break;
        case "orc":
            attackUnit = new Orc(pathStart);
            break;
        case "swordsman":
            attackUnit = new Swordsman(pathStart);
            break;
        case "slime":
            attackUnit = new Slime(pathStart);
            break;
        case "skeleton":
            attackUnit = new Skeleton(pathStart);
            break;
        case "unit":
            attackUnit = new Unit(pathStart);
            break;
        default:
            throw new Error("Invalid unit type");
    }

    animate();
};

// NEXT WAVE
const nextWave = () => {
    location.reload();
};

// LOAD MAP
const backgroundImage = new Image();
backgroundImage.onload = () => {
    mapLoaded = true;
    initialiseTowers();

    // Draw the map and towers once on load so the scene is visible pre-start.
    gameCanvas.drawImage(backgroundImage, 0, 0);
    towers.forEach(tower => tower.updateFrame());
};
backgroundImage.src = "../assets/maps/calista-map.png";