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

const towers = [];
let attackUnits = [];

let playerGold = 0;
let animationId = null;
let gameFinished = false;
let towersDestroyedCount = 0;
let mapLoaded = false;

const SIEGE_ID = sessionStorage.getItem('gameSiegeId') || new URLSearchParams(location.search).get('siege');
const CLIENT_ID = 'c_' + Math.random().toString(36).slice(2, 9);
const remoteUnits = new Map();
let posChannel = null;
let lastPositionSentAt = 0;
const POSITION_THROTTLE_MS = 120;

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

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const renderRemoteUnits = () => {
    const now = Date.now();
    for (const [id, remote] of remoteUnits.entries()) {
        if (now - remote.lastSeen > 15000) {
            remoteUnits.delete(id);
            continue;
        }
        gameCanvas.beginPath();
        gameCanvas.fillStyle = 'crimson';
        gameCanvas.arc(remote.x, remote.y, 10, 0, Math.PI * 2);
        gameCanvas.fill();
        gameCanvas.fillStyle = 'white';
        gameCanvas.font = '10px sans-serif';
        gameCanvas.fillText(id.slice(-4), remote.x - 8, remote.y - 12);
    }
};

const sendPosition = (unit) => {
    if (!posChannel || !unit?._unitId) return;
    const now = performance.now();
    if (now - lastPositionSentAt < POSITION_THROTTLE_MS) return;
    lastPositionSentAt = now;
    posChannel.send({
        type: 'broadcast',
        event: 'unit-pos',
        payload: {
            clientId: CLIENT_ID,
            unitId: unit._unitId,
            x: clampNumber(unit.centre.x, 0, gameCanvasElement.width),
            y: clampNumber(unit.centre.y, 0, gameCanvasElement.height),
            ts: Date.now(),
        },
    });
};

const handleUnitCreated = (payload) => {
    if (!payload || payload.clientId === CLIENT_ID) return;
    if (remoteUnits.has(payload.unitId)) return;
    remoteUnits.set(payload.unitId, {
        unitId: payload.unitId,
        x: payload.x,
        y: payload.y,
        lastSeen: Date.now(),
    });
};

const handleUnitPos = (payload) => {
    if (!payload || payload.clientId === CLIENT_ID) return;
    const remote = remoteUnits.get(payload.unitId);
    if (!remote) return;
    remote.x = (remote.x + payload.x) / 2;
    remote.y = (remote.y + payload.y) / 2;
    remote.lastSeen = Date.now();
};

const handleUnitRemoved = (payload) => {
    if (!payload) return;
    remoteUnits.delete(payload.unitId);
};

const initRealtime = async () => {
    if (!SIEGE_ID) alert("No siege ID found. Create or join a siege to play.");
    posChannel = supabase.channel(`game-${SIEGE_ID}`);
    await posChannel.subscribe(async (status) => {
		if (status === 'SUBSCRIBED') {
			console.log("Subscribed to channel for siege", SIEGE_ID);
		}});
    posChannel.on('broadcast', { event: 'unit-created' }, payload => handleUnitCreated(payload));
    posChannel.on('broadcast', { event: 'unit-pos' }, payload => handleUnitPos(payload));
    posChannel.on('broadcast', { event: 'unit-removed' }, payload => handleUnitRemoved(payload));
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

    attackUnits.forEach(unit => {
        unit.updateFrame();
        sendPosition(unit);
    });
    
    towers.forEach(tower => {
        const target = attackUnits.find(unit => !unit.isDead);
        tower.updateFrame(target);
    });
    renderRemoteUnits();
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
            newUnit = new Archer(pathStart, gameCanvas);
            break;
        case "knight":
            newUnit = new Knight(pathStart, gameCanvas);
            break;
        case "unit":
            newUnit = new Unit(pathStart, gameCanvas);
            break;
        default:
            throw new Error("Invalid unit type");
    }

    newUnit._unitId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    attackUnits.push(newUnit);

    if (posChannel) {
        posChannel.send({
            type: 'broadcast',
            event: 'unit-created',
            payload: {
                clientId: CLIENT_ID,
                unitId: newUnit._unitId,
                type: selectedUnitType,
                x: newUnit.centre.x,
                y: newUnit.centre.y,
                ts: Date.now(),
            },
        });
    }

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

initRealtime();
window.startGame = startGame;
window.nextWave = nextWave;