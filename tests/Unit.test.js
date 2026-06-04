import { Unit } from "../src/classes/Unit";
4;
import { Tower } from "../src/classes/Tower";

test("takeDamage reduces health by the specified amount", () => {
  const unit = new Unit();
  unit.health = 100;

  unit.takeDamage(30);
  expect(unit.health).toBe(70);
});

describe("isDead calculates correctly", () => {
  test("returns false when health is positive", () => {
    const unit = new Unit();
    unit.health = 1;
    expect(unit.isDead).toBe(false);
  });

  test("returns true when health is zero", () => {
    const unit = new Unit();
    unit.health = 0;
    expect(unit.isDead).toBe(true);
  });

  test("returns true when health is negative", () => {
    const unit = new Unit();
    unit.health = -10;
    expect(unit.isDead).toBe(true);
  });
});

describe("attack", () => {
  // mock Image since we don't have access to the DOM
  Image = class {
    constructor() {
      this.onload = null;
    }

    set src(_) {
      this.onload();
    }
  };

  test("creates Projectile on attack", () => {
    const unit = new Unit();
    unit.target = new Tower();
    unit.projectiles = []; //ensure empty array
    unit.attack();
    expect(unit.projectiles.length).toBe(1);
  });

  test("updates lastAttackAt timestamp", async () => {
    const unit = new Unit();
    unit.target = new Tower();
    const beforeAttack = unit.lastAttackAt;
    await new Promise((resolve) => setTimeout(resolve, 10)); // ensure time has passed
    unit.attack();
    expect(unit.lastAttackAt).toBeGreaterThan(beforeAttack);
  });
});
