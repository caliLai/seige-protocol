/** @jest-environment jsdom */
import { jest } from '@jest/globals';

const queryMock = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: null }),
  single: jest.fn().mockResolvedValue({ data: null }),
};
const mockSupabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'test-user' } } }),
  },
  from: jest.fn(() => queryMock),
  rpc: jest.fn().mockResolvedValue({ data: null }),
  channel: jest.fn(() => ({ on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() })),
};

const mockEnforceSingleSession = jest.fn();

jest.unstable_mockModule('/lib/supabase.js', () => ({ supabase: mockSupabase }));
jest.unstable_mockModule('/lib/single-session.js', () => ({ enforceSingleSession: mockEnforceSingleSession }));

const setupBattleDom = () => {
  document.body.innerHTML = '';

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

  const ids = [
    'selfName', 'otherName', 'selfGold', 'otherGold', 'selfPoints', 'otherPoints',
    'livesLabel', 'victoryOverlay', 'victoryLobbyBtn', 'statTowers', 'statLives',
    'statUnits', 'rewardPoints', 'defeatOverlay', 'defeatLobbyBtn', 'statTowersDefeat',
    'statLivesDefeat', 'statUnitsDefeat', 'rewardPointsDefeat', 'selfTypes', 'otherTypes',
    'selfTypesCount', 'otherTypesCount', 'selfQueue', 'otherQueue', 'selfQueueCount',
    'otherQueueCount', 'readyBtn', 'otherReady', 'bothReadyBanner', 'alertBanner',
    'otherReconnecting', 'otherStatus', 'settingsBtn', 'settingsMenu', 'abandonSiegeBtn',
    'abandonOverlay', 'abandonCancelBtn', 'abandonConfirmBtn', 'abandonConfirmText',
    'abandonConfirmLoading', 'waveTitle', 'waveTrack', 'towersRemainingLabel',
    'waveProgressLabel', 'waveProgressBar', 'unitInfo', 'speedBtn', 'rewardOverlay',
    'rewardCards', 'leaderboardBody', 'leaderboardWaveValue', 'waveSummaryOverlay',
    'waveSummaryTitle', 'waveSummaryGrid', 'waveNextBtn', 'towerInfo',
    'towerInfoHp',
  ];

  ids.forEach((id) => {
    const element = document.createElement('div');
    element.id = id;
    document.body.appendChild(element);
  });

  const otherPlayer = document.createElement('div');
  otherPlayer.className = 'game-player-other';
  document.body.appendChild(otherPlayer);
};

const importBattleModule = async () => {
  setupBattleDom();
  return import('/battle/battle.js');
};

describe('battle.js unit tests', () => {
  let battle;

  beforeAll(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    battle = await importBattleModule();
  });

  afterAll(() => {
    console.error.mockRestore();
  });

  test('exports battleEvents as an EventTarget', () => {
    expect(battle.battleEvents).toBeDefined();
    expect(typeof battle.battleEvents.addEventListener).toBe('function');
    expect(typeof battle.battleEvents.dispatchEvent).toBe('function');
  });

  test('battleEvents dispatches the correct custom event detail', () => {
    const listener = jest.fn();
    const detail = { towerIndex: 1, reward: 100 };

    battle.battleEvents.addEventListener('tower-destroyed', listener);
    battle.battleEvents.dispatchEvent(new CustomEvent('tower-destroyed', { detail }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual(detail);
  });

  test('escapeHtml sanitises dangerous characters', () => {
    expect(battle.escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(battle.escapeHtml("Tom & Jerry's > cheese")).toBe('Tom &amp; Jerry&#39;s &gt; cheese');
  });

  test('queueCost sums deploy costs for given unit ids', () => {
    expect(battle.queueCost(['Soldier', 'Archer'])).toBe(35);
  });

  test('showAlert displays a message then hides it after timeout', () => {
    jest.useFakeTimers();

    battle.showAlert('Test alert', 'error');
    const alertBanner = document.getElementById('alertBanner');

    expect(alertBanner.textContent).toBe('Test alert');
    expect(alertBanner.style.display).toBe('block');
    expect(alertBanner.style.background).toBe('rgb(123, 36, 28)');

    jest.advanceTimersByTime(2400);
    expect(alertBanner.style.display).toBe('none');

    jest.useRealTimers();
  });
});
