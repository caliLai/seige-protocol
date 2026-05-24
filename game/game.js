import { supabase } from '/lib/supabase.js';
import { path } from '../src/data/path.js';
import { towerLocations } from '../src/data/towerLocations.js';
import { Archer } from '../src/classes/Archer.js';
import { Soldier } from '../src/classes/Soldier.js';
import { Knight } from '../src/classes/Knight.js';
import { Orc } from '../src/classes/Orc.js';
import { Swordsman } from '../src/classes/Swordsman.js';
import { Slime } from '../src/classes/Slime.js';
import { Skeleton } from '../src/classes/Skeleton.js';
import { SkeletonArcher } from '../src/classes/SkeletonArcher.js';
import { ArmoredAxeman } from '../src/classes/ArmoredAxeman.js';
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

const SIEGE_ID = sessionStorage.getItem('wave1SiegeId');
let posChannel = null;

const { data: { user } } = await supabase.auth.getUser();
if (!user) window.location.href = '/login/login.html';

const getPathStart = () => ({ x: path[0].x, y: path[0].y });

const unitFactory = (unitType) => {
    switch (unitType) {
        case "archer":
            return new Archer(getPathStart(), gameCanvas);
        case "soldier":
            return new Soldier(getPathStart(), gameCanvas);
        case "knight":
            return new Knight(getPathStart(), gameCanvas);
        case "orc":
            return new Orc(getPathStart(), gameCanvas);
        case "swordsman":
            return new Swordsman(getPathStart(), gameCanvas);
        case "slime":
            return new Slime(getPathStart(), gameCanvas);
        case "skeleton":
            return new Skeleton(getPathStart(), gameCanvas);
        case "skeleton-archer":
            return new SkeletonArcher(getPathStart(), gameCanvas);
        case "armored-axeman":
            return new ArmoredAxeman(getPathStart(), gameCanvas);
        case "unit":
            return new Unit(getPathStart(), gameCanvas);
        default:
            throw new Error("Invalid unit type");
    }
}

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

const initRealtime = async () => {
    if (!SIEGE_ID) {
        alert("No siege ID found. Create or join a siege to play.");
        return;
    }
    posChannel = supabase.channel(`game-${SIEGE_ID}`);
    posChannel.on('broadcast', { event: 'unit-created' }, payload => handleUnitCreated(payload)).subscribe();
    //for the time being, i don't think its necessary to broadcast or listen for position updates of a unit
    //since everything is following the same path and speed
    //posChannel.on('broadcast', { event: 'unit-pos' }, payload => handleUnitPos(payload)).subscribe();

    // probably also not necessary but like. just in case ig.
    //posChannel.on('broadcast', { event: 'unit-removed' }, payload => handleUnitRemoved(payload)).subscribe();
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
    });

    towers.forEach(tower => {
        const target = attackUnits.find(unit => !unit.isDead);
        tower.updateFrame(target);
    });
};

const deployUnit = () => {
    if (!mapLoaded) {
        alert("Map is still loading. Try again in a moment.");
        return;
    }

    let selectedUnitType = document.querySelector('input[name="unitSelection"]:checked')?.value;

    if (!selectedUnitType) {
        alert("Select a unit first!");
        return;
    }
    let newUnit = unitFactory(selectedUnitType);

    attackUnits.push(newUnit);

    // broadcast the new unit to other clients
    let unitId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    if (posChannel) {
        posChannel.send({
            type: 'broadcast',
            event: 'unit-created',
            payload: {
                unitId: unitId,
                clientId: user.id,
                type: selectedUnitType
            },
        });
    }
};

const handleUnitCreated = (payload) => {
    if (!payload || payload.payload.clientId === user.id) return;
    console.log(payload)
    attackUnits.push(unitFactory(payload.payload.type));
};

// const handleUnitRemoved = (payload) => {
//   if (!payload) return;
//   remoteUnits.delete(payload.unitId);
// };

const nextWave = () => {
    location.reload();
};

const backgroundImage = new Image();
backgroundImage.onload = () => {
    mapLoaded = true;
    initialiseTowers();

    gameCanvas.drawImage(backgroundImage, 0, 0);
    towers.forEach(tower => tower.updateFrame());
};

backgroundImage.src = "../assets/maps/calista-map.png";

initRealtime();
window.deployUnit = deployUnit;
window.nextWave = nextWave;
animate();