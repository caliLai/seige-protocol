import { supabase } from '/lib/supabase.js';
import { path } from '../src/data/path.js';
import { towerLocations } from '../src/data/towerLocations.js';
import { Archer } from '../src/classes/Archer.js';
import { Knight } from '../src/classes/Knight.js';
import { Tower } from '../src/classes/Tower.js';
import { Unit } from '../src/classes/Unit.js';

const gameCanvasElement = document.getElementById('gameCanvas');
const gameCanvas = gameCanvasElement.getContext('2d');

gameCanvasElement.width = 1120;
gameCanvasElement.height = 640;

let wave1Data = null;
try {
    wave1Data = JSON.parse(sessionStorage.getItem('wave1Siege') || 'null');
} catch {
    wave1Data = null;
}

const towers = [];
let attackUnits = [];
let playerGold = 0;
let animationId = null;
let gameFinished = false;
let towersDestroyedCount = 0;
let mapLoaded = false;

const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

const SIEGE_ID = (wave1Data && wave1Data.id) ? String(wave1Data.id) : sessionStorage.getItem('wave1SiegeId');
let posChannel = null;

const getPathStart = () => ({ x: path[0].x, y: path[0].y });

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
        towers.push(new Tower(location, gameCanvas));
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

const unitFactory = (unitType) => {
    const t = String(unitType || '').toLowerCase();
    const start = getPathStart();
    if (t === "archer") return new Archer(start, gameCanvas);
    if (t === "knight") return new Knight(start, gameCanvas);
    if (t === "unit") return new Unit(start, gameCanvas);
    return new Unit(start, gameCanvas);
};

const createUnitFromId = (unitId, position, laneOffset) => {
    const id = String(unitId || '').toLowerCase();

    let unit;
    if (id === "archer") unit = new Archer(position, gameCanvas);
    else if (id === "knight") unit = new Knight(position, gameCanvas);
    else unit = new Unit(position, gameCanvas);

    unit.laneOffset = (typeof laneOffset === "number") ? laneOffset : 0;
    unit.pathRef = path;

    return unit;
};

const pathStartDirection = () => {
    const p0 = path[0];
    const p1 = path[1] || path[0];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
};

const spawnWaveQueues = () => {
    if (!wave1Data) return;

    const hostQueue = wave1Data.host_wave1 || [];
    let allyQueue = wave1Data.ally_wave1 || [];

    if (!allyQueue.length) {
        allyQueue = [...hostQueue];
    }

    const spawnGap = 220;
    const spacing = 10;
    const dir = pathStartDirection();

    hostQueue.forEach((unitId, i) => {
        setTimeout(() => {
            const pos = { x: path[0].x, y: path[0].y };
            const unit = createUnitFromId(unitId, pos, -14);
            unit.team = "host";
            unit.position.x -= dir.x * (i * spacing);
            unit.position.y -= dir.y * (i * spacing);
            attackUnits.push(unit);
        }, i * spawnGap);
    });

    allyQueue.forEach((unitId, i) => {
        setTimeout(() => {
            const pos = { x: path[0].x, y: path[0].y };
            const unit = createUnitFromId(unitId, pos, 14);
            unit.team = "ally";
            unit.position.x -= dir.x * (i * spacing);
            unit.position.y -= dir.y * (i * spacing);
            attackUnits.push(unit);
        }, i * spawnGap);
    });
};

const handleUnitCreated = (msg) => {
    const payload = msg && msg.payload ? msg.payload : null;
    if (!payload) return;
    if (payload.clientId === user.id) return;
    attackUnits.push(unitFactory(payload.type));
};

const initRealtime = async () => {
    if (!SIEGE_ID) return;
    posChannel = supabase.channel(`game-${SIEGE_ID}`);
    posChannel.on('broadcast', { event: 'unit-created' }, (msg) => handleUnitCreated(msg)).subscribe();
};

const deployUnit = () => {
    if (!mapLoaded) {
        alert("Map is still loading. Try again in a moment.");
        return;
    }

    const selectedUnitType = document.querySelector('input[name="unitSelection"]:checked')?.value;
    if (!selectedUnitType) {
        alert("Select a unit first!");
        return;
    }

    const newUnit = unitFactory(selectedUnitType);
    attackUnits.push(newUnit);

    const unitId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (posChannel) {
        posChannel.send({
            type: 'broadcast',
            event: 'unit-created',
            payload: {
                unitId: unitId,
                clientId: user.id,
                type: String(selectedUnitType || '').toLowerCase()
            },
        });
    }
};

const animate = () => {
    animationId = requestAnimationFrame(animate);

    if (!mapLoaded) return;

    gameCanvas.drawImage(backgroundImage, 0, 0);

    for (let i = 0; i < attackUnits.length && towers.length && !gameFinished; i++) {
        const unit = attackUnits[i];
        const tower = towers[0];

        if (!unit || !tower) continue;

        const dx = tower.centre.x - unit.centre.x;
        const dy = tower.centre.y - unit.centre.y;
        const distance = Math.hypot(dx, dy);

        if (!tower.isDead && distance <= unit.attackRadius) {
            unit.target = tower;
        } else {
            if (tower.isDead) {
                towers.shift();
                towersDestroyedCount++;
                checkWinCondition();
            }
            unit.target = null;
        }
    }

    attackUnits = attackUnits.filter(u => !u.isDead);

    attackUnits.forEach(unit => {
        unit.updateFrame();
    });

    towers.forEach(tower => {
        const target = attackUnits.find(u => !u.isDead);
        tower.updateFrame(target);
    });
};

const autoStartGame = () => {
    if (!wave1Data) return;

    playerGold = 0;
    towersDestroyedCount = 0;
    gameFinished = false;
    attackUnits = [];

    spawnWaveQueues();
};

const startGame = () => {
    if (!mapLoaded) return;
    if (wave1Data) {
        autoStartGame();
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
    towers.forEach(t => t.render());

    if (wave1Data) {
        autoStartGame();
    }

    if (!animationId) {
        animate();
    }
};

const mapSrc = (wave1Data && wave1Data.map_src) ? wave1Data.map_src : "/assets/maps/calista-map.png";
backgroundImage.src = mapSrc;

await initRealtime();

window.deployUnit = deployUnit;
window.startGame = startGame;
window.nextWave = nextWave;