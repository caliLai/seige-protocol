/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// Mock a minimal supabase client used by game.js
const channelMock = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis(), send: jest.fn() };
const queryMock = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
const mockSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
  from: jest.fn(() => queryMock),
  rpc: jest.fn().mockResolvedValue({}),
  channel: jest.fn(() => channelMock),
};

jest.unstable_mockModule('/lib/supabase.js', () => ({ supabase: mockSupabase }));

// Ensure Image onload runs immediately so backgroundImage.onload sets mapLoaded
const RealImage = global.Image;
beforeAll(() => {
  global.Image = class {
    constructor() {
      this.onload = null;
    }
    set src(_) {
      if (this.onload) this.onload();
    }
  };
});
afterAll(() => {
  global.Image = RealImage;
});

const setupGameDom = () => {
  document.body.innerHTML = '';
  // Ensure a siege id exists so initRealtime subscribes and posChannel is set
  sessionStorage.setItem('wave1SiegeId', '1');
  const canvas = document.createElement('canvas');
  canvas.id = 'gameCanvas';
  canvas.getContext = jest.fn(() => ({
    save: jest.fn(),
    restore: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    drawImage: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    setTransform: jest.fn(),
    globalAlpha: 1,
    fillStyle: '#000',
  }));
  document.body.appendChild(canvas);

  const goldDisplay = document.createElement('div');
  goldDisplay.id = 'goldDisplay';
  document.body.appendChild(goldDisplay);

  const goldEarned = document.createElement('div');
  goldEarned.id = 'goldEarned';
  const towersDestroyed = document.createElement('div');
  towersDestroyed.id = 'towersDestroyed';
  const unitsLost = document.createElement('div');
  unitsLost.id = 'unitsLost';
  const endScreen = document.createElement('div');
  endScreen.id = 'endScreen';
  document.body.appendChild(goldEarned);
  document.body.appendChild(towersDestroyed);
  document.body.appendChild(unitsLost);
  document.body.appendChild(endScreen);

  // a radio input for deployUnit
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'unitSelection';
  input.value = 'Archer';
  input.checked = true;
  form.appendChild(input);
  document.body.appendChild(form);
};

const importGameModule = async () => {
  setupGameDom();
  return import('/game/game.js');
};

describe('game.js tests', () => {
  let gameModule;

  beforeAll(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    gameModule = await importGameModule();
  });

  afterAll(() => {
    console.error.mockRestore();
  });

  test('window.addGold updates gold display', () => {
    const goldDisplay = document.getElementById('goldDisplay');
    // start clean
    goldDisplay.innerText = '';
    window.addGold(50);
    expect(goldDisplay.innerText).toBe('Gold: 50');

    window.addGold(25);
    expect(goldDisplay.innerText).toBe('Gold: 75');
  });

  test('awardTowerReward persists reward only for winning user', async () => {
    mockSupabase.rpc.mockClear();
    await window.awardTowerReward('not-the-user', 20);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();

    await window.awardTowerReward('test-user', 30);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_points', {
      user_id_input: 'test-user',
      amount_input: 30,
    });

    // verify gold display changed by addGold side-effect
    const goldDisplay = document.getElementById('goldDisplay');
    expect(goldDisplay.innerText).toContain('Gold:');
  });

  test('deployUnit broadcasts unit-created when map is loaded and a unit is selected', () => {
    channelMock.send.mockClear();
    // call deployUnit which should push and send
    window.deployUnit();
    expect(channelMock.send).toHaveBeenCalled();
    const sent = channelMock.send.mock.calls[0][0];
    expect(sent.type).toBe('broadcast');
    expect(sent.event).toBe('unit-created');
    expect(sent.payload).toBeDefined();
    expect(sent.payload.type).toBe('archer');
  });
});
