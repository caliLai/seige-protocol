const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

// ✅ restore original canvas size (fix movement issues)
gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

const towers = [];
let attackUnit = null;

const SHOW_PATH_MARKERS = false;

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

const removeDestroyedTowers = () => {
    let removed = 0;

    for (let i = towers.length - 1; i >= 0; i--) {
        if (!towers[i].isDead) continue;
        towers.splice(i, 1);
        removed++;
    }

    if (removed > 0) {
        towersDestroyedCount += removed;
        checkWinCondition();
    }
};

const findNearestLivingTowerInRange = (unit) => {
    if (!unit) return null;

    let nearestTower = null;
    let nearestDistance = Infinity;

    for (const tower of towers) {
        if (!tower || tower.isDead) continue;

        const dx = tower.centre.x - unit.centre.x;
        const dy = tower.centre.y - unit.centre.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= unit.attackRadius && distance < nearestDistance) {
            nearestDistance = distance;
            nearestTower = tower;
        }
    }

    return nearestTower;
};

// Just for debugging
const drawPathDebugOverlay = () => {
    if (!SHOW_PATH_MARKERS || !Array.isArray(path) || path.length === 0) return;

    gameCanvas.save();

    gameCanvas.beginPath();
    gameCanvas.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        gameCanvas.lineTo(path[i].x, path[i].y);
    }
    gameCanvas.strokeStyle = 'rgba(0, 170, 255, 0.6)';
    gameCanvas.lineWidth = 2;
    gameCanvas.stroke();

    gameCanvas.font = '11px monospace';
    gameCanvas.textAlign = 'left';
    gameCanvas.textBaseline = 'middle';

    for (let i = 0; i < path.length; i++) {
        const p = path[i];

        gameCanvas.beginPath();
        gameCanvas.arc(p.x, p.y, 3, 0, Math.PI * 2);
        gameCanvas.fillStyle = i === 0 ? 'rgba(46, 204, 113, 0.95)' : 'rgba(0, 170, 255, 0.95)';
        gameCanvas.fill();

        gameCanvas.fillStyle = 'rgba(18, 18, 18, 0.95)';
        gameCanvas.fillText(String(i), p.x + 6, p.y);
    }

    gameCanvas.restore();
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

    removeDestroyedTowers();

    if (attackUnit && !gameFinished) {
        attackUnit.target = findNearestLivingTowerInRange(attackUnit);
    }

    if (attackUnit) {
        attackUnit.updateFrame();
    }

    towers.forEach(tower => tower.updateFrame());
    drawPathDebugOverlay();
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
        case "skeleton-archer":
            attackUnit = new SkeletonArcher(pathStart);
            break;
        case "armored-axeman":
            attackUnit = new ArmoredAxeman(pathStart);
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
    drawPathDebugOverlay();
};
backgroundImage.src = "../assets/maps/calista-map.png";