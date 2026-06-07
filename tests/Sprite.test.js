import { Sprite } from "../src/classes/Sprite";

test("calculates centre coordinates correctly", () => {
	const sprite = new Sprite({ x: 10, y: 20 });
	sprite.width = 30;
	sprite.height = 40;

	expect(sprite.centre).toEqual({ x: 25, y: 40 });
});

test("isDead returns false when health is positive", () => {
	const sprite = new Sprite({ x: 5, y: 5 });
	sprite.health = 1;

	expect(sprite.isDead).toBe(false);
});

describe("isDead returns true when health is zero or lower", () => {
	test("health is exactly zero", () => {
		const sprite = new Sprite({ x: 5, y: 5 });
		sprite.health = 0;
		expect(sprite.isDead).toBe(true);
	});

	test("health is negative", () => {
		const sprite = new Sprite({ x: 5, y: 5 });
		sprite.health = -10;
		expect(sprite.isDead).toBe(true);
	});
});
