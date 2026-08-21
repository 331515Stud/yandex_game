(function () {
  'use strict';

  // ======================= Canvas =======================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let CW = 0, CH = 0;

  function resize() {
    CW = window.innerWidth;
    CH = window.innerHeight;
    canvas.width = CW * DPR;
    canvas.height = CH * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (typeof refreshGradients === 'function') refreshGradients();
  }
  window.addEventListener('resize', resize);
  resize();

  // ======================= Helpers =======================
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const activeDmgMult = (p) => ((p.buff.power > 0) ? 1.5 : 1) * ((p.buff.dmg > 0) ? 2 : 1);

  const ARENA = { w: 3200, h: 3200 };
  const VIEW = 900;
  let visW = VIEW, visH = VIEW;

  function onScreen(x, y) {
    return x > G.cam.x - visW && x < G.cam.x + visW && y > G.cam.y - visH && y < G.cam.y + visH;
  }

  // ======================= Audio (tiny) =======================
  let AC = null;
  function audioInit() {
    if (AC) return;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  function beep(freq, dur, type, vol) {
    if (!AC) return;
    try {
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.04, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
      o.connect(g).connect(AC.destination);
      o.start();
      o.stop(AC.currentTime + dur);
    } catch (e) {}
  }
  const SFX = {
    shoot:  () => beep(700, 0.05, 'triangle', 0.012),
    hit:    () => beep(160, 0.06, 'sawtooth', 0.03),
    kill:   () => { beep(220, 0.12, 'square', 0.05); beep(140, 0.18, 'square', 0.04); },
    hurt:   () => { beep(110, 0.2, 'sawtooth', 0.06); },
    level:  () => { beep(440, 0.1, 'triangle', 0.05); setTimeout(() => beep(660, 0.1, 'triangle', 0.05), 80); setTimeout(() => beep(880, 0.16, 'triangle', 0.05), 160); },
    pickup: () => beep(500, 0.08, 'triangle', 0.05),
    boss:   () => { beep(90, 0.5, 'sawtooth', 0.08); setTimeout(() => beep(60, 0.6, 'sawtooth', 0.08), 200); }
  };

  // ======================= Input =======================
  const keys = {};
  const mouse = { x: 0, y: 0 };
  const touch = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };

  window.addEventListener('keydown', e => { keys[e.code] = true; audioInit(); });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  canvas.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  const isTouch = 'ontouchstart' in window;
  const joyEl = document.getElementById('joy');
  const joyKnob = document.getElementById('joy-knob');
  const btnFire = document.getElementById('btn-fire');

  // Mobile fire button handler
  if (isTouch && btnFire) {
    btnFire.addEventListener('touchstart', (e) => {
      e.preventDefault();
      audioInit();
      G.mobileFiring = true;
    }, { passive: false });
    
    btnFire.addEventListener('touchend', (e) => {
      e.preventDefault();
      G.mobileFiring = false;
    });
    
    btnFire.addEventListener('mousedown', () => {
      audioInit();
      G.mobileFiring = true;
    });
    
    btnFire.addEventListener('mouseup', () => {
      G.mobileFiring = false;
    });
    
    btnFire.addEventListener('mouseleave', () => {
      G.mobileFiring = false;
    });
  }

  function touchStart(e) {
    audioInit();
    const t = e.changedTouches[0];
    if (touch.active) return;
    touch.active = true;
    touch.id = t.identifier;
    touch.ox = t.clientX;
    touch.oy = t.clientY;
    touch.dx = 0;
    touch.dy = 0;
    joyEl.style.left = (t.clientX - 55) + 'px';
    joyEl.style.top = (t.clientY - 55) + 'px';
    joyEl.classList.remove('hidden');
    joyKnob.classList.remove('hidden');
    positionKnob();
  }
  function touchMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== touch.id) continue;
      touch.dx = t.clientX - touch.ox;
      touch.dy = t.clientY - touch.oy;
      const len = Math.hypot(touch.dx, touch.dy);
      const max = 50;
      if (len > max) {
        touch.dx = touch.dx / len * max;
        touch.dy = touch.dy / len * max;
      }
      positionKnob();
    }
  }
  function touchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier !== touch.id) continue;
      touch.active = false;
      touch.id = null;
      touch.dx = 0;
      touch.dy = 0;
      joyEl.classList.add('hidden');
      joyKnob.classList.add('hidden');
    }
  }
  function positionKnob() {
    joyKnob.style.left = (touch.ox + touch.dx - 24) + 'px';
    joyKnob.style.top = (touch.oy + touch.dy - 24) + 'px';
  }
  
  // Show/hide mobile controls based on device
  function updateMobileControls() {
    if (isTouch) {
      joyEl.classList.remove('hidden');
      joyKnob.classList.remove('hidden');
      if (btnFire) btnFire.classList.remove('hidden');
    } else {
      joyEl.classList.add('hidden');
      joyKnob.classList.add('hidden');
      if (btnFire) btnFire.classList.add('hidden');
    }
  }
  
  if (isTouch) {
    canvas.addEventListener('touchstart', touchStart, { passive: true });
    canvas.addEventListener('touchmove', touchMove, { passive: true });
    canvas.addEventListener('touchend', touchEnd);
    canvas.addEventListener('touchcancel', touchEnd);
    updateMobileControls();
  }

  // ======================= State =======================
  const G = {
    state: 'menu',
    paused: false,
    pauseOpen: false,
    levelUpPending: false,
    pendingLevels: 0,
    canRevive: true,
    lastInterstitial: 0,
    time: 0,
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: 18,
    player: null,
    bots: [],
    arrows: [],
    bombs: [],
    beams: [],
    boomerangs: [],
    gems: [],
    pickups: [],
    walls: [],
    puddles: [],
    minions: [],
    particles: [],
    texts: [],
    spawnTimer: 2,
    pickupTimer: 10,
    wave: 1,
    waveState: 'break',
    waveQueue: 0,
    breakTimer: 1,
    shake: 0,
    cam: { x: 0, y: 0 }
  };

  // ======================= Icons (SVG) =======================
  const ICONS = {
    sword: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 21l7-7m0 0L8 8l8-5 5 5-5 8-6-6z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M8 8l-3 3 2 2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/></svg>',
    speed: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 6l6 6-6 6M11 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 21S4 14 4 8.5A4.5 4.5 0 0111.5 5l.5.5.5-.5A4.5 4.5 0 0120 8.5C20 14 12 21 12 21z" fill="currentColor"/></svg>',
    multi: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 3v12M7 3L4 6m3-3l3 3M17 3v12m0 0l-3-3m3 3l3-3M12 19v3m0 0l-2-2m2 2l2-2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 12h12M11 7l5 5-5 5M20 5v14" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    magnet: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M6 3v6a6 6 0 0012 0V3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M2 3h7v5H2zM15 3h7v5h-7z" fill="currentColor"/></svg>',
    pierce: '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 19L17 6m0 0l-3-1 4 1 1 4-1-3z" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.3 9.4l6-.9L12 3z" fill="currentColor"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 12h4l2-5 4 10 2-5h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    droplet: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3s6 7 6 12a6 6 0 11-12 0c0-5 6-12 6-12z" fill="currentColor"/></svg>',
    bounce: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 14l7-7 4 4 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 2l3 4h-6l3-4z" fill="currentColor"/><path d="M3 22h0" stroke="currentColor" stroke-width="2"/></svg>',
    slash: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 20L14 10m0 0l-2-6 8 3-1 7-5-1z" fill="currentColor"/><path d="M14 10l6 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" fill="currentColor"/></svg>',
    shotgun: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 17l14-10M3 17l4-2m-4 2l4 3M17 7l4 2M17 7L21 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rapid: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M6 4v16M12 4v16M18 4v16M6 8h12M6 16h12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="3" cy="12" r="1.6" fill="currentColor"/><circle cx="21" cy="12" r="1.6" fill="currentColor"/></svg>',
    sniper: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 20L16 8M20 4l-8 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="18" cy="6" r="3" fill="currentColor"/></svg>',
    twin: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 3v14M8 3L5 6m3-3l3 3M16 3v14m0 0l-3-3m3 3l3-3M6 21h12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fire: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3s4 5 4 9a4 4 0 01-8 0c0-3 2-4 4-9z" fill="currentColor"/><path d="M12 12a3 3 0 00-1.5 5c-1.1-.5-1.6-1.5-1.5-2.6.9.3 1.6.2 2.2-.4l-.7-1 1.5-1z" fill="#0b0e14" opacity="0.55"/></svg>',
    ice: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3v18M12 12L4 8m8 4l8-4M12 12l-8 4m8-4l8 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    poison: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3s6 7 6 12a6 6 0 11-12 0c0-5 6-12 6-12z" fill="currentColor"/><path d="M9.5 15a2.5 2.5 0 005 0c0-1.4-2.5-3-2.5-3s-2.5 1.6-2.5 3z" fill="#0b0e14" opacity="0.4"/></svg>',
    web: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 4h16v16H4zM4 12h16M12 4v16M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
    laser: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 5h16M4 19h16M7 9h10M7 15h10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="21" cy="12" r="2" fill="currentColor"/></svg>',
    sideshot: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3v18M6 6l-4 6 4 6M18 6l4 6-4 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    backshot: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 12h14M13 7l5 5-5 5M19 5v14M23 12h2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  // ======================= Weapons =======================
  const WEAPONS = {
    bow:     { name: 'Лук',      icon: 'arrow',    color: '#f4f6ff', cd: 0.45, dmg: 1.00, speed: 560, burst: 1, spread: 0.00, pierce: 0 },
    shotgun: { name: 'Дробовик', icon: 'shotgun',  color: '#ffd23e', cd: 0.85, dmg: 0.70, speed: 520, burst: 6, spread: 0.30, pierce: 0 },
    rapid:   { name: 'Пулемёт',  icon: 'rapid',    color: '#38e08c', cd: 0.16, dmg: 0.55, speed: 520, burst: 1, spread: 0.05, pierce: 0 },
    sniper:  { name: 'Снайпер',  icon: 'sniper',   color: '#b18cff', cd: 1.10, dmg: 2.40, speed: 920, burst: 1, spread: 0.00, pierce: 2 },
    twin:    { name: 'Близнецы', icon: 'twin',     color: '#6ee7ff', cd: 0.50, dmg: 0.95, speed: 580, burst: 2, spread: 0.10, pierce: 0 },
    fan:     { name: 'Веер',     icon: 'multi',    color: '#7ce7a2', cd: 0.70, dmg: 0.45, speed: 500, burst: 8, spread: 0.32, pierce: 0 },
    laser:   { name: 'Лазер',    icon: 'laser',    color: '#ff3b6b', cd: 1.00, dmg: 9,    speed: 0,   burst: 1, spread: 0.00, pierce: 0, kind: 'laser', range: 600 },
    boomerang: { name: 'Бумеранг', icon: 'bounce', color: '#ffae42', cd: 0.90, dmg: 1.40, speed: 0, burst: 1, spread: 0.00, pierce: 0, kind: 'boomerang' },
    claws:   { name: 'Когти',    icon: 'slash',    color: '#38e08c', cd: 0.35, dmg: 2.00, speed: 0,   burst: 1, spread: 0.00, pierce: 0, kind: 'claws' },
    necro:   { name: 'Некромант', icon: 'slash',   color: '#9bd7ff', cd: 2.2, dmg: 0, speed: 0, burst: 1, spread: 0.00, pierce: 0, kind: 'necro' },
    bomb:    { name: 'Бомбомёт', icon: 'droplet',  color: '#ffae42', cd: 1.6, dmg: 0, speed: 420, burst: 1, spread: 0.00, pierce: 0 },
    spiral:  { name: 'Спираль',  icon: 'bolt',     color: '#ff6b9d', cd: 0.55, dmg: 0.85, speed: 480, burst: 1, spread: 0.00, pierce: 0, kind: 'spiral' },
    orbit:   { name: 'Орбита',   icon: 'shield',   color: '#a58cff', cd: 0.80, dmg: 1.10, speed: 0,   burst: 1, spread: 0.00, pierce: 0, kind: 'orbit' },
    wave:    { name: 'Волна',    icon: 'pulse',    color: '#57c8ff', cd: 1.20, dmg: 3.50, speed: 400, burst: 1, spread: 0.00, pierce: 1, kind: 'wave' }
  };

  // ======================= Upgrades =======================
  const ARROW_WEAPON_IDS = ['bow', 'shotgun', 'rapid', 'sniper', 'twin', 'fan', 'spiral', 'orbit', 'wave'];
  function isArrowWeapon(p) {
    return !!p && ARROW_WEAPON_IDS.indexOf(p.weapon) !== -1 && !p.bombMode;
  }
  const UPGRADES = [
    { id: 'dmg',   icon: 'sword',   color: '#ff7a3d', name: 'Урон',      desc: '+25% к урону стрел',        cond: p => !p.bombMode, fn: p => { p.dmg *= 1.25; } },
    { id: 'dmg2',  icon: 'sword',   color: '#ff5c2a', name: 'Урон II',   desc: '+30% к урону стрел',        cond: p => !p.bombMode && (p.build?.dmg || 0) >= 1, fn: p => { p.dmg *= 1.3; } },
    { id: 'dmg3',  icon: 'sword',   color: '#ff3d1a', name: 'Урон III',  desc: '+35% к урону стрел',        cond: p => !p.bombMode && (p.build?.dmg2 || 0) >= 1, fn: p => { p.dmg *= 1.35; } },
    { id: 'rate',  icon: 'bolt',    color: '#ffd23e', name: 'Огонь',      desc: '+20% скорострельности',     cond: () => true, fn: p => { p.rate *= 0.833; } },
    { id: 'rate2', icon: 'bolt',    color: '#ffb700', name: 'Огонь II',   desc: '+25% скорострельности',     cond: p => (p.build?.rate || 0) >= 1, fn: p => { p.rate *= 0.8; } },
    { id: 'rate3', icon: 'bolt',    color: '#ff9500', name: 'Огонь III',  desc: '+30% скорострельности',     cond: p => (p.build?.rate2 || 0) >= 1, fn: p => { p.rate *= 0.77; } },
    { id: 'speed', icon: 'speed',   color: '#6ee7ff', name: 'Скорость',   desc: '+10% к скорости бега',      cond: () => true, fn: p => { p.speed *= 1.1; } },
    { id: 'speed2',icon: 'speed',   color: '#4dd4ff', name: 'Скорость II',desc: '+12% к скорости бега',      cond: p => (p.build?.speed || 0) >= 1, fn: p => { p.speed *= 1.12; } },
    { id: 'hp',    icon: 'heart',   color: '#ff4d6d', name: 'Прочность',  desc: '+25 макс. HP и лечение',    cond: () => true, fn: p => { p.maxHp += 25; p.hp += 25; } },
    { id: 'hp2',   icon: 'heart',   color: '#ff2a55', name: 'Прочность II', desc: '+30 макс. HP и лечение',  cond: p => (p.build?.hp || 0) >= 1, fn: p => { p.maxHp += 30; p.hp += 30; } },
    { id: 'multi', icon: 'multi',   color: '#38e08c', name: 'Мультивыстрел x2', desc: '+1 снаряд спереди', cond: () => true, fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 1); } },
    { id: 'multi2',icon: 'multi',   color: '#2ecc71', name: 'Мультивыстрел x3', desc: '+1 снаряд спереди', cond: p => (p.build?.multi || 0) >= 1, fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 1); } },
    { id: 'multi3',icon: 'multi',   color: '#27ae60', name: 'Мультивыстрел x4', desc: '+1 снаряд спереди', cond: p => (p.build?.multi2 || 0) >= 1, fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 1); } },
    { id: 'multi4',icon: 'multi',   color: '#1e8449', name: 'Мультивыстрел x5', desc: '+2 снаряда спереди', cond: p => (p.build?.multi3 || 0) >= 1, fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 2); } },
    { id: 'aspeed',icon: 'arrow',   color: '#b18cff', name: 'Полёт',      desc: '+25% скорости снарядов',       cond: p => isArrowWeapon(p), fn: p => { p.arrowSpeed *= 1.25; } },
    { id: 'aspeed2',icon: 'arrow',  color: '#9b59b6', name: 'Полёт II',   desc: '+30% скорости снарядов',       cond: p => isArrowWeapon(p) && (p.build?.aspeed || 0) >= 1, fn: p => { p.arrowSpeed *= 1.3; } },
    { id: 'magnet',icon: 'magnet',  color: '#7ce7a2', name: 'Магнит',     desc: '+40% к притяжению',         cond: () => true, fn: p => { p.magnet *= 1.4; } },
    { id: 'magnet2',icon: 'magnet', color: '#58d68d', name: 'Магнит II',  desc: '+50% к притяжению',         cond: p => (p.build?.magnet || 0) >= 1, fn: p => { p.magnet *= 1.5; } },
    { id: 'pierce',icon: 'pierce',  color: '#ff9e6e', name: 'Пробой',     desc: '+1 к пробиванию',           cond: p => isArrowWeapon(p), fn: p => { p.pierce += 1; } },
    { id: 'pierce2',icon: 'pierce', color: '#ff8547', name: 'Пробой II',  desc: '+2 к пробиванию',           cond: p => isArrowWeapon(p) && (p.build?.pierce || 0) >= 1, fn: p => { p.pierce += 2; } },
    { id: 'crit',  icon: 'star',    color: '#ffd23e', name: 'Крит',       desc: '+10% шанс крита (x2)',      cond: p => !p.bombMode, fn: p => { p.critChance += 0.1; } },
    { id: 'crit2', icon: 'star',    color: '#ffc400', name: 'Крит II',    desc: '+12% шанс крита (x2.5)',    cond: p => !p.bombMode && (p.build?.crit || 0) >= 1, fn: p => { p.critChance += 0.12; p.critMult = (p.critMult || 2) + 0.5; } },
    { id: 'regen', icon: 'pulse',   color: '#a5ffd6', name: 'Реген',      desc: '+1.5 HP в секунду',         cond: () => true, fn: p => { p.regen += 1.5; } },
    { id: 'regen2',icon: 'pulse',   color: '#7fffd4', name: 'Реген II',   desc: '+2 HP в секунду',           cond: p => (p.build?.regen || 0) >= 1, fn: p => { p.regen += 2; } },
    { id: 'healUp', icon: 'heart', color: '#a5ffd6', name: 'Лечение', desc: '+25% ко всему исцелению', cond: p => (p.healingMult || 1) < 4, fn: p => { p.healingMult = (p.healingMult || 1) * 1.25; } },
    { id: 'vamp',  icon: 'droplet', color: '#ff5a8f', name: 'Вампиризм',  desc: '+10% вампиризма от урона',  cond: () => true, fn: p => { p.vampirism += 0.1; } },
    { id: 'vamp2', icon: 'droplet', color: '#ff3372', name: 'Вампиризм II', desc: '+12% вампиризма от урона', cond: p => (p.build?.vamp || 0) >= 1, fn: p => { p.vampirism += 0.12; } },
    { id: 'bounce',icon: 'bounce',  color: '#8ecbff', name: 'Рикошет',    desc: '+1 отскок снарядов от стен', cond: p => isArrowWeapon(p), fn: p => { p.ricochet += 1; } },
    { id: 'bounce2',icon: 'bounce', color: '#6bb5ff', name: 'Рикошет II', desc: '+2 отскока снарядов от стен', cond: p => isArrowWeapon(p) && (p.build?.bounce || 0) >= 1, fn: p => { p.ricochet += 2; } },
    { id: 'through', icon: 'pierce', color: '#c9b1ff', name: 'Пронзание', desc: 'Снаряды проходят сквозь стены', cond: p => isArrowWeapon(p) && !p.pierceWalls, fn: p => { p.pierceWalls = true; } },
    { id: 'bomb', icon: 'droplet', color: '#ffae42', name: 'Бомба', desc: '+15% радиус взрыва', cond: p => p.weapon === 'bomb', fn: p => { p.bombRadiusMult = (p.bombRadiusMult || 1) * 1.15; } },
    { id: 'bomb2', icon: 'droplet', color: '#ff9500', name: 'Бомба II', desc: '+20% радиус взрыва', cond: p => p.weapon === 'bomb' && (p.build?.bomb || 0) >= 1, fn: p => { p.bombRadiusMult = (p.bombRadiusMult || 1) * 1.2; } },
    { id: 'efire', icon: 'fire', color: '#ff7a3d', name: 'Стихия: Огонь', desc: 'Урон несёт огонь', cond: p => p.element !== 'fire', fn: p => { p.element = 'fire'; } },
    { id: 'efire2', icon: 'fire', color: '#ff5c2a', name: 'Стихия: Огонь II', desc: '+30% к огненному урону', cond: p => p.element === 'fire' && (p.build?.efire || 0) >= 1, fn: p => { p.fireDmgMult = (p.fireDmgMult || 1) * 1.3; } },
    { id: 'eice', icon: 'ice', color: '#57c8ff', name: 'Стихия: Лёд', desc: 'Урон несёт холод', cond: p => p.element !== 'ice', fn: p => { p.element = 'ice'; } },
    { id: 'eice2', icon: 'ice', color: '#3db5e8', name: 'Стихия: Лёд II', desc: '+40% длительность заморозки', cond: p => p.element === 'ice' && (p.build?.eice || 0) >= 1, fn: p => { p.iceDurationMult = (p.iceDurationMult || 1) * 1.4; } },
    { id: 'epoison', icon: 'poison', color: '#8bd450', name: 'Стихия: Яд', desc: 'Урон несёт яд', cond: p => p.element !== 'poison', fn: p => { p.element = 'poison'; } },
    { id: 'epoison2', icon: 'poison', color: '#6ebf35', name: 'Стихия: Яд II', desc: '+35% к урону от яда', cond: p => p.element === 'poison' && (p.build?.epoison || 0) >= 1, fn: p => { p.poisonDmgMult = (p.poisonDmgMult || 1) * 1.35; } },
    { id: 'enet', icon: 'web', color: '#c9b1ff', name: 'Стихия: Паутина', desc: 'Урон опутывает сетью', cond: p => p.element !== 'web', fn: p => { p.element = 'web'; } },
    { id: 'backshot', icon: 'backshot', color: '#8ecbff', name: 'Выстрел назад', desc: '+1 снаряд за спину', cond: p => p.backShots < 6, fn: p => { p.backShots++; } },
    { id: 'backshot2', icon: 'backshot', color: '#6bb5ff', name: 'Выстрел назад II', desc: '+2 снаряда за спину', cond: p => p.backShots >= 1 && (p.build?.backshot || 0) >= 1, fn: p => { p.backShots = Math.min(6, p.backShots + 2); } },
    { id: 'sideshot', icon: 'sideshot', color: '#6ee7ff', name: 'Выстрелы по бокам', desc: '+1 с каждой стороны', cond: p => p.sideShots < 5, fn: p => { p.sideShots++; } },
    { id: 'sideshot2', icon: 'sideshot', color: '#4dd4ff', name: 'Выстрелы по бокам II', desc: '+2 с каждой стороны', cond: p => p.sideShots >= 1 && (p.build?.sideshot || 0) >= 1, fn: p => { p.sideShots = Math.min(5, p.sideShots + 2); } },
    { id: 'melee', icon: 'slash',   color: '#ff7a3d', name: 'Ближний бой',desc: 'Авто-удар по ближним врагам', cond: p => !p.melee, fn: p => { p.melee = true; p.meleeDmg += 12; } },
    { id: 'melee2', icon: 'slash',  color: '#ff5c2a', name: 'Ближний бой II',desc: '+50% к урону ближнего боя', cond: p => p.melee && (p.build?.melee || 0) >= 1, fn: p => { p.meleeDmg *= 1.5; } },
    { id: 'shield',icon: 'shield',  color: '#6ee7ff', name: 'Щит',        desc: '+20 щита',                   cond: () => true, fn: p => { p.shield = Math.min(100, p.shield + 20); } },
    { id: 'shield2',icon: 'shield', color: '#4dd4ff', name: 'Щит II',     desc: '+30 щита',                   cond: p => (p.build?.shield || 0) >= 1, fn: p => { p.shield = Math.min(100, p.shield + 30); } },
    { id: 'w_necro', icon: 'slash', color: '#9bd7ff', name: 'Некромант', desc: 'Оружие: призыв миньонов', cond: p => p.weapon !== 'necro', fn: p => { p.bombMode = false; p.weapon = 'necro'; } },
    { id: 'w_fan', icon: 'multi', color: '#7ce7a2', name: 'Веер', desc: 'Оружие: широкий веер снарядов', cond: p => p.weapon !== 'fan', fn: p => { p.bombMode = false; p.weapon = 'fan'; } },
    { id: 'w_shotgun', icon: 'shotgun', color: '#ffd23e', name: 'Дробовик', desc: 'Оружие: 6 стрел веером', cond: p => p.weapon !== 'shotgun', fn: p => { p.bombMode = false; p.weapon = 'shotgun'; } },
    { id: 'w_rapid', icon: 'rapid', color: '#38e08c', name: 'Пулемёт', desc: 'Оружие: быстрая стрельба', cond: p => p.weapon !== 'rapid', fn: p => { p.bombMode = false; p.weapon = 'rapid'; } },
    { id: 'w_sniper', icon: 'sniper', color: '#b18cff', name: 'Снайпер', desc: 'Оружие: тяжёлый выстрел', cond: p => p.weapon !== 'sniper', fn: p => { p.bombMode = false; p.weapon = 'sniper'; } },
    { id: 'w_twin', icon: 'twin', color: '#6ee7ff', name: 'Близнецы', desc: 'Оружие: двойной выстрел', cond: p => p.weapon !== 'twin', fn: p => { p.bombMode = false; p.weapon = 'twin'; } },
    { id: 'w_laser', icon: 'laser', color: '#ff3b6b', name: 'Лазер', desc: 'Оружие: пронзающий луч', cond: p => p.weapon !== 'laser', fn: p => { p.bombMode = false; p.weapon = 'laser'; } },
    { id: 'w_boomerang', icon: 'bounce', color: '#ffae42', name: 'Бумеранг', desc: 'Оружие: бьёт туда-обратно', cond: p => p.weapon !== 'boomerang', fn: p => { p.bombMode = false; p.weapon = 'boomerang'; } },
    { id: 'w_claws', icon: 'slash', color: '#38e08c', name: 'Когти', desc: 'Оружие: быстрые удары', cond: p => p.weapon !== 'claws', fn: p => { p.bombMode = false; p.weapon = 'claws'; } },
    { id: 'w_bomb', icon: 'droplet', color: '#ffae42', name: 'Бомбомёт', desc: 'Оружие: бомбы-кружки', cond: p => p.weapon !== 'bomb', fn: p => enterBombMode(p) },
    { id: 'w_spiral', icon: 'bolt', color: '#ff6b9d', name: 'Спираль', desc: 'Оружие: спиральные снаряды', cond: p => p.weapon !== 'spiral', fn: p => { p.bombMode = false; p.weapon = 'spiral'; } },
    { id: 'w_orbit', icon: 'shield', color: '#a58cff', name: 'Орбита', desc: 'Оружие: вращающиеся снаряды', cond: p => p.weapon !== 'orbit', fn: p => { p.bombMode = false; p.weapon = 'orbit'; } },
    { id: 'w_wave', icon: 'pulse', color: '#57c8ff', name: 'Волна', desc: 'Оружие: волновой выстрел', cond: p => p.weapon !== 'wave', fn: p => { p.bombMode = false; p.weapon = 'wave'; } }
  ];

  function xpNextFor(level) {
    return Math.round(18 * Math.pow(level, 1.1));
  }

  // ======================= Build Vectors (Archetypes) =======================
// Distinct build archetypes that define playstyle directions.
// Players pick ONE vector per level up, creating unique builds.

const BUILD_VECTORS = {
  // VECTOR_NAME: { description, cond (check if available), fn (apply effect), icon, color }
  // Each vector modifies specific aspects of gameplay
  
  // --- Damage Vectors ---
  dmg: {
    name: 'Урон',
    cond: p => !p.bombMode,
    fn: p => { p.dmg *= 1.25; },
    icon: 'sword',
    color: '#ff7a3d'
  },
  dmg2: {
    name: 'Урон II',
    cond: p => !p.bombMode && (p.build?.dmg || 0) >= 1,
    fn: p => { p.dmg *= 1.3; },
    icon: 'sword',
    color: '#ff5c2a'
  },
  dmg3: {
    name: 'Урон III',
    cond: p => !p.bombMode && (p.build?.dmg2 || 0) >= 1,
    fn: p => { p.dmg *= 1.35; },
    icon: 'sword',
    color: '#ff3d1a'
  },
  crit: {
    name: 'Крит',
    cond: p => !p.bombMode,
    fn: p => { p.critChance += 0.1; },
    icon: 'star',
    color: '#ffd23e'
  },
  crit2: {
    name: 'Крит II',
    cond: p => !p.bombMode && (p.build?.crit || 0) >= 1,
    fn: p => { p.critChance += 0.12; p.critMult = (p.critMult || 2) + 0.5; },
    icon: 'star',
    color: '#ffc400'
  },
  rate: {
    name: 'Огонь',
    cond: () => true,
    fn: p => { p.rate *= 0.833; },
    icon: 'bolt',
    color: '#ffd23e'
  },
  rate2: {
    name: 'Огонь II',
    cond: p => (p.build?.rate || 0) >= 1,
    fn: p => { p.rate *= 0.8; },
    icon: 'bolt',
    color: '#ffb700'
  },
  rate3: {
    name: 'Огонь III',
    cond: p => (p.build?.rate2 || 0) >= 1,
    fn: p => { p.rate *= 0.77; },
    icon: 'bolt',
    color: '#ff9500'
  },
  
  // --- Weapon Vectors ---
  multi: {
    name: 'Мультивыстрел x2',
    cond: () => true,
    fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 1); },
    icon: 'multi',
    color: '#38e08c'
  },
  multi2: {
    name: 'Мультивыстрел x3',
    cond: p => (p.build?.multi || 0) >= 1,
    fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 1); },
    icon: 'multi',
    color: '#2ecc71'
  },
  multi3: {
    name: 'Мультивыстрел x4',
    cond: p => (p.build?.multi2 || 0) >= 1,
    fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 1); },
    icon: 'multi',
    color: '#27ae60'
  },
  multi4: {
    name: 'Мультивыстрел x5',
    cond: p => (p.build?.multi3 || 0) >= 1,
    fn: p => { p.frontAdd = Math.min(10, p.frontAdd + 2); },
    icon: 'multi',
    color: '#1e8449'
  },
  backshot: {
    name: 'Выстрел назад',
    cond: p => p.backShots < 6,
    fn: p => { p.backShots++; },
    icon: 'backshot',
    color: '#8ecbff'
  },
  backshot2: {
    name: 'Выстрел назад II',
    cond: p => p.backShots >= 1 && (p.build?.backshot || 0) >= 1,
    fn: p => { p.backShots = Math.min(6, p.backShots + 2); },
    icon: 'backshot',
    color: '#6bb5ff'
  },
  sideshot: {
    name: 'Выстрелы по бокам',
    cond: p => p.sideShots < 5,
    fn: p => { p.sideShots++; },
    icon: 'sideshot',
    color: '#6ee7ff'
  },
  sideshot2: {
    name: 'Выстрелы по бокам II',
    cond: p => p.sideShots >= 1 && (p.build?.sideshot || 0) >= 1,
    fn: p => { p.sideShots = Math.min(5, p.sideShots + 2); },
    icon: 'sideshot',
    color: '#4dd4ff'
  },
  aspeed: {
    name: 'Скорость снаряда',
    cond: p => isArrowWeapon(p),
    fn: p => { p.arrowSpeed *= 1.25; },
    icon: 'arrow',
    color: '#b18cff'
  },
  aspeed2: {
    name: 'Скорость снаряда II',
    cond: p => isArrowWeapon(p) && (p.build?.aspeed || 0) >= 1,
    fn: p => { p.arrowSpeed *= 1.3; },
    icon: 'arrow',
    color: '#9b59b6'
  },
  pierce: {
    name: 'Пробой',
    cond: p => isArrowWeapon(p),
    fn: p => { p.pierce += 1; },
    icon: 'pierce',
    color: '#ff9e6e'
  },
  pierce2: {
    name: 'Пробой II',
    cond: p => isArrowWeapon(p) && (p.build?.pierce || 0) >= 1,
    fn: p => { p.pierce += 2; },
    icon: 'pierce',
    color: '#ff8547'
  },
  bounce: {
    name: 'Рикошет',
    cond: p => isArrowWeapon(p),
    fn: p => { p.ricochet += 1; },
    icon: 'bounce',
    color: '#8ecbff'
  },
  bounce2: {
    name: 'Рикошет II',
    cond: p => isArrowWeapon(p) && (p.build?.bounce || 0) >= 1,
    fn: p => { p.ricochet += 2; },
    icon: 'bounce',
    color: '#6bb5ff'
  },
  through: {
    name: 'Пропускание стен',
    cond: p => isArrowWeapon(p) && !p.pierceWalls,
    fn: p => { p.pierceWalls = true; },
    icon: 'pierce',
    color: '#c9b1ff'
  },
  
  // --- Element Vectors ---
  efire: {
    name: 'Стихия: Огонь',
    cond: p => p.element !== 'fire',
    fn: p => { p.element = 'fire'; },
    icon: 'fire',
    color: '#ff7a3d'
  },
  efire2: {
    name: 'Стихия: Огонь II',
    cond: p => p.element === 'fire' && (p.build?.efire || 0) >= 1,
    fn: p => { p.fireDmgMult = (p.fireDmgMult || 1) * 1.3; },
    icon: 'fire',
    color: '#ff5c2a'
  },
  eice: {
    name: 'Стихия: Лёд',
    cond: p => p.element !== 'ice',
    fn: p => { p.element = 'ice'; },
    icon: 'ice',
    color: '#57c8ff'
  },
  eice2: {
    name: 'Стихия: Лёд II',
    cond: p => p.element === 'ice' && (p.build?.eice || 0) >= 1,
    fn: p => { p.iceDurationMult = (p.iceDurationMult || 1) * 1.4; },
    icon: 'ice',
    color: '#3db5e8'
  },
  epoison: {
    name: 'Стихия: Яд',
    cond: p => p.element !== 'poison',
    fn: p => { p.element = 'poison'; },
    icon: 'poison',
    color: '#8bd450'
  },
  epoison2: {
    name: 'Стихия: Яд II',
    cond: p => p.element === 'poison' && (p.build?.epoison || 0) >= 1,
    fn: p => { p.poisonDmgMult = (p.poisonDmgMult || 1) * 1.35; },
    icon: 'poison',
    color: '#6ebf35'
  },
  enet: {
    name: 'Стихия: Паутина',
    cond: p => p.element !== 'web',
    fn: p => { p.element = 'web'; },
    icon: 'web',
    color: '#c9b1ff'
  },
  
  // --- Utility Vectors ---
  hp: {
    name: 'Прочность',
    cond: () => true,
    fn: p => { p.maxHp += 25; p.hp += 25; },
    icon: 'heart',
    color: '#ff4d6d'
  },
  hp2: {
    name: 'Прочность II',
    cond: p => (p.build?.hp || 0) >= 1,
    fn: p => { p.maxHp += 30; p.hp += 30; },
    icon: 'heart',
    color: '#ff2a55'
  },
  speed: {
    name: 'Скорость',
    cond: () => true,
    fn: p => { p.speed *= 1.1; },
    icon: 'speed',
    color: '#6ee7ff'
  },
  speed2: {
    name: 'Скорость II',
    cond: p => (p.build?.speed || 0) >= 1,
    fn: p => { p.speed *= 1.12; },
    icon: 'speed',
    color: '#4dd4ff'
  },
  shield: {
    name: 'Щит',
    cond: () => true,
    fn: p => { p.shield = Math.min(100, p.shield + 20); },
    icon: 'shield',
    color: '#6ee7ff'
  },
  shield2: {
    name: 'Щит II',
    cond: p => (p.build?.shield || 0) >= 1,
    fn: p => { p.shield = Math.min(100, p.shield + 30); },
    icon: 'shield',
    color: '#4dd4ff'
  },
  magnet: {
    name: 'Магнит',
    cond: () => true,
    fn: p => { p.magnet *= 1.4; },
    icon: 'magnet',
    color: '#7ce7a2'
  },
  magnet2: {
    name: 'Магнит II',
    cond: p => (p.build?.magnet || 0) >= 1,
    fn: p => { p.magnet *= 1.5; },
    icon: 'magnet',
    color: '#58d68d'
  },
  regen: {
    name: 'Реген',
    cond: () => true,
    fn: p => { p.regen += 1.5; },
    icon: 'pulse',
    color: '#a5ffd6'
  },
  regen2: {
    name: 'Реген II',
    cond: p => (p.build?.regen || 0) >= 1,
    fn: p => { p.regen += 2; },
    icon: 'pulse',
    color: '#7fffd4'
  },
  vamp: {
    name: 'Вампиризм',
    cond: () => true,
    fn: p => { p.vampirism += 0.1; },
    icon: 'droplet',
    color: '#ff5a8f'
  },
  vamp2: {
    name: 'Вампиризм II',
    cond: p => (p.build?.vamp || 0) >= 1,
    fn: p => { p.vampirism += 0.12; },
    icon: 'droplet',
    color: '#ff3372'
  },
  healUp: {
    name: 'Лечение',
    cond: p => (p.healingMult || 1) < 4,
    fn: p => { p.healingMult = (p.healingMult || 1) * 1.25; },
    icon: 'heart',
    color: '#a5ffd6'
  },
  melee: {
    name: 'Ближний бой',
    cond: p => !p.melee,
    fn: p => { p.melee = true; p.meleeDmg += 12; },
    icon: 'slash',
    color: '#ff7a3d'
  },
  melee2: {
    name: 'Ближний бой II',
    cond: p => p.melee && (p.build?.melee || 0) >= 1,
    fn: p => { p.meleeDmg *= 1.5; },
    icon: 'slash',
    color: '#ff5c2a'
  },
  
  // --- Bomb Vectors ---
  bomb: {
    name: 'Бомба',
    cond: p => p.weapon === 'bomb',
    fn: p => { p.bombRadiusMult = (p.bombRadiusMult || 1) * 1.15; },
    icon: 'droplet',
    color: '#ffae42'
  },
  bomb2: {
    name: 'Бомба II',
    cond: p => p.weapon === 'bomb' && (p.build?.bomb || 0) >= 1,
    fn: p => { p.bombRadiusMult = (p.bombRadiusMult || 1) * 1.2; },
    icon: 'droplet',
    color: '#ff9500'
  },
  
  // --- Weapon Type Vectors ---
  w_necro: {
    name: 'Некромант',
    cond: p => p.weapon !== 'necro',
    fn: p => { p.bombMode = false; p.weapon = 'necro'; },
    icon: 'slash',
    color: '#9bd7ff'
  },
  w_fan: {
    name: 'Веер',
    cond: p => p.weapon !== 'fan',
    fn: p => { p.bombMode = false; p.weapon = 'fan'; },
    icon: 'multi',
    color: '#7ce7a2'
  },
  w_shotgun: {
    name: 'Дробовик',
    cond: p => p.weapon !== 'shotgun',
    fn: p => { p.bombMode = false; p.weapon = 'shotgun'; },
    icon: 'shotgun',
    color: '#ffd23e'
  },
  w_rapid: {
    name: 'Пулемёт',
    cond: p => p.weapon !== 'rapid',
    fn: p => { p.bombMode = false; p.weapon = 'rapid'; },
    icon: 'rapid',
    color: '#38e08c'
  },
  w_sniper: {
    name: 'Снайпер',
    cond: p => p.weapon !== 'sniper',
    fn: p => { p.bombMode = false; p.weapon = 'sniper'; },
    icon: 'sniper',
    color: '#b18cff'
  },
  w_twin: {
    name: 'Близнецы',
    cond: p => p.weapon !== 'twin',
    fn: p => { p.bombMode = false; p.weapon = 'twin'; },
    icon: 'twin',
    color: '#6ee7ff'
  },
  w_laser: {
    name: 'Лазер',
    cond: p => p.weapon !== 'laser',
    fn: p => { p.bombMode = false; p.weapon = 'laser'; },
    icon: 'laser',
    color: '#ff3b6b'
  },
  w_boomerang: {
    name: 'Бумеранг',
    cond: p => p.weapon !== 'boomerang',
    fn: p => { p.bombMode = false; p.weapon = 'boomerang'; },
    icon: 'bounce',
    color: '#ffae42'
  },
  w_claws: {
    name: 'Когти',
    cond: p => p.weapon !== 'claws',
    fn: p => { p.bombMode = false; p.weapon = 'claws'; },
    icon: 'slash',
    color: '#38e08c'
  },
  w_bomb: {
    name: 'Бомбомёт',
    cond: p => p.weapon !== 'bomb',
    fn: p => enterBombMode(p),
    icon: 'droplet',
    color: '#ffae42'
  },
  w_spiral: {
    name: 'Спираль',
    cond: p => p.weapon !== 'spiral',
    fn: p => { p.bombMode = false; p.weapon = 'spiral'; },
    icon: 'bolt',
    color: '#ff6b9d'
  },
  w_orbit: {
    name: 'Орбита',
    cond: p => p.weapon !== 'orbit',
    fn: p => { p.bombMode = false; p.weapon = 'orbit'; },
    icon: 'shield',
    color: '#a58cff'
  },
  w_wave: {
    name: 'Волна',
    cond: p => p.weapon !== 'wave',
    fn: p => { p.bombMode = false; p.weapon = 'wave'; },
    icon: 'pulse',
    color: '#57c8ff'
  }
};

  // Available vectors per category (for filtering)
  // VECTOR_CATEGORIES removed - unused

// All available vectors
const AVAILABLE_VECTORS = [
  'dmg', 'crit', 'rate', 'multi', 'backshot', 'sideshot', 'aspeed', 'pierce', 'bounce', 'through',
  'efire', 'eice', 'epoison', 'enet', 'hp', 'speed', 'shield', 'magnet', 'regen', 'vamp', 'healUp', 'melee',
  'bomb'
];

  function rollUpgrades() {
    const pool = UPGRADES.filter(u => u.cond(G.player));
    // перемешиваем
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randi(0, i);
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    // стараемся взять по одной карточке из разных путей (категорий)
    const used = {};
    const picks = [];
    for (const u of pool) {
      if (picks.length >= 3) break;
      const c = CAT_OF[u.id] || 'body';
      if (!used[c]) { used[c] = true; picks.push(u); }
    }
    // добираем оставшиеся
    for (const u of pool) {
      if (picks.length >= 3) break;
      if (picks.indexOf(u) === -1 && u.cond(G.player)) picks.push(u);
    }
    return picks;
  }

  // ======================= Pickups (floor) =======================
  const PU_TYPES = {
    power:  { letter: 'P', color: '#ff7a3d', dur: 8,  name: 'Сила' },
    haste:  { letter: 'H', color: '#ffd23e', dur: 8,  name: 'Скорострельность' },
    swift:  { letter: 'U', color: '#6ee7ff', dur: 8,  name: 'Скорость' },
    magnet: { letter: 'M', color: '#7ce7a2', dur: 8,  name: 'Магнит' },
    multi:  { letter: 'X', color: '#38e08c', dur: 6,  name: 'Мультивыстрел' },
    vamp:   { letter: 'V', color: '#ff5a8f', dur: 8,  name: 'Вампиризм' },
    shield: { letter: 'S', color: '#6ee7ff', dur: 0,  name: 'Щит' },
    heal:   { letter: '+', color: '#a5ffd6', dur: 0,  name: 'Лечение' },
    bomb:   { letter: 'B', color: '#ffae42', dur: 0,  name: 'Бомба' },
    bombFreeze: { letter: 'L', color: '#57c8ff', dur: 0, name: 'Ледяная бомба' },
    bombFire:   { letter: 'F', color: '#ff7a3d', dur: 0, name: 'Зажигательная бомба' },
    bombPoison: { letter: 'Y', color: '#8bd450', dur: 0, name: 'Ядовитая бомба' },
    net:    { letter: 'N', color: '#c9b1ff', dur: 0,  name: 'Сеть' }
  };
  const PU_BARREL = ['power', 'haste', 'swift', 'magnet', 'heal',
    'bomb', 'bombFreeze', 'bombFire', 'bombPoison', 'net'];

  function freeSpot() {
    for (let i = 0; i < 30; i++) {
      const x = rand(80, ARENA.w - 80);
      const y = rand(80, ARENA.h - 80);
      if (Math.hypot(x - ARENA.w / 2, y - ARENA.h / 2) < 200) continue;
      let ok = true;
      for (const w of G.walls) {
        if (x > w.x - 40 && x < w.x + w.w + 40 && y > w.y - 40 && y < w.y + w.h + 40) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: rand(80, ARENA.w - 80), y: rand(80, ARENA.h - 80) };
  }

  function spawnPickup(type, x, y) {
    const def = PU_TYPES[type];
    G.pickups.push({
      x, y, type, def,
      ttl: 20,
      ph: Math.random() * TAU
    });
  }

  // ======================= Player =======================
  function createPlayer() {
    return {
      x: ARENA.w / 2, y: ARENA.h / 2, r: 15,
      hp: 100, maxHp: 100, regen: 1, healingMult: 1,
      speed: 250,
      dmg: 12, rate: 1, arrowSpeed: 1,
      pierce: 0, critChance: 0,
      frontAdd: 0, backShots: 0, sideShots: 0,
      element: null,
      magnet: 100, vampirism: 0, ricochet: 0,
      melee: false, meleeDmg: 12, meleeRange: 110, meleeTimer: 0, meleeSwing: 0,
      shield: 0,
      weapon: 'bow',
      arrowWeapon: 'bow',
      pierceWalls: false,
      bombMode: false,
      bombShootTimer: 0,
      bombRadiusMult: 1,
      dashCd: 0, dashTime: 0, dashDx: 1, dashDy: 0,
      build: {},
      st: { freeze: 0, burn: 0, poison: 0, net: 0 },
      buff: { power: 0, haste: 0, swift: 0, magnet: 0, multi: 0, vamp: 0, xp: 0, dmg: 0 },
      shootTimer: 0,
      iframes: 0,
      flash: 0,
      aim: 0,
      orbitProjectiles: []
    };
  }

  function playerMoveDir() {
    let dx = 0, dy = 0;
    if (keys.KeyW || keys.ArrowUp) dy -= 1;
    if (keys.KeyS || keys.ArrowDown) dy += 1;
    if (keys.KeyA || keys.ArrowLeft) dx -= 1;
    if (keys.KeyD || keys.ArrowRight) dx += 1;
    if (touch.active) {
      dx += touch.dx / 50;
      dy += touch.dy / 50;
    }
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { x: dx, y: dy };
  }

  function playerAim(p) {
    if (touch.active) {
      // Use joystick direction for aiming
      const len = Math.hypot(touch.dx, touch.dy);
      const max = 50;
      if (len > max) {
        touch.dx = touch.dx / len * max;
        touch.dy = touch.dy / len * max;
      }
      // Convert joystick movement to aim angle
      const aim = Math.atan2(touch.dy, touch.dx);
      // Also check for nearest enemy if joystick not moved much
      const target = nearestEnemy(p.x, p.y, 900);
      if (target) return Math.atan2(target.y - p.y, target.x - p.x);
      return aim;
    }
    // Mouse aiming (for desktop / non-touch devices)
    const camScale = Math.min(CW, CH) / VIEW;
    const wx = G.cam.x + (mouse.x - CW / 2) / camScale;
    const wy = G.cam.y + (mouse.y - CH / 2) / camScale;
    return Math.atan2(wy - p.y, wx - p.x);
  }

  function nearestEnemy(ex, ey, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const b of G.bots) {
      const d = dist2(ex, ey, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ======================= Walls =======================
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function genWalls() {
    const walls = [];
    const cx = ARENA.w / 2, cy = ARENA.h / 2;
    let attempts = 0;
    while (walls.length < 36 && attempts++ < 800) {
      const w = rand(90, 260), h = rand(90, 260);
      const x = rand(60, ARENA.w - 60 - w), y = rand(60, ARENA.h - 60 - h);
      const rcx = x + w / 2, rcy = y + h / 2;
      if (Math.hypot(rcx - cx, rcy - cy) < 340) continue;
      const rect = { x, y, w, h };
      let overlap = false;
      for (const w2 of walls) if (rectsOverlap(rect, w2)) { overlap = true; break; }
      if (!overlap) walls.push(rect);
    }
    return walls;
  }

  function resolveAgainstWalls(e) {
    for (const w of G.walls) {
      const nx = clamp(e.x, w.x, w.x + w.w);
      const ny = clamp(e.y, w.y, w.y + w.h);
      const dx = e.x - nx, dy = e.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < e.r * e.r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          e.x += (dx / d) * (e.r - d);
          e.y += (dy / d) * (e.r - d);
        } else {
          const l = e.x - w.x, r = w.x + w.w - e.x, t = e.y - w.y, b = w.y + w.h - e.y;
          const m = Math.min(l, r, t, b);
          if (m === l) e.x = w.x - e.r;
          else if (m === r) e.x = w.x + w.w + e.r;
          else if (m === t) e.y = w.y - e.r;
          else e.y = w.y + w.h + e.r;
        }
      }
    }
  }

  // segment->box raycast via Liang-Barsky. Returns {t,nx,ny} or null
  const _ray = { t: 0, nx: 0, ny: 0 };
  function boxRaycast(x0, y0, x1, y1, b) {
    const dx = x1 - x0, dy = y1 - y0;
    let tmin = 0, tmax = 1;
    let nx = 0, ny = 0;
    let ok, r;
    ok = -dx; r = x0 - b.x;
    if (ok === 0) { if (r < 0) return null; }
    else { r = r / ok; if (ok < 0) { if (r > tmax) return null; if (r > tmin) { tmin = r; nx = -1; ny = 0; } } else { if (r < tmin) return null; if (r < tmax) tmax = r; } }
    ok = dx; r = b.x + b.w - x0;
    if (ok === 0) { if (r < 0) return null; }
    else { r = r / ok; if (ok < 0) { if (r > tmax) return null; if (r > tmin) { tmin = r; nx = 1; ny = 0; } } else { if (r < tmin) return null; if (r < tmax) tmax = r; } }
    ok = -dy; r = y0 - b.y;
    if (ok === 0) { if (r < 0) return null; }
    else { r = r / ok; if (ok < 0) { if (r > tmax) return null; if (r > tmin) { tmin = r; nx = 0; ny = -1; } } else { if (r < tmin) return null; if (r < tmax) tmax = r; } }
    ok = dy; r = b.y + b.h - y0;
    if (ok === 0) { if (r < 0) return null; }
    else { r = r / ok; if (ok < 0) { if (r > tmax) return null; if (r > tmin) { tmin = r; nx = 0; ny = 1; } } else { if (r < tmin) return null; if (r < tmax) tmax = r; } }
    if (tmin <= tmax && tmin >= 0 && tmin <= 1) { return { t: tmin, nx: nx, ny: ny }; }
    return null;
  }

  // ======================= Bots =======================
  const TIERS = [
    { hp: 28, dmg: 8,  speed: 170, r: 14, xp: 3,  color: '#38e08c' },
    { hp: 60, dmg: 12, speed: 185, r: 18, xp: 7,  color: '#ffd23e' },
    { hp: 110, dmg: 16, speed: 200, r: 22, xp: 13, color: '#ff8a3d' },
    { hp: 190, dmg: 22, speed: 210, r: 27, xp: 22, color: '#ff4d6d' }
  ];
  const TIER_UNLOCK = [0, 40, 110, 220];

  function tierForTime(t) {
    const avail = [0];
    if (t > TIER_UNLOCK[1]) avail.push(1);
    if (t > TIER_UNLOCK[2]) avail.push(2);
    if (t > TIER_UNLOCK[3]) avail.push(3);
    return avail[randi(0, avail.length - 1)];
  }

  const BOT_WEAPONS = {
    archer:  { fan: 1, spread: 0,    dmgm: 1.0, cd: 1,   speed: 420, pierce: 0, ranged: true, label: 'Лучник' },
    shotgun: { fan: 5, spread: 0.24, dmgm: 0.75, cd: 1.8, speed: 400, pierce: 0, ranged: true, label: 'Стрелок' },
    sniper:  { fan: 1, spread: 0,    dmgm: 2.0, cd: 2.4, speed: 760, pierce: 1, ranged: true, label: 'Снайпер' },
    rusher:  { fan: 1, spread: 0,    dmgm: 1.2, cd: 0,   speed: 0, pierce: 0, ranged: false, label: 'Безумец', melee: true, meleeDmg: 14 }
  };

  function pickBotWeapon(t) {
    const r = Math.random();
    if (t > 50 && r < 0.20) return 'rusher';
    if (r < 0.65) return 'archer';
    if (r < 0.80) return 'shotgun';
    if (r < 0.90) return 'sniper';
    return 'archer';
  }

  function spawnBot(forceTier) {
    const tier = forceTier !== undefined ? forceTier : tierForTime(G.time);
    const T = TIERS[tier];
    const scale = Math.min(2.2, 1 + G.time / 400);
    const elite = Math.random() < 0.08;
    const wpn = pickBotWeapon(G.time);
    const w = BOT_WEAPONS[wpn];
    const side = randi(0, 3);
    let x, y;
    const m = 80;
    if (side === 0) { x = rand(m, ARENA.w - m); y = m; }
    else if (side === 1) { x = ARENA.w - m; y = rand(m, ARENA.h - m); }
    else if (side === 2) { x = rand(m, ARENA.w - m); y = ARENA.h - m; }
    else { x = m; y = rand(m, ARENA.h - m); }
    const hp = Math.round(T.hp * scale * (elite ? 1.7 : 1));
    const rolePool = ['bomber', 'teleporter', 'necromancer', 'splitter', 'vampire', 'shielder'];
    const role = (G.time > 60 && Math.random() < 0.34) ? rolePool[randi(0, rolePool.length - 1)] : 'normal';
    const elemF = Math.random() < 0.15 ? ['fire', 'ice', 'poison', 'web'][randi(0, 3)] : null;
    const b = {
      x, y, r: T.r * (elite ? 1.25 : 1), tier, boss: false, elite,
      role, elem: elemF,
      shieldHp: role === 'shielder' ? Math.round(hp * 0.6) : 0,
      shieldMax: role === 'shielder' ? Math.round(hp * 0.6) : 0,
      summonTimer: 6, teleportTimer: 5,
      hp, maxHp: hp,
      dmg: Math.round(T.dmg * scale * (elite ? 1.2 : 1) * w.dmgm),
      speed: T.speed * scale * (wpn === 'rusher' ? 1.05 : 1), xp: Math.round(T.xp * (elite ? 2 : 1) * (1 + G.time / 300)), color: elite ? '#c9b1ff' : T.color,
      wpn, w,
      st: { freeze: 0, burn: 0, poison: 0, net: 0 },
      cooldown: 1, shootTimer: 0,
      meleeTimer: 0, meleeWindup: 0, meleeDmg: w.meleeDmg || 0,
      target: null, retarget: 0,
      wanderX: rand(0, ARENA.w), wanderY: rand(0, ARENA.h), wanderTimer: rand(1, 4),
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      flash: 0, seed: Math.random() * 100
    };
    const sp = freeSpot();
    b.x = (side === 0 || side === 2) ? sp.x : b.x;
    b.y = (side === 1 || side === 3) ? sp.y : b.y;
    G.bots.push(b);
    if (b.x > 0) resolveAgainstWalls(b);
  }

  function spawnMinion(x, y) {
    G.bots.push({
      x, y, r: 9, tier: 0, boss: false, elite: false,
      role: 'minion', elem: null, summonTimer: 0, teleportTimer: 0,
      hp: 8 + G.time * 0.5, maxHp: 8 + G.time * 0.5,
      dmg: 5, speed: 185, xp: 1, color: '#9bd7ff',
      wpn: 'rusher', w: BOT_WEAPONS.rusher,
      st: { freeze: 0, burn: 0, poison: 0, net: 0 },
      cooldown: 0.8, shootTimer: 0,
      meleeTimer: 0, meleeWindup: 0, meleeDmg: 6,
      target: null, retarget: 0,
      wanderX: x, wanderY: y, wanderTimer: 2,
      strafeDir: 1, flash: 0, seed: Math.random() * 100
    });
  }

  function minionCap(p) {
    return 2 + (p.frontAdd || 0) + (p.backShots || 0) + (p.sideShots || 0);
  }

  function updateMinions(dt) {
    const p = G.player;
    for (let i = G.minions.length - 1; i >= 0; i--) {
      const m = G.minions[i];
      m.life -= dt;
      m.hitCd = (m.hitCd || 0) - dt;
      if (m.life <= 0) { G.minions.splice(i, 1); continue; }
      const t = nearestEnemy(m.x, m.y, 600);
      if (t) {
        const dx = t.x - m.x, dy = t.y - m.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > t.r + 10) { m.x += dx / d * m.speed * dt; m.y += dy / d * m.speed * dt; }
        else if (m.hitCd <= 0) {
          m.hitCd = 1.0;
          const crit = Math.random() < (p.critChance || 0);
          const mDmg = (m.base + p.dmg) * activeDmgMult(p) * (crit ? 2 : 1);
          t.hp -= mDmg;
          t.flash = 0.1;
          applyEffects(p.element, t);
          addText(t.x, t.y - t.r - 6, String(Math.round(mDmg)), crit ? '#ffd23e' : '#9bd7ff');
          const effVamp = p.vampirism + (p.buff.vamp > 0 ? 0.25 : 0);
          if (effVamp > 0) p.hp = Math.min(p.maxHp, p.hp + mDmg * effVamp * (p.healingMult || 1));
          if (t.hp <= 0) { G.kills++; killBot(t); }
        }
      } else {
        const dx = p.x - m.x, dy = p.y - m.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 80) { m.x += dx / d * m.speed * dt; m.y += dy / d * m.speed * dt; }
      }
    }
  }

  function drawMinions() {
    for (const m of G.minions) {
      if (!onScreen(m.x, m.y)) continue;
      const wob = 1 + Math.sin(performance.now() / 200 + m.seed) * 0.15;
      ctx.fillStyle = '#9bd7ff';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * wob, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0b0e14';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 0.4, 0, TAU);
      ctx.fill();
    }
  }

  function separateUnits() {
    const units = [];
    if (G.player) units.push({ ref: G.player, x: G.player.x, y: G.player.y, r: G.player.r });
    for (const b of G.bots) {
      if (b.hp > 0) units.push({ ref: b, x: b.x, y: b.y, r: b.r });
    }
    for (const m of G.minions) units.push({ ref: m, x: m.x, y: m.y, r: m.r });
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i], c = units[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const min = a.r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.0001 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d * push, ny = dy / d * push;
          a.x -= nx; a.y -= ny;
          c.x += nx; c.y += ny;
        }
      }
    }
    for (const u of units) {
      if (!u.ref) continue;
      u.ref.x = clamp(u.x, u.r, ARENA.w - u.r);
      u.ref.y = clamp(u.y, u.r, ARENA.h - u.r);
      resolveAgainstWalls(u.ref);
    }
  }

  function spawnBoss() {
    const hp = Math.round(260 + G.time * 0.6);
    const b = {
      x: rand(200, ARENA.w - 200), y: rand(200, ARENA.h - 200),
      r: 44, tier: 3, boss: true,
      hp, maxHp: hp,
      dmg: 26, speed: 175, xp: 80, color: '#ff2d55',
      cooldown: 2, shootTimer: 0,
      st: { freeze: 0, burn: 0, poison: 0, net: 0 },
      target: null, retarget: 0,
      wanderX: 0, wanderY: 0, wanderTimer: 0,
      strafeDir: 1,
      flash: 0, seed: Math.random() * 100,
      burstTimer: 0
    };
    // avoid walls
    let tries = 0;
    while (tries++ < 20) {
      let ok = true;
      for (const w of G.walls) {
        if (b.x > w.x - b.r && b.x < w.x + w.w + b.r && b.y > w.y - b.r && b.y < w.y + w.h + b.r) {
          b.x = rand(200, ARENA.w - 200);
          b.y = rand(200, ARENA.h - 200);
          ok = false;
          break;
        }
      }
      if (ok) break;
    }
    G.bots.push(b);
    SFX.boss();
    showBanner('BOSS');
  }

  function spawnMiniBoss() {
    const x = rand(200, ARENA.w - 200), y = rand(200, ARENA.h - 200);
    const hp = 120 + G.wave * 22;
    const b = {
      x, y, r: 32, tier: 3, boss: false, elite: true,
      role: 'miniboss', elem: null, shieldHp: 0, shieldMax: 0,
      summonTimer: 0, teleportTimer: 0,
      hp, maxHp: hp,
      dmg: 18, speed: 185, xp: 28, color: '#ff6ea8',
      wpn: 'shotgun', w: BOT_WEAPONS.shotgun,
      st: { freeze: 0, burn: 0, poison: 0, net: 0 },
      cooldown: 1, shootTimer: 0, meleeTimer: 0, meleeWindup: 0, meleeDmg: 0,
      target: null, retarget: 0, wanderX: x, wanderY: y, wanderTimer: 2,
      strafeDir: 1, flash: 0, seed: Math.random() * 100
    };
    G.bots.push(b);
    SFX.boss();
    showBanner('МИНИ-БОСС');
  }

  function nearestBot(self, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const b of G.bots) {
      if (b === self) continue;
      const d = dist2(self.x, self.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function botThink(b, dt) {
    b.retarget -= dt;
    if (b.retarget <= 0) {
      b.retarget = rand(0.4, 0.8);
      b.target = null;
      const dPlayer = dist2(b.x, b.y, G.player.x, G.player.y);
      const isRusher = b.w && !b.w.ranged;
      const flee = !isRusher && b.hp < b.maxHp * 0.3 && dPlayer < 320 * 320 && !b.boss;
      if (flee) {
        b.target = 'flee';
      } else if (isRusher) {
        b.target = G.player;
      } else {
        const range = (b.w && b.w.label === 'Снайпер') ? 700 : 480;
        if (dPlayer < range * range && Math.random() < 0.75) {
          b.target = G.player;
        } else {
          b.target = nearestBot(b, 500);
        }
      }
    }

    b.wanderTimer -= dt;
    let dirX = 0, dirY = 0;

    // ===== роли ботов =====
    const dP = dist2(b.x, b.y, G.player.x, G.player.y);
    if (b.role === 'teleporter') {
      b.teleportTimer -= dt;
      if (b.teleportTimer <= 0 && dP < 700 * 700) {
        b.teleportTimer = 4 + rand(0, 2);
        const aang = rand(0, TAU);
        const dist = rand(200, 420);
        b.x = clamp(G.player.x + Math.cos(aang) * dist, b.r, ARENA.w - b.r);
        b.y = clamp(G.player.y + Math.sin(aang) * dist, b.r, ARENA.h - b.r);
        resolveAgainstWalls(b);
        spawnParticles(b.x, b.y, 10, '#b18cff', 140);
        b.target = G.player;
        b.retarget = 0;
      }
    }
    if (b.role === 'necromancer') {
      b.summonTimer -= dt;
      if (b.summonTimer <= 0 && G.bots.length < 90) {
        b.summonTimer = 7;
        const n = randi(2, 3);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU);
          spawnMinion(b.x + Math.cos(a) * 30, b.y + Math.sin(a) * 30);
        }
        addText(b.x, b.y - b.r - 10, 'Призываю!', '#9bd7ff');
      }
    }

    if (b.target === 'flee') {
      const dx = b.x - G.player.x, dy = b.y - G.player.y;
      const len = Math.hypot(dx, dy) || 1;
      dirX = dx / len; dirY = dy / len;
    } else if (b.target) {
      const dx = b.target.x - b.x, dy = b.target.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const isRusher = b.w && !b.w.ranged;
      if (isRusher) {
        dirX = dx / d; dirY = dy / d; // charge straight at target
      } else {
        const wantDist = b.r + b.target.r + 120;
        if (d > wantDist) { dirX = dx / d; dirY = dy / d; }
        else if (d < wantDist * 0.6) { dirX = -dx / d; dirY = -dy / d; }
        else {
          dirX = -dy / d * b.strafeDir;
          dirY = dx / d * b.strafeDir;
        }
      }
    } else {
      if (b.wanderTimer <= 0 || dist2(b.x, b.y, b.wanderX, b.wanderY) < 40 * 40) {
        b.wanderX = rand(60, ARENA.w - 60);
        b.wanderY = rand(60, ARENA.h - 60);
        b.wanderTimer = rand(1.5, 4);
      }
      const dx = b.wanderX - b.x, dy = b.wanderY - b.y;
      const len = Math.hypot(dx, dy) || 1;
      dirX = dx / len; dirY = dy / len;
    }

    const mv = statusMoveMult(b);
    if (mv === 0) return; // fully rooted (net)

    b.x += dirX * b.speed * mv * dt;
    b.y += dirY * b.speed * mv * dt;
    resolveAgainstWalls(b);
    b.x = clamp(b.x, b.r, ARENA.w - b.r);
    b.y = clamp(b.y, b.r, ARENA.h - b.r);

    const w = b.w || BOT_WEAPONS.archer;

    // Melee rusher attack
    if (!w.ranged) {
      const d = Math.hypot(G.player.x - b.x, G.player.y - b.y);
      if (b.meleeWindup > 0) {
        b.meleeWindup -= dt;
        if (b.meleeWindup <= 0) {
          b.meleeTimer = 1.5;
          b.flash = 0.15;
          const d2 = Math.hypot(G.player.x - b.x, G.player.y - b.y);
          if (d2 < b.r + G.player.r + 26) {
            const mdmg = b.dmg + (b.meleeDmg || 10);
            let real = mdmg;
            if (G.player.shield > 0) { const a = Math.min(real, G.player.shield); G.player.shield -= a; real -= a; }
            if (real > 0) G.player.hp -= real;
            G.player.iframes = 0.6;
            G.shake = Math.min(G.shake + 5, 14);
            spawnParticles(G.player.x, G.player.y, 8, '#ff8a3d', 160);
            SFX.hit();
            // отброс: безумец отлетает назад, чтобы не «прилипать»
            const kd = Math.hypot(G.player.x - b.x, G.player.y - b.y) || 1;
            b.x -= (G.player.x - b.x) / kd * 34;
            b.y -= (G.player.y - b.y) / kd * 34;
            resolveAgainstWalls(b);
            if (G.player.hp <= 0) gameOver();
          }
        }
      } else {
        b.meleeTimer -= dt;
        if (b.meleeTimer <= 0 && d < b.r + G.player.r + 18) {
          b.meleeWindup = 0.5;
          b.flash = 0.08;
        }
      }
      return;
    }

    // Ranged shooting
    b.shootTimer -= dt;
    if (b.shootTimer <= 0 && b.target && b.target !== 'flee') {
      const d = Math.hypot(b.target.x - b.x, b.target.y - b.y);
      const range = (b.w && b.w.label === 'Снайпер') ? 780 : 620;
      if (d < range) {
        const aim = Math.atan2(b.target.y - b.y, b.target.x - b.x);
    if (b.boss) {
          for (let i = -1; i <= 1; i++) {
            const a = aim + i * 0.22;
            fireArrow(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, a, 430, b.dmg, 'bot', b, w.pierce, false, 0, false, b.elem);
          }
        } else {
          const fan = w.fan || 1;
          const spread = w.spread || 0;
          const base = aim - (spread * (fan - 1)) / 2;
          for (let i = 0; i < fan; i++) {
            const a = base + spread * i;
            fireArrow(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, a, w.speed, b.dmg, 'bot', b, w.pierce, false, 0, false, b.elem);
          }
        }
        b.shootTimer = b.boss ? rand(1.6, 2.2) : rand(0.9, 1.7);
      }
    }
  }

  // ======================= Arrows =======================
  function fireArrow(x, y, angle, speed, damage, ownerType, owner, pierce, crit, bounces, passWalls, elem) {
    G.arrows.push({
      x, y, px0: x, py0: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle, damage, ownerType, owner, pierce, crit,
      bounces: bounces || 0,
      passWalls: !!passWalls,
      elem: elem || null,
      life: 2.4,
      dead: false,
      hitSet: new Set()
    });
  }

  function fireBombWeapon(p, aim) {
    // Стихия — единый слот (p.element), бомба несёт её или обычная.
    const type = p.element || 'normal';
    const launch = (ty) => {
      const speed = 430;
      G.bombs.push({
        x: p.x + Math.cos(aim) * (p.r + 6), y: p.y + Math.sin(aim) * (p.r + 6),
        vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed,
        flying: true, fuse: 1.0, maxFly: 1.6,
        r: 9, type: ty
      });
      SFX.shoot();
    };
    launch(type);
  }

  // ======================= Special weapons: laser / boomerang / claws =======================
  function applyEffects(elem, target) {
    if (!elem) return;
    if (elem === 'fire') applyStatus(target, 'burn', 3);
    else if (elem === 'ice') applyStatus(target, 'freeze', 2.2);
    else if (elem === 'poison') applyStatus(target, 'poison', 4);
    else if (elem === 'web') { applyStatus(target, 'net', 1.3); spawnParticles(target.x, target.y, 6, '#c9b1ff', 80); }
  }

  function fireLaser(p, aim) {
    G.beams.push({
      x: p.x + Math.cos(aim) * p.r, y: p.y + Math.sin(aim) * p.r,
      angle: aim, range: WEAPONS.laser.range, life: 0.3, maxLife: 0.3,
      dmg: WEAPONS.laser.dmg * p.dmg * activeDmgMult(p),
      hit: new Map()
    });
    SFX.shoot();
  }

  function updateBeams(dt) {
    for (let i = G.beams.length - 1; i >= 0; i--) {
      const bm = G.beams[i];
      bm.life -= dt;
      if (bm.life <= 0) { G.beams.splice(i, 1); continue; }
      const cos = Math.cos(bm.angle), sin = Math.sin(bm.angle);
      for (const bot of G.bots.slice()) {
        if (bot.hp <= 0) continue;
        const proj = (bot.x - bm.x) * cos + (bot.y - bm.y) * sin;
        if (proj < 0 || proj > bm.range) continue;
        const perp = Math.abs((bot.x - bm.x) * sin - (bot.y - bm.y) * cos);
        if (perp > bot.r + 10) continue;
        const cd = bm.hit.get(bot) || 0;
        if (cd > 0) { bm.hit.set(bot, cd - dt); continue; }
        bot.hp -= bm.dmg;
        bot.flash = 0.1;
        applyStatus(bot, 'burn', 1.5);
        addText(bot.x, bot.y - bot.r - 6, String(Math.round(bm.dmg)), '#ff3b6b');
        bm.hit.set(bot, 0.15);
        if (bot.hp <= 0) { G.kills++; killBot(bot); }
      }
    }
  }

  function fireBoomerang(p, aim) {
    G.boomerangs.push({
      x: p.x, y: p.y, angle: aim, dist: 0, maxDist: 400, speed: 640,
      state: 'out',
      dmg: WEAPONS.boomerang.dmg * p.dmg * activeDmgMult(p),
      hitSet: new Set()
    });
    SFX.shoot();
  }

  function updateBoomerangs(dt) {
    const p = G.player;
    for (let i = G.boomerangs.length - 1; i >= 0; i--) {
      const bm = G.boomerangs[i];
      if (bm.state === 'out') {
        bm.dist += bm.speed * dt;
        bm.x = p.x + Math.cos(bm.angle) * bm.dist;
        bm.y = p.y + Math.sin(bm.angle) * bm.dist;
        if (bm.dist >= bm.maxDist) bm.state = 'in';
      } else {
        const dx = p.x - bm.x, dy = p.y - bm.y;
        const d = Math.hypot(dx, dy) || 1;
        bm.x += dx / d * 560 * dt;
        bm.y += dy / d * 560 * dt;
        if (d < 12) { G.boomerangs.splice(i, 1); continue; }
      }
      for (const bot of G.bots.slice()) {
        if (bot.hp <= 0 || bm.hitSet.has(bot)) continue;
        if (Math.hypot(bot.x - bm.x, bot.y - bm.y) < bot.r + 10) {
          bot.hp -= bm.dmg;
          bot.flash = 0.1;
          addText(bot.x, bot.y - bot.r - 6, Math.round(bm.dmg), '#ffae42');
          applyEffects(p.element, bot);
          bm.hitSet.add(bot);
          if (bot.hp <= 0) { G.kills++; killBot(bot); }
        }
      }
    }
  }

  function fireClaws(p) {
    const w = WEAPONS.claws;
    const dmg = w.dmg * p.dmg * activeDmgMult(p);
    const range = 125;
    p.meleeSwing = 0.12;
    G.shake = Math.min(G.shake + 2, 8);
    for (const bot of G.bots.slice()) {
      if (bot.hp <= 0) continue;
      const d = Math.hypot(bot.x - p.x, bot.y - p.y);
      if (d > range + bot.r) continue;
      const ang = Math.atan2(bot.y - p.y, bot.x - p.x);
      let diff = Math.abs(ang - p.aim);
      if (diff > Math.PI) diff = TAU - diff;
      if (diff > 1.05) continue;
      bot.hp -= dmg;
      bot.flash = 0.1;
      applyEffects(p.element, bot);
      spawnParticles(bot.x, bot.y, 6, '#38e08c', 140);
      addText(bot.x, bot.y - bot.r - 6, String(Math.round(dmg)), '#38e08c');
      if (bot.hp <= 0) { G.kills++; killBot(bot); }
    }
    SFX.hit();
  }

  function enterBombMode(p) {
    p.weapon = 'bomb';
    p.bombMode = true;
  }

  function spawnNecro(p) {
    if (G.minions.length >= minionCap(p)) {
      addText(p.x, p.y - p.r - 12, 'Отряд полон', '#9bd7ff');
      return;
    }
    const a = rand(0, TAU);
    const d = 60;
    G.minions.push({
      x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
      r: 7 + (p.maxHp > 120 ? 1 : 0),
      speed: 150 + p.speed * 0.5,
      base: 8 + G.level,
      life: 10 + p.maxHp * 0.08,
      seed: Math.random() * 100
    });
    spawnParticles(p.x, p.y, 8, '#9bd7ff', 120);
    addText(p.x, p.y - p.r - 12, 'Миньон', '#9bd7ff');
    SFX.shoot();
  }

  function fireSpiral(p, aim, dmg, spd, pierce, bounces, passWalls, elem) {
    const rotations = 3;
    for (let i = 0; i < rotations; i++) {
      const a = aim + (i / rotations) * TAU;
      fireArrow(p.x, p.y, a, spd, dmg, 'player', p, pierce, false, bounces, passWalls, elem);
    }
    SFX.shoot();
  }

  function fireOrbit(p, dmg, pierce, bounces, passWalls, elem) {
    const count = 4;
    // Store orbit data on player for update loop to handle
    p.orbitProjectiles = [];
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * TAU;
      // Create stationary arrow that will be moved by orbit logic
      fireArrow(p.x, p.y, baseAngle, 0, dmg, 'player', p, pierce, false, bounces, passWalls, elem);
      p.orbitProjectiles.push({
        angle: baseAngle,
        radius: 50,
        speed: 2.5
      });
    }
    SFX.shoot();
  }

  function fireWave(p, aim, dmg, spd, pierce, bounces, passWalls, elem) {
    const waveCount = 5;
    for (let i = 0; i < waveCount; i++) {
      const offset = (i - (waveCount - 1) / 2) * 0.15;
      const a = aim + offset;
      fireArrow(p.x, p.y, a, spd, dmg, 'player', p, pierce, false, bounces, passWalls, elem);
    }
    SFX.shoot();
  }

  function playerShoot(p) {
    // Mobile fire button support
    const isFiring = G.mobileFiring || true; // Auto-fire always enabled for now
    if (!isFiring) return;
    
    const w = p.bombMode ? WEAPONS.bomb : (WEAPONS[p.weapon] || WEAPONS.bow);
    const cd = w.cd * p.rate * (p.buff.haste > 0 ? 0.6 : 1);
    p.shootTimer -= dt;
    if (p.shootTimer > 0) return;

    // Bomb mode: вместо стрел летят бомбы-кружки (взрыв при контакте)
    if (p.bombMode) {
      p.bombShootTimer -= dt;
      if (p.bombShootTimer > 0) return;
      const n = 1 + p.frontAdd + (p.buff.multi > 0 ? 2 : 0);
      const spread = n > 1 ? 0.11 : 0;
      const base = p.aim - (spread * (n - 1)) / 2;
      for (let i = 0; i < n; i++) fireBombWeapon(p, base + spread * i);
      for (let i = 0; i < p.backShots; i++) {
        const a = p.aim + Math.PI + (i - (p.backShots - 1) / 2) * 0.2;
        fireBombWeapon(p, a);
      }
      for (let i = 0; i < p.sideShots; i++) {
        const a = (i - (p.sideShots - 1) / 2) * 0.2;
        fireBombWeapon(p, p.aim + Math.PI / 2 + a);
        fireBombWeapon(p, p.aim - Math.PI / 2 + a);
      }
      p.bombShootTimer = cd;
      return;
    }

    if (w.kind === 'laser') { fireLaser(p, p.aim); p.shootTimer = cd; return; }
    if (w.kind === 'boomerang') { fireBoomerang(p, p.aim); p.shootTimer = cd; return; }
    if (w.kind === 'claws') { fireClaws(p); p.shootTimer = cd; return; }
    if (w.kind === 'necro') { spawnNecro(p); p.shootTimer = cd; return; }

    // Calculate common projectile parameters for all weapons
    const dmg = p.dmg * w.dmg * activeDmgMult(p);
    const spd = w.speed * p.arrowSpeed;
    const pierce = w.pierce + p.pierce;
    const bounces = p.ricochet;
    const passWalls = p.pierceWalls;
    const elem = p.element || null;

    if (w.kind === 'spiral') { fireSpiral(p, p.aim, dmg, spd, pierce, bounces, passWalls, elem); p.shootTimer = cd; return; }
    if (w.kind === 'orbit') { fireOrbit(p, dmg, pierce, bounces, passWalls, elem); p.shootTimer = cd; return; }
    if (w.kind === 'wave') { fireWave(p, p.aim, dmg, spd, pierce, bounces, passWalls, elem); p.shootTimer = cd; return; }

    const aim = p.aim;
    const n = w.burst + p.frontAdd + (p.buff.multi > 0 ? 2 : 0);

    const shots = [];
    const addShot = (ang, xoff, yoff) => shots.push({ ang, xoff, yoff });

    if (w.burst === 2 && n >= 2) {
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const off = 10 * Math.floor(i / 2 + 1) * 0.7;
        const px = Math.cos(aim + Math.PI / 2), py = Math.sin(aim + Math.PI / 2);
        addShot(aim, Math.cos(aim) * p.r + px * off * side, Math.sin(aim) * p.r + py * off * side);
      }
    } else {
      const spread = Math.max(w.spread, n > 1 ? 0.06 : 0);
      const base = aim - (spread * (n - 1)) / 2;
      for (let i = 0; i < n; i++) {
        const a = base + spread * i;
        addShot(a, Math.cos(a) * p.r, Math.sin(a) * p.r);
      }
    }

    for (let i = 0; i < p.backShots; i++) {
      const a = aim + Math.PI + (i - (p.backShots - 1) / 2) * 0.16;
      addShot(a, Math.cos(a) * p.r, Math.sin(a) * p.r);
    }
    for (let i = 0; i < p.sideShots; i++) {
      const a = (i - (p.sideShots - 1) / 2) * 0.16;
      addShot(aim + Math.PI / 2 + a, Math.cos(aim + Math.PI / 2 + a) * p.r, Math.sin(aim + Math.PI / 2 + a) * p.r);
      addShot(aim - Math.PI / 2 + a, Math.cos(aim - Math.PI / 2 + a) * p.r, Math.sin(aim - Math.PI / 2 + a) * p.r);
    }

    for (const s of shots) {
      fireArrow(p.x + s.xoff, p.y + s.yoff, s.ang, spd, dmg, 'player', null, pierce,
        Math.random() < p.critChance, bounces, passWalls, elem);
    }
    SFX.shoot();
    p.shootTimer = cd;
  }

  function arrowWallPass(ar, dt) {
    if (ar.passWalls) return false;
    // returns true if dead
    let guard = 0;
    while (guard++ < 4) {
      let hit = false;
      for (const w of G.walls) {
        const res = boxRaycast(ar.px0, ar.py0, ar.x, ar.y, w);
        if (res && res.t > 0 && res.t <= 1) {
          ar.x = ar.px0 + (ar.x - ar.px0) * res.t;
          ar.y = ar.py0 + (ar.y - ar.py0) * res.t;
          const dot = ar.vx * res.nx + ar.vy * res.ny;
          ar.vx -= 2 * dot * res.nx;
          ar.vy -= 2 * dot * res.ny;
          ar.angle = Math.atan2(ar.vy, ar.vx);
          if (ar.bounces > 0) {
            ar.bounces--;
            spawnParticles(ar.x, ar.y, 6, '#8ecbff', 140);
            ar.px0 = ar.x;
            ar.py0 = ar.y;
            ar.x += ar.vx * dt;
            ar.y += ar.vy * dt;
            hit = true;
          } else {
            ar.dead = true;
            spawnParticles(ar.x, ar.y, 6, '#8ecbff', 100);
            return true;
          }
          break;
        }
      }
      if (!hit) break;
    }
    return false;
  }

  function arrowHit(ar, target) {
    if (ar.hitSet.has(target)) return;
    ar.hitSet.add(target);

    const dmg = ar.damage * (ar.crit ? 2 : 1);
    let realDmg = dmg;
    // щит щитоносца поглощает урон
    if (target !== G.player && target.shieldHp !== undefined && target.shieldHp > 0) {
      const absorbed = Math.min(realDmg, target.shieldHp);
      target.shieldHp -= absorbed;
      realDmg -= absorbed;
      target.flash = 0.1;
      spawnParticles(target.x, target.y, 4, '#6ee7ff', 100);
    }
    target.hp -= realDmg;
    target.flash = 0.1;
    spawnParticles(target.x, target.y, 4, target.color, 90);
    addText(target.x, target.y - target.r - 6, String(Math.round(realDmg)), ar.crit ? '#ffd23e' : '#ffffff');
    if (target === G.player) {
      let real = realDmg;
      if (G.player.shield > 0) {
        const absorbed = Math.min(real, G.player.shield);
        G.player.shield -= absorbed;
        real -= absorbed;
        SFX.hit();
      }
      if (real > 0) G.player.hp -= real;
      if (ar.elem) {
        if (ar.elem === 'fire') applyStatus(G.player, 'burn', 2);
        else if (ar.elem === 'ice') applyStatus(G.player, 'freeze', 1.5);
        else if (ar.elem === 'poison') applyStatus(G.player, 'poison', 2.5);
        else if (ar.elem === 'web') applyStatus(G.player, 'net', 1.2);
      }
      G.player.iframes = 1;
      G.shake = Math.min(G.shake + 6, 14);
      SFX.hurt();
      if (G.player.hp <= 0) gameOver();
    } else {
      if (ar.ownerType === 'player') {
        SFX.hit();
        applyEffects(ar.elem, target);
        if (target.hp <= 0) G.kills++;
        const effVamp = G.player.vampirism + (G.player.buff.vamp > 0 ? 0.25 : 0);
        if (effVamp > 0 && realDmg > 0) {
          const healAmt = realDmg * effVamp * (G.player.healingMult || 1);
          G.player.hp = Math.min(G.player.maxHp, G.player.hp + healAmt);
          spawnParticles(G.player.x, G.player.y, 3, '#ff5a8f', 60);
        }
      } else if (ar.owner && ar.owner.role === 'vampire' && realDmg > 0) {
        ar.owner.hp = Math.min(ar.owner.maxHp, ar.owner.hp + realDmg * 0.5);
      }
      if (target.hp <= 0) killBot(target);
    }

    ar.pierce--;
  }

  function killBot(b) {
    const idx = G.bots.indexOf(b);
    if (idx === -1) return;
    G.bots.splice(idx, 1);
    spawnParticles(b.x, b.y, 18, b.color, 240);
    const val = b.xp;
    const gems = b.boss ? 18 : randi(3, 5);
    let remain = val;
    for (let i = 0; i < gems && remain > 0; i++) {
      const a = rand(0, TAU);
      const d = rand(0, 70);
      const v = i === gems - 1 ? remain : Math.max(1, Math.round(remain / (gems - i)));
      remain -= v;
      G.gems.push({
        x: b.x + Math.cos(a) * d,
        y: b.y + Math.sin(a) * d,
        r: b.boss ? 8 : rand(4, 6),
        value: v,
        taken: false,
        ttl: 30
      });
    }
    // Взрыв бомбера при смерти (не зачисляется игроку как убийство)
    if (b.role === 'bomber') {
      const bd = 120;
      const bdmg = 18 + G.level * 2;
      spawnParticles(b.x, b.y, 22, '#ffae42', 300);
      G.shake = Math.min(G.shake + 6, 12);
      for (const other of G.bots.slice()) {
        if (other === b) continue;
        if (other.hp > 0 && Math.hypot(other.x - b.x, other.y - b.y) < bd + other.r) {
          other.hp -= bdmg;
          other.flash = 0.1;
          if (other.hp <= 0) killBot(other);
        }
      }
      const pw = Math.hypot(G.player.x - b.x, G.player.y - b.y);
      if (pw < bd + G.player.r) {
        let real = bdmg * 0.6;
        if (G.player.shield > 0) { const a = Math.min(real, G.player.shield); G.player.shield -= a; real -= a; }
        if (real > 0) G.player.hp -= real;
        G.player.iframes = 1;
        if (G.player.hp <= 0) gameOver();
      }
      G.particles.push({ x: b.x, y: b.y, life: 0.35, maxLife: 0.35, r: bd * 1.3, vx: 0, vy: 0, color: '#ffae42', ring: true });
    }

    // Сплиттер распадается на двух мелких
    if (b.role === 'splitter' && b.r > 8 && G.bots.length < 90) {
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU);
        const dd = rand(10, 24);
        G.bots.push({
          x: clamp(b.x + Math.cos(a) * dd, 20, ARENA.w - 20),
          y: clamp(b.y + Math.sin(a) * dd, 20, ARENA.h - 20),
          r: Math.max(6, b.r * 0.6), tier: b.tier, boss: false, elite: false,
          role: 'normal', elem: b.elem || null, shieldHp: 0, shieldMax: 0,
          summonTimer: 0, teleportTimer: 0,
          hp: Math.max(10, b.maxHp * 0.35), maxHp: Math.max(10, b.maxHp * 0.35),
          dmg: Math.max(4, Math.round(b.dmg * 0.7)), speed: b.speed * 1.08,
          xp: Math.max(1, Math.round(b.xp * 0.4)), color: b.color,
          wpn: 'rusher', w: BOT_WEAPONS.rusher,
          st: { freeze: 0, burn: 0, poison: 0, net: 0 },
          cooldown: 0.8, shootTimer: rand(0, 1),
          meleeTimer: 0, meleeWindup: 0, meleeDmg: Math.round(b.dmg * 0.7),
          target: null, retarget: 0, wanderX: b.x, wanderY: b.y, wanderTimer: 2,
          strafeDir: Math.random() < 0.5 ? 1 : -1, flash: 0, seed: Math.random() * 100
        });
      }
    }

    if (b.boss) {
      spawnPickup(Math.random() < 0.5 ? 'shield' : 'heal', b.x, b.y);
      spawnPickup('power', b.x + rand(-60, 60), b.y + rand(-60, 60));
      spawnPickup('bomb', b.x + rand(-60, 60), b.y + rand(-60, 60));
      SFX.boss();
    } else if (b.elite) {
      spawnPickup('bomb', b.x, b.y);
    }

    SFX.kill();
  }

  // ======================= Status effects =======================
  const STATUS_META = {
    freeze: { color: '#57c8ff', name: 'Заморозка' },
    burn:   { color: '#ff7a3d', name: 'Огонь' },
    poison: { color: '#8bd450', name: 'Яд' },
    net:    { color: '#c9b1ff', name: 'Сеть' }
  };

  function applyStatus(target, kind, dur) {
    if (!target.st) target.st = { freeze: 0, burn: 0, poison: 0, net: 0 };
    target.st[kind] = Math.max(target.st[kind], dur);
  }

  function damageFromStatuses(target, level, dt) {
    const st = target.st;
    if (!st) return 0;
    st.burn = Math.max(0, st.burn - dt);
    st.poison = Math.max(0, st.poison - dt);
    st.freeze = Math.max(0, st.freeze - dt);
    st.net = Math.max(0, st.net - dt);
    let dps = 0;
    if (st.burn > 0) dps += 7 + level * 0.6;
    if (st.poison > 0) dps += 5 + level * 0.4;
    return dps * dt;
  }

  function statusMoveMult(target) {
    const st = target.st;
    if (!st) return 1;
    if (st.net > 0) return 0;
    if (st.freeze > 0) return 0.45;
    return 1;
  }

  function statusTint(st) {
    if (!st) return null;
    if (st.net > 0) return { color: '#c9b1ff', a: 0.4 };
    if (st.freeze > 0) return { color: '#57c8ff', a: 0.4 };
    if (st.poison > 0) return { color: '#8bd450', a: 0.3 };
    if (st.burn > 0) return { color: '#ff7a3d', a: 0.18 };
    return null;
  }

  // ======================= Bombs =======================
  const BOMB_TYPES = {
    normal:  { dmgm: 1, radius: 125, letter: 'B', color: '#ffae42', name: 'Бомба' },
    fire:    { dmgm: 1, radius: 150, letter: 'F', color: '#ff7a3d', name: 'Огонь' },
    ice:     { dmgm: 1, radius: 165, letter: 'L', color: '#57c8ff', name: 'Лёд' },
    poison:  { dmgm: 1, radius: 150, letter: 'Y', color: '#8bd450', name: 'Яд' },
    web:     { dmgm: 1, radius: 175, letter: 'N', color: '#c9b1ff', name: 'Паутина' }
  };

  function updateBombs(dt) {
    for (let i = G.bombs.length - 1; i >= 0; i--) {
      const b = G.bombs[i];
      if (b.flying) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.maxFly -= dt;
        // enemy contact -> explode immediately
        let hit = false;
        for (const bot of G.bots) {
          if (Math.hypot(bot.x - b.x, bot.y - b.y) < b.r + bot.r) { hit = true; break; }
        }
        if (hit) { explodeBomb(b); G.bombs.splice(i, 1); continue; }
        for (const w of G.walls) {
          if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h) { b.flying = false; break; }
        }
        if (b.maxFly <= 0) b.flying = false;
        if (!b.flying) b.fuse = 0.9;
      } else {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          explodeBomb(b);
          G.bombs.splice(i, 1);
        }
      }
    }
  }

  function explodeBomb(b) {
    const T = BOMB_TYPES[b.type] || BOMB_TYPES.normal;
    const r = T.radius * (G.player.bombRadiusMult || 1);
    const dmg = (35 + G.level * 4) * T.dmgm * activeDmgMult(G.player);
    const c = T.color;
    spawnParticles(b.x, b.y, 30, c, 320);
    spawnParticles(b.x, b.y, 20, '#ffffff', 200);
    G.shake = Math.min(G.shake + 10, 18);
    SFX.boss();
    let dealt = 0;
    const el = G.player ? G.player.element : null;
    for (const bot of G.bots.slice()) {
      if (Math.hypot(bot.x - b.x, bot.y - b.y) < r + bot.r) {
        if (dmg > 0) {
          bot.hp -= dmg;
          dealt += dmg;
          bot.flash = 0.1;
          addText(bot.x, bot.y - bot.r - 6, String(Math.round(dmg)), c);
          if (bot.hp <= 0) { G.kills++; killBot(bot); continue; }
        }
        if (el === 'fire') applyStatus(bot, 'burn', 3);
        else if (el === 'ice') applyStatus(bot, 'freeze', 2.2);
        else if (el === 'poison') applyStatus(bot, 'poison', 4);
        else if (el === 'web') { applyStatus(bot, 'net', 1.5); spawnParticles(bot.x, bot.y, 8, '#c9b1ff', 90); }
      }
    }
    const effVamp = G.player.vampirism + (G.player.buff.vamp > 0 ? 0.25 : 0);
    if (dealt > 0 && effVamp > 0) {
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + dealt * effVamp * (G.player.healingMult || 1));
      spawnParticles(G.player.x, G.player.y, 3, '#ff5a8f', 60);
    }
    G.particles.push({ x: b.x, y: b.y, life: 0.4, maxLife: 0.4, r: r * 1.5, vx: 0, vy: 0, color: c, ring: true });

    if (el === 'poison') {
      spawnPuddle(b.x, b.y, r * 0.8, 5, 10 + G.level * 1.5);
    }
  }

  // ======================= Poison puddle =======================
  function spawnPuddle(x, y, r, dur, dps) {
    G.puddles.push({ x, y, r, ttl: dur, maxTtl: dur, dps, seed: Math.random() * 100 });
  }

  function updatePuddles(dt) {
    for (let i = G.puddles.length - 1; i >= 0; i--) {
      const pd = G.puddles[i];
      pd.ttl -= dt;
      pd.tick = (pd.tick || 0) - dt;
      pd.acc = pd.acc || 0;
      if (pd.ttl <= 0) { G.puddles.splice(i, 1); continue; }
      for (const bot of G.bots.slice()) {
        if (Math.hypot(bot.x - pd.x, bot.y - pd.y) < pd.r + bot.r) {
          const dmg = pd.dps * dt;
          bot.hp -= dmg;
          pd.acc += dmg;
          applyStatus(bot, 'poison', 1.5);
          if (Math.random() < 0.12) spawnParticles(bot.x + rand(-8, 8), bot.y + rand(-8, 8), 1, '#8bd450', 40);
          if (bot.hp <= 0) { G.kills++; killBot(bot); }
        }
      }
      // видимый тик: копим урон и показываем накопленное раз в 0.7 сек
      if (pd.tick <= 0 && pd.acc > 0) {
        pd.tick = 0.7;
        addText(pd.x, pd.y - 14, '-' + Math.round(pd.acc), '#8bd450');
        pd.acc = 0;
      }
    }
  }

  function drawPuddles() {
    for (const pd of G.puddles) {
      const a = clamp(pd.ttl / pd.maxTtl, 0, 1);
      const wob = 1 + Math.sin(performance.now() / 350 + pd.seed) * 0.05;
      const R = pd.r * wob;
      // основа — сплошной зелёный круг
      ctx.globalAlpha = clamp(0.55 * a, 0, 0.55);
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.arc(pd.x, pd.y, R, 0, TAU);
      ctx.fill();
      // ярче в центре
      ctx.globalAlpha = clamp(0.4 * a, 0, 0.4);
      ctx.fillStyle = '#8bd450';
      ctx.beginPath();
      ctx.arc(pd.x, pd.y, R * 0.55, 0, TAU);
      ctx.fill();
      // резкий ободок
      ctx.globalAlpha = clamp(0.9 * a, 0, 0.9);
      ctx.strokeStyle = '#a5ffa0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pd.x, pd.y, R, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ======================= Particles & texts =======================
  function spawnParticles(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(30, speed);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.25, 0.6),
        maxLife: 0.6,
        r: rand(1.5, 3.5),
        color
      });
    }
  }

  function addText(x, y, str, color) {
    G.texts.push({ x, y, str, color, life: 0.8, maxLife: 0.8 });
  }

  // ======================= Gems & XP =======================
  function updateGems(p, dt) {
    const mag = p.magnet * (p.buff.magnet > 0 ? 2 : 1);
    for (const g of G.gems) {
      if (g.ttl === undefined) g.ttl = 30;
      g.ttl -= dt;
      if (g.taken) continue;
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d < mag && d > 1) {
        const pull = (1 - d / mag) * 500 + 300;
        g.x += (p.x - g.x) / d * pull * dt;
        g.y += (p.y - g.y) / d * pull * dt;
      }
      if (d < p.r + g.r + 6) {
        g.taken = true;
        gainXP(g.value);
      }
    }
    let wg = 0;
    for (let gi = 0; gi < G.gems.length; gi++) {
      const g = G.gems[gi];
      if (!g.taken && g.ttl > 0) G.gems[wg++] = g;
    }
    G.gems.length = wg;
  }

  function gainXP(v) {
    if (G.player && G.player.buff.xp > 0) v *= 2;
    G.xp += v;
    let ups = 0;
    while (G.xp >= G.xpNext) {
      G.xp -= G.xpNext;
      G.level++;
      G.xpNext = xpNextFor(G.level);
      G.pendingLevels++;
      G.levelUpPending = true;
      ups++;
    }
    if (ups > 0) SFX.level();
  }

  // ======================= Skill Tree (level-up graph) =======================
  const panel = document.getElementById('upgrade-panel');
  const treeViewport = document.getElementById('tree-viewport');
  const treeCanvasEl = document.getElementById('tree-canvas');
  const treeSubtitle = document.getElementById('tree-subtitle');
  const treeDetailIcon = document.getElementById('tree-detail-icon');
  const treeDetailName = document.getElementById('tree-detail-name');
  const treeDetailDesc = document.getElementById('tree-detail-desc');
  const treeDetailStatus = document.getElementById('tree-detail-status');
  const btnTreeConfirm = document.getElementById('btn-tree-confirm');

  // Descriptions live in UPGRADES; BUILD_VECTORS holds effects — merge both.
  const TREE_DESC = {};
  for (let i = 0; i < UPGRADES.length; i++) TREE_DESC[UPGRADES[i].id] = UPGRADES[i].desc || '';

  // Graph layout: polar coordinates around the core (0,0).
  // tier = ring index, angle in degrees (0° = right, 90° = down).
  const SKILL_TREE = {
    // Ring 0 — roots (4 nodes, 90° apart)
    dmg:    { parent: null,      tier: 0, angle: -90 },
    speed:  { parent: null,      tier: 0, angle: 0 },
    multi:  { parent: null,      tier: 0, angle: 90 },
    hp:     { parent: null,      tier: 0, angle: 180 },

    // Ring 1 — evenly spaced per parent sector
    dmg2:     { parent: 'dmg',     tier: 1, angle: -120 },
    crit:     { parent: 'dmg',     tier: 1, angle: -60 },
    rate:     { parent: 'dmg',     tier: 1, angle: -90 },
    
    shield:   { parent: 'hp',      tier: 1, angle: 150 },
    regen:    { parent: 'hp',      tier: 1, angle: 180 },
    healUp:   { parent: 'hp',      tier: 1, angle: 210 },
    
    magnet:   { parent: 'speed',   tier: 1, angle: -30 },
    aspeed:   { parent: 'speed',   tier: 1, angle: 30 },
    
    multi2:   { parent: 'multi',   tier: 1, angle: 60 },
    backshot: { parent: 'multi',   tier: 1, angle: 90 },
    sideshot: { parent: 'multi',   tier: 1, angle: 120 },
    pierce:   { parent: 'multi',   tier: 1, angle: 75 },
    epoison:  { parent: 'multi',   tier: 1, angle: 105 },

    // Ring 2
    dmg3:    { parent: 'dmg2',     tier: 2, angle: -140 },
    crit2:   { parent: 'crit',     tier: 2, angle: -40 },
    rate2:   { parent: 'rate',     tier: 2, angle: -100 },
    bounce:  { parent: 'rate',     tier: 2, angle: -80 },
    through: { parent: 'rate',     tier: 2, angle: -60 },
    
    hp2:     { parent: 'shield',   tier: 2, angle: 130 },
    shield2: { parent: 'shield',   tier: 2, angle: 170 },
    vamp:    { parent: 'regen',    tier: 2, angle: 160 },
    regen2:  { parent: 'regen',    tier: 2, angle: 200 },
    
    melee:   { parent: 'sideshot', tier: 2, angle: 130 },
    efire:   { parent: 'epoison',  tier: 2, angle: 90 },
    enet:    { parent: 'epoison',  tier: 2, angle: 105 },
    eice:    { parent: 'epoison',  tier: 2, angle: 120 },
    
    speed2:  { parent: 'magnet',   tier: 2, angle: -45 },
    magnet2: { parent: 'magnet',   tier: 2, angle: -15 },
    aspeed2: { parent: 'aspeed',   tier: 2, angle: 45 },
    
    multi3:  { parent: 'multi2',   tier: 2, angle: 50 },
    backshot2: { parent: 'backshot', tier: 2, angle: 80 },
    sideshot2: { parent: 'sideshot', tier: 2, angle: 140 },
    pierce2: { parent: 'pierce',   tier: 2, angle: 65 },

    // Ring 3 — deepest upgrades
    bomb:    { parent: 'through',  tier: 3, angle: -50 },
    rate3:   { parent: 'rate2',    tier: 3, angle: -110 },
    multi4:  { parent: 'multi3',   tier: 3, angle: 40 },
    efire2:  { parent: 'efire',    tier: 3, angle: 80 },
    eice2:   { parent: 'eice',     tier: 3, angle: 130 },
    epoison2:{ parent: 'enet',     tier: 3, angle: 100 },
    
    // New weapons
    w_spiral: { parent: 'multi',   tier: 1, angle: 45 },
    w_orbit:  { parent: 'multi2',  tier: 2, angle: 30 },
    w_wave:   { parent: 'multi3',  tier: 3, angle: 20 }
  };
  const TREE_RING_R = [0, 440, 840, 1240];

  // Resolve polar coords to pixel offsets and size the logical canvas.
  const TREE_NODE_R = 34;
  let TREE_W = 0, TREE_H = 0, TREE_HUB = { x: 0, y: 0 };
  (function layoutTree() {
    const pad = TREE_NODE_R + 52;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const id in SKILL_TREE) {
      const n = SKILL_TREE[id];
      const a = n.angle * Math.PI / 180;
      n.x = Math.round(Math.cos(a) * TREE_RING_R[n.tier]);
      n.y = Math.round(Math.sin(a) * TREE_RING_R[n.tier]);
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const ox = pad - minX, oy = pad - minY;
    for (const id in SKILL_TREE) {
      SKILL_TREE[id].x += ox;
      SKILL_TREE[id].y += oy;
    }
    TREE_HUB.x = ox; TREE_HUB.y = oy;
    TREE_W = (maxX - minX) + pad * 2;
    TREE_H = (maxY - minY) + pad * 2;
  })();

  let treeOpen = false;
  let treeSelectedNode = null;
  const treeNodes = {};   // id -> node element
  const treeEdges = {};   // id -> line element (core→root for roots, parent→child otherwise)

  function isNodeTaken(id) {
    return !!(G.player && G.player.build[id]);
  }

  // Available = condition met AND (root OR parent already taken)
  function isNodeAvailable(id) {
    const node = SKILL_TREE[id];
    if (!node || !G.player) return false;
    const vector = BUILD_VECTORS[id];
    if (!vector || !vector.cond(G.player)) return false;
    if (node.parent === null) return true;
    return isNodeTaken(node.parent);
  }

  function renderTree() {
    treeCanvasEl.innerHTML = '';
    treeCanvasEl.style.width = TREE_W + 'px';
    treeCanvasEl.style.height = TREE_H + 'px';
    for (const k in treeNodes) delete treeNodes[k];
    for (const k in treeEdges) delete treeEdges[k];

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', TREE_W);
    svg.setAttribute('height', TREE_H);
    svg.classList.add('tree-edges');

    for (const id in SKILL_TREE) {
      const node = SKILL_TREE[id];
      if (node.parent === null) continue; // Пропускаем корневые узлы
      const from = SKILL_TREE[node.parent];
      if (!from) {
        console.warn(`Skill ${id} has invalid parent: ${node.parent}`);
        continue; // Пропускаем узлы с несуществующим родителем
      }
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', node.x);
      line.setAttribute('y2', node.y);
      svg.appendChild(line);
      treeEdges[id] = line;
    }
    treeCanvasEl.appendChild(svg);

    const hub = document.createElement('div');
    hub.className = 'skill-hub';
    hub.style.left = TREE_HUB.x + 'px';
    hub.style.top = TREE_HUB.y + 'px';
    hub.innerHTML = '<span>ЯДРО</span>';
    treeCanvasEl.appendChild(hub);

    for (const id in SKILL_TREE) {
      const node = SKILL_TREE[id];
      const vector = BUILD_VECTORS[id];
      if (!vector) continue;
      const el = document.createElement('div');
      el.className = 'skill-node';
      el.dataset.nodeId = id;
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      el.style.setProperty('--node-color', vector.color);
      el.innerHTML =
        '<span class="skill-node-icon">' + (vector.icon && ICONS[vector.icon] ? ICONS[vector.icon] : '') + '</span>' +
        '<span class="skill-node-label">' + vector.name + '</span>' +
        '<span class="skill-count"></span>';
      el.addEventListener('click', () => {
        if (treeDragMoved) return;
        treeSelectedNode = id;
        refreshTreeStates();
        showTreeDetail(id);
      });
      treeNodes[id] = el;
      treeCanvasEl.appendChild(el);
    }
  }

  function refreshTreeStates() {
    if (!G.player) return;
    for (const id in SKILL_TREE) {
      const el = treeNodes[id];
      if (!el) continue;
      const available = isNodeAvailable(id);
      const count = G.player.build[id] || 0;
      el.dataset.state = available ? 'available' : (count ? 'taken' : 'locked');
      el.classList.toggle('selected', id === treeSelectedNode);
      const badge = el.querySelector('.skill-count');
      if (badge) badge.textContent = count > 1 ? 'x' + count : '';
    }
    for (const id in treeEdges) {
      const node = SKILL_TREE[id];
      const line = treeEdges[id];
      const parentTaken = node.parent === null ? true : isNodeTaken(node.parent);
      const taken = isNodeTaken(id);
      const available = isNodeAvailable(id);
      if (taken) {
        line.setAttribute('stroke', 'rgba(255,255,255,0.75)');
        line.setAttribute('stroke-width', '3');
      } else if (parentTaken && available) {
        line.setAttribute('stroke', '#6ee7ff');
        line.setAttribute('stroke-width', '3');
      } else {
        line.setAttribute('stroke', 'rgba(255,255,255,0.13)');
        line.setAttribute('stroke-width', '1.5');
      }
    }
  }

  function showTreeDetail(id) {
    const vector = BUILD_VECTORS[id];
    const node = SKILL_TREE[id];
    if (!vector || !node || !G.player) return;
    const count = G.player.build[id] || 0;
    const available = isNodeAvailable(id);

    treeDetailIcon.innerHTML = vector.icon && ICONS[vector.icon] ? ICONS[vector.icon] : '';
    treeDetailIcon.style.color = vector.color;
    treeDetailName.textContent = vector.name;
    treeDetailDesc.textContent = TREE_DESC[id] || '';

    let statusText = '', statusColor = '';
    if (available) {
      statusText = count > 0 ? 'Взято x' + count + ' — можно усилить снова' : 'Доступно к выбору';
      statusColor = '#6ee7ff';
    } else if (node.parent !== null && !isNodeTaken(node.parent)) {
      statusText = 'Сначала возьми: «' + BUILD_VECTORS[node.parent].name + '»';
      statusColor = '#ffae42';
    } else {
      statusText = 'Условие пока не выполнено';
      statusColor = '#ff5a3d';
    }
    treeDetailStatus.textContent = statusText;
    treeDetailStatus.style.color = statusColor;
    if (btnTreeConfirm) btnTreeConfirm.disabled = !available;
  }

  function resetTreeDetail() {
    treeDetailIcon.innerHTML = '';
    treeDetailName.textContent = 'Выбери вершину';
    treeDetailDesc.textContent = 'Нажми на вершину графа, чтобы увидеть улучшение';
    treeDetailStatus.textContent = '';
    if (btnTreeConfirm) btnTreeConfirm.disabled = true;
  }

  function updateTreeHeader() {
    if (!treeSubtitle) return;
    const n = Math.max(0, G.pendingLevels);
    treeSubtitle.textContent = n > 1
      ? 'Вершин к выбору: ' + n + ' — двигайся вглубь дерева'
      : 'Выбери вершину графа и подтверди';
  }

  // ---------- Pan & zoom over the graph ----------
  let view = { x: 0, y: 0, s: 1 };
  let treeDragMoved = false;

  function treeApplyView() {
    treeCanvasEl.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
  }
  function treeZoomAt(px, py, factor) {
    const ns = Math.max(0.35, Math.min(2.4, view.s * factor));
    const k = ns / view.s;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.s = ns;
    treeApplyView();
  }
  function treeFitView() {
    const vw = treeViewport.clientWidth, vh = treeViewport.clientHeight;
    if (!vw || !vh) return;
    const s = Math.max(0.35, Math.min(vw / TREE_W, vh / TREE_H, 1.15));
    view = { s: s, x: (vw - TREE_W * s) / 2, y: (vh - TREE_H * s) / 2 };
    treeApplyView();
  }

  const treePointers = new Map();
  let treePanStart = null;
  let treePinchLast = null;

  function treePinchInfo() {
    const pts = Array.from(treePointers.values());
    return {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      mx: (pts[0].x + pts[1].x) / 2,
      my: (pts[0].y + pts[1].y) / 2
    };
  }

  treeViewport.addEventListener('pointerdown', e => {
    treePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    treeDragMoved = false;
    if (treePointers.size === 1) {
      treePanStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      treePinchLast = null;
    } else if (treePointers.size === 2) {
      treePanStart = null;
      treePinchLast = treePinchInfo();
    }
  });
  window.addEventListener('pointermove', e => {
    if (!treePointers.has(e.pointerId)) return;
    treePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (treePinchLast && treePointers.size >= 2) {
      const pin = treePinchInfo();
      const rect = treeViewport.getBoundingClientRect();
      if (treePinchLast.dist > 8 && pin.dist > 8) {
        treeZoomAt(pin.mx - rect.left, pin.my - rect.top, pin.dist / treePinchLast.dist);
      }
      view.x += pin.mx - treePinchLast.mx;
      view.y += pin.my - treePinchLast.my;
      treeApplyView();
      treePinchLast = pin;
      treeDragMoved = true;
    } else if (treePanStart) {
      const dx = e.clientX - treePanStart.x;
      const dy = e.clientY - treePanStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) treeDragMoved = true;
      view.x = treePanStart.vx + dx;
      view.y = treePanStart.vy + dy;
      treeApplyView();
    }
  });
  function treePointerEnd(e) {
    if (!treePointers.delete(e.pointerId)) return;
    if (treePointers.size < 2) treePinchLast = null;
    if (treePointers.size === 1) {
      const rest = Array.from(treePointers.values())[0];
      treePanStart = { x: rest.x, y: rest.y, vx: view.x, vy: view.y };
    } else if (treePointers.size === 0) {
      treePanStart = null;
    }
  }
  window.addEventListener('pointerup', treePointerEnd);
  window.addEventListener('pointercancel', treePointerEnd);
  treeViewport.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = treeViewport.getBoundingClientRect();
    treeZoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012));
  }, { passive: false });
  window.addEventListener('resize', () => { if (treeOpen) treeFitView(); });

  // ---------- Open / confirm / close ----------
  function openTree() {
    if (!G.player || treeOpen) return;
    treeOpen = true;
    treeSelectedNode = null;
    renderTree();
    refreshTreeStates();
    resetTreeDetail();
    updateTreeHeader();
    panel.classList.remove('hidden');
    G.paused = true;
    requestAnimationFrame(treeFitView);
    ysdkShowBanner();
    yandexGameplayStop();
  }

  function closeTree() {
    treeOpen = false;
    treeSelectedNode = null;
    panel.classList.add('hidden');
    G.paused = false;
    ysdkHideBanner();
    yandexGameplayStart();
  }

  function confirmVector() {
    if (!treeOpen || !G.player || !treeSelectedNode) return;
    const id = treeSelectedNode;
    if (!isNodeAvailable(id)) return;
    BUILD_VECTORS[id].fn(G.player);
    G.player.build[id] = (G.player.build[id] || 0) + 1;
    addText(G.player.x, G.player.y - G.player.r - 10, 'Взято: ' + BUILD_VECTORS[id].name, BUILD_VECTORS[id].color);
    SFX.level();
    G.pendingLevels--;
    treeSelectedNode = null;
    if (G.pendingLevels > 0 && G.levelUpPending) {
      refreshTreeStates();
      resetTreeDetail();
      updateTreeHeader();
    } else {
      G.pendingLevels = 0;
      G.levelUpPending = false;
      closeTree();
    }
  }

  function onLevelUp() {
    if (G.levelUpPending && G.state === 'play') openTree();
  }

  if (btnTreeConfirm) btnTreeConfirm.addEventListener('click', () => {
    confirmVector();
    if (btnTreeConfirm.blur) btnTreeConfirm.blur();
  });

  // ======================= Build panel =======================
  const UPMAP = {};
  for (const u of UPGRADES) UPMAP[u.id] = u;

  const buildPanel = document.getElementById('build-panel');
  const buildList = document.getElementById('build-list');
  const btnBuild = document.getElementById('btn-build');
  const btnBuildClose = document.getElementById('btn-build-close');

  function buildHtml(p) {
    const parts = [];
    const wep = p.bombMode ? WEAPONS.bomb : (WEAPONS[p.weapon] || {});
    parts.push('<div class="build-section">Оружие</div>');
    parts.push('<div class="build-row"><span class="build-name">' + wep.name + '</span></div>');

    const elMap = { fire: 'огонь', ice: 'лёд', poison: 'яд', web: 'паутина' };
    if (p.element) {
      parts.push('<div class="build-section">Стихия</div>');
      parts.push('<div class="build-row"><span class="build-name">' + (elMap[p.element] || p.element) + '</span></div>');
    }

    const proj = [];
    if (p.frontAdd) proj.push('спереди ' + (1 + p.frontAdd) + ' сп.');
    if (p.backShots) proj.push('сзади ' + p.backShots + ' сп.');
    if (p.sideShots) proj.push('по бокам ' + p.sideShots + ' сп.');
    if (proj.length) {
      parts.push('<div class="build-section">Снаряды</div>');
      parts.push('<div class="build-row"><span class="build-name">' + proj.join(' · ') + '</span></div>');
    }
    if (p.weapon === 'necro') {
      parts.push('<div class="build-section">Миньоны</div>');
      parts.push('<div class="build-row"><span class="build-name">' + minionCap(p) + ' шт.</span></div>');
    }

    const build = p.build || {};
    let any = false;
    for (const id in build) {
      const u = UPMAP[id];
      if (!u) continue;
      any = true;
      parts.push('<div class="build-row" style="color:' + u.color + '">' +
        (ICONS[u.icon] ? '<span>' + ICONS[u.icon] + '</span>' : '') +
        '<span class="build-name">' + u.name + '</span>' +
        (build[id] > 1 ? '<span class="build-count">x' + build[id] + '</span>' : '') +
        '</div>');
    }
    if (any) parts.splice(0, 0, '<div class="build-section">Улучшения</div>');
    return parts.join('');
  }

  function updateBuildPanel() {
    if (buildList && G.player) buildList.innerHTML = buildHtml(G.player);
  }

  if (btnBuild) btnBuild.addEventListener('click', () => {
    updateBuildPanel();
    buildPanel.classList.toggle('hidden');
    btnBuild.blur && btnBuild.blur();
  });
  if (btnBuildClose) btnBuildClose.addEventListener('click', () => buildPanel.classList.add('hidden'));

  // ======================= Pickups update =======================
  function applyPickup(p, type) {
    const d = PU_TYPES[type];
    switch (type) {
      case 'power': p.buff.power = d.dur; break;
      case 'haste': p.buff.haste = d.dur; break;
      case 'swift': p.buff.swift = d.dur; break;
      case 'magnet': p.buff.magnet = d.dur; break;
      case 'multi': p.buff.multi = d.dur; break;
      case 'vamp': p.buff.vamp = d.dur; break;
      case 'shield': p.shield = Math.min(80, p.shield + 50); break;
      case 'heal': p.hp = Math.min(p.maxHp, p.hp + (40 + p.maxHp * 0.2) * (p.healingMult || 1)); break;
      case 'bomb': enterBombMode(p); break;
      case 'bombFreeze': enterBombMode(p); p.element = 'ice'; break;
      case 'bombFire': enterBombMode(p); p.element = 'fire'; break;
      case 'bombPoison': enterBombMode(p); p.element = 'poison'; break;
      case 'net': enterBombMode(p); p.element = 'web'; break;
    }
    SFX.pickup();
    addText(p.x, p.y - p.r - 10, d.name, d.color);
  }

  // ======================= Spawning =======================
  function updateSpawner(dt) {
    if (G.waveState === 'break') {
      G.breakTimer -= dt;
      if (G.breakTimer <= 0) { G.wave++; startWave(); }
      return;
    }
    // бой: спавним из очереди волны
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0 && G.waveQueue > 0) {
      G.waveQueue--;
      spawnBot();
      G.spawnTimer = clamp(2.1 - G.wave * 0.14, 0.7, 2.1);
    }
    // пикапы продолжают спавниться
    G.pickupTimer -= dt;
    if (G.pickupTimer <= 0 && G.pickups.length < 6) {
      const t = PU_BARREL[randi(0, PU_BARREL.length - 1)];
      const spot = freeSpot();
      spawnPickup(t, spot.x, spot.y);
      G.pickupTimer = rand(7, 11);
    }
    // волна зачищена -> перерыв
    if (G.waveQueue === 0 && G.bots.length === 0) {
      G.waveState = 'break';
      G.breakTimer = 4;
      showBanner('ВОЛНА ' + G.wave + ' ОЧИЩЕНА');
      SFX.level();
      const sp = freeSpot();
      spawnPickup(Math.random() < 0.5 ? 'heal' : 'shield', sp.x, sp.y);
    }
  }

  function startWave() {
    const isBoss = G.wave % 4 === 0;
    G.waveQueue = Math.min(5 + G.wave * 2, 40);
    G.spawnTimer = 0.4;
    G.waveState = 'fight';
    showBanner('ВОЛНА ' + G.wave);
    if (isBoss) {
      spawnBoss();
      showBanner('БОСС ' + G.wave);
    } else if (G.wave > 2 && Math.random() < 0.4) {
      spawnMiniBoss();
    }
  }

  // ======================= Update =======================
  let dt = 0;
  function update(step) {
    dt = step;
    if (G.paused) return;
    G.time += dt;

    const p = G.player;
    const move = playerMoveDir();
    const smv = statusMoveMult(p);
    const spd = p.speed * (p.buff.swift > 0 ? 1.3 : 1) * smv;

    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.x += p.dashDx * 950 * dt;
      p.y += p.dashDy * 950 * dt;
      p.iframes = Math.max(p.iframes, 0.15);
      if (Math.random() < 0.7) spawnParticles(p.x + rand(-6, 6), p.y + rand(-6, 6), 1, '#6ee7ff', 40);
    } else {
      p.dashCd = Math.max(0, p.dashCd - dt);
      p.x += move.x * spd * dt;
      p.y += move.y * spd * dt;
    }
    resolveAgainstWalls(p);
    p.x = clamp(p.x, p.r, ARENA.w - p.r);
    p.y = clamp(p.y, p.r, ARENA.h - p.r);
    p.aim = playerAim(p);
    p.iframes = Math.max(0, p.iframes - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.hp = Math.min(p.maxHp, p.hp + p.regen * (p.healingMult || 1) * dt);

    const pstDmg = damageFromStatuses(p, G.level, dt);
    if (pstDmg > 0) {
      p.hp -= pstDmg;
      if (Math.random() < 0.4 && p.hp > 0) {
        spawnParticles(p.x + rand(-16, 16), p.y + rand(-16, 16), 1,
          p.st.burn > 0 ? '#ff7a3d' : '#8bd450', 50);
      }
      if (p.hp <= 0) { gameOver(); return; }
    }

    // buff timers
    for (const k in p.buff) p.buff[k] = Math.max(0, p.buff[k] - dt);

    playerShoot(p);

    // melee auto-attack
    if (p.melee) {
      p.meleeSwing = Math.max(0, p.meleeSwing - dt);
      p.meleeTimer -= dt;
      const effVamp = p.vampirism + (p.buff.vamp > 0 ? 0.25 : 0);
      let inRange = false;
      for (const b of G.bots.slice()) {
        if (!b.hp || b.hp <= 0) continue;
        if (dist2(p.x, p.y, b.x, b.y) < (p.meleeRange + b.r) * (p.meleeRange + b.r)) { inRange = true; break; }
      }
      if (inRange && p.meleeTimer <= 0) {
        const mdmg = (p.meleeDmg + p.dmg * 0.5) * activeDmgMult(p);
        p.meleeTimer = 0.8;
        p.meleeSwing = 0.18;
        G.shake = Math.min(G.shake + 3, 8);
        for (const b of G.bots.slice()) {
          if (b.hp > 0 && dist2(p.x, p.y, b.x, b.y) < (p.meleeRange + b.r) * (p.meleeRange + b.r)) {
            b.hp -= mdmg;
            b.flash = 0.1;
            spawnParticles(b.x, b.y, 6, '#ff7a3d', 120);
            addText(b.x, b.y - b.r - 6, String(Math.round(mdmg)), '#ff7a3d');
            if (effVamp > 0) {
              p.hp = Math.min(p.maxHp, p.hp + mdmg * effVamp * (p.healingMult || 1));
            }
            if (b.hp <= 0) { G.kills++; killBot(b); }
          }
        }
        SFX.hit();
      }
    }

    updateSpawner(dt);

    // Bombs (fired via bomb weapon)
    updateBombs(dt);
    updateBeams(dt);
    updateBoomerangs(dt);
    updateMinions(dt);
    updatePuddles(dt);

    for (let bi = G.bots.length - 1; bi >= 0; bi--) {
      const b = G.bots[bi];
      botThink(b, dt);
      b.flash = Math.max(0, b.flash - dt);
      const sDmg = damageFromStatuses(b, G.level, dt);
      if (b.shieldHp !== undefined && b.shieldHp < b.shieldMax) b.shieldHp = Math.min(b.shieldMax, b.shieldHp + 4 * dt);
      if (sDmg > 0) {
        b.hp -= sDmg;
        if (Math.random() < 0.35) {
          spawnParticles(b.x + rand(-b.r, b.r), b.y + rand(-b.r, b.r), 1,
            b.st.burn > 0 ? '#ff7a3d' : '#8bd450', 55);
        }
        if (b.hp <= 0) { G.kills++; killBot(b); }
      }
    }

    // Коллизия юнитов: игрок + боты + миньоны не проходят сквозь друг друга
    separateUnits();

    // Pickups collection
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const pu = G.pickups[i];
      pu.ttl -= dt;
      if (pu.ttl <= 0) { G.pickups.splice(i, 1); continue; }
      if (dist2(p.x, p.y, pu.x, pu.y) < (p.r + 14) * (p.r + 14)) {
        applyPickup(p, pu.type);
        spawnParticles(pu.x, pu.y, 10, pu.def.color, 140);
        G.pickups.splice(i, 1);
      }
    }

    // Arrows
    for (let i = G.arrows.length - 1; i >= 0; i--) {
      const ar = G.arrows[i];
      
      // Handle orbit projectiles for player
      if (ar.ownerType === 'player' && p.orbitProjectiles && p.orbitProjectiles.length > 0) {
        // This arrow is part of orbit weapon - update its position based on orbit data
        const orbitIdx = i % p.orbitProjectiles.length;
        if (p.orbitProjectiles[orbitIdx]) {
          const orbit = p.orbitProjectiles[orbitIdx];
          orbit.angle += orbit.speed * dt;
          ar.x = p.x + Math.cos(orbit.angle) * orbit.radius;
          ar.y = p.y + Math.sin(orbit.angle) * orbit.radius;
          ar.life -= dt;
          ar.px0 = ar.x - ar.vx * dt;
          ar.py0 = ar.y - ar.vy * dt;
        }
      } else {
        ar.px0 = ar.x;
        ar.py0 = ar.y;
        ar.x += ar.vx * dt;
        ar.y += ar.vy * dt;
        ar.life -= dt;
      }
      
      if (ar.life <= 0 || ar.x < -20 || ar.x > ARENA.w + 20 || ar.y < -20 || ar.y > ARENA.h + 20) {
        G.arrows.splice(i, 1);
        continue;
      }
      if (arrowWallPass(ar, dt)) {
        G.arrows.splice(i, 1);
        continue;
      }
      if (ar.dead) { G.arrows.splice(i, 1); continue; }

      if (ar.ownerType === 'player') {
        for (const b of G.bots.slice()) {
          if (b.hp <= 0) continue;
          if (ar.pierce < 0) break;
          if (dist2(ar.x, ar.y, b.x, b.y) < (b.r + 4) * (b.r + 4)) {
            arrowHit(ar, b, false);
          }
        }
        if (ar.pierce < 0) { G.arrows.splice(i, 1); continue; }
      } else {
        if (G.player.iframes <= 0 && dist2(ar.x, ar.y, G.player.x, G.player.y) < (G.player.r + 4) * (G.player.r + 4)) {
          arrowHit(ar, G.player, true);
          G.arrows.splice(i, 1);
          continue;
        }
        if (!ar.dead) {
          for (const b of G.bots.slice()) {
            if (b === ar.owner) continue;
            if (b.hp <= 0) continue;
            if (ar.pierce < 0) break;
            if (dist2(ar.x, ar.y, b.x, b.y) < (b.r + 4) * (b.r + 4)) {
              arrowHit(ar, b, false);
            }
          }
          if (ar.dead || ar.pierce < 0) { G.arrows.splice(i, 1); continue; }
        }
      }
    }

    // Gems
    updateGems(p, dt);

    // Particles
    for (const pt of G.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.9;
      pt.vy *= 0.9;
      pt.life -= dt;
    }
    let wp = 0;
    for (let pi = 0; pi < G.particles.length; pi++) {
      const pt = G.particles[pi];
      if (pt.life > 0) G.particles[wp++] = pt;
    }
    G.particles.length = wp;

    // Texts
    for (const t of G.texts) { t.y -= 40 * dt; t.life -= dt; }
    let wt = 0;
    for (let ti = 0; ti < G.texts.length; ti++) {
      const t = G.texts[ti];
      if (t.life > 0) G.texts[wt++] = t;
    }
    G.texts.length = wt;

    // Camera
    const cam = G.cam;
    cam.x += (p.x - cam.x) * Math.min(1, dt * 5);
    cam.y += (p.y - cam.y) * Math.min(1, dt * 5);
    G.shake = Math.max(0, G.shake - dt * 30);

if (G.levelUpPending) {
    if (G.state !== 'play') {
      // смерть поверх левел-апа: не показываем панель, сбрасываем
      G.levelUpPending = false;
      G.pendingLevels = 0;
      if (treeOpen) closeTree();
    } else {
      onLevelUp();
    }
  }
  }

  // ======================= Render =======================
  const hudLevel = document.getElementById('hud-level');
  const hudWeapon = document.getElementById('hud-weapon');
  const hudBombs = document.getElementById('hud-bombs');
  const hudKills = document.getElementById('hud-kills');
  const hudTime = document.getElementById('hud-time');
  const hudHp = document.getElementById('hud-hp');
  const hudXp = document.getElementById('hud-xp');
  const buffbar = document.getElementById('buffbar');
  const bossWrap = document.getElementById('bossbar-wrap');
  const bossFill = document.getElementById('boss-bar-fill');
  const dashFill = document.getElementById('dash-fill');
  const statusChips = document.getElementById('status-chips');
  const bannerEl = document.getElementById('banner');

  function render() {
    const scale = Math.min(CW, CH) / VIEW;
    visW = CW / 2 / scale + 80;
    visH = CH / 2 / scale + 80;
    const shx = (Math.random() - 0.5) * G.shake;
    const shy = (Math.random() - 0.5) * G.shake;

    drawBackground();

    ctx.save();
    ctx.translate(CW / 2 + shx, CH / 2 + shy);
    ctx.scale(scale, scale);
    ctx.translate(-G.cam.x, -G.cam.y);

    drawWalls();
    drawPuddles();
    drawGems();
    drawPickups();
    drawBots();
    drawArrows();
    drawBombs();
    drawBeams();
    drawBoomerangs();
    drawMinions();
    if (G.player) drawPlayer();
    drawParticles();
    drawTexts();

    ctx.restore();

    drawVignette();
    drawMinimap();
    updateHUD();
  }

  function drawMinimap() {
    if (!G.player) return;
    const mw = 110, mh = 110, mx = CW - mw - 10, my = CH - mh - 12;
    const sx = mw / ARENA.w, sy = mh / ARENA.h;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(8,12,20,0.7)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(110,231,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    // границы арены
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(mx, my, mw, mh);
    // боты
    for (const b of G.bots) {
      if (b.boss) { ctx.fillStyle = '#ff2d55'; }
      else if (b.elite) { ctx.fillStyle = '#c9b1ff'; }
      else { ctx.fillStyle = b.color; }
      ctx.fillRect(mx + b.x * sx - 1, my + b.y * sy - 1, 2, 2);
    }
    // кристаллы
    ctx.fillStyle = '#6ee7ff';
    for (const g of G.gems) { ctx.fillRect(mx + g.x * sx, my + g.y * sy, 2, 2); }
    // пикапы
    ctx.fillStyle = '#ffd23e';
    for (const pu of G.pickups) { ctx.fillRect(mx + pu.x * sx, my + pu.y * sy, 2, 2); }
    // игрок
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx + G.player.x * sx - 2, my + G.player.y * sy - 2, 4, 4);
    ctx.globalAlpha = 1;
  }

  var _bgGrad = null, _vigGrad = null;
  function refreshGradients() {
    _bgGrad = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, Math.max(CW, CH) * 0.7);
    _bgGrad.addColorStop(0, '#111827');
    _bgGrad.addColorStop(1, '#070a11');
    _vigGrad = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.3, CW / 2, CH / 2, Math.max(CW, CH) * 0.75);
    _vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    _vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
  }
  refreshGradients();

  function drawBackground() {
    ctx.fillStyle = _bgGrad;
    ctx.fillRect(0, 0, CW, CH);
  }

  function drawVignette() {
    ctx.fillStyle = _vigGrad;
    ctx.fillRect(0, 0, CW, CH);
  }

  function drawWalls() {
    for (const w of G.walls) {
      if (w.x + w.w < G.cam.x - visW || w.x > G.cam.x + visW || w.y + w.h < G.cam.y - visH || w.y > G.cam.y + visH) continue;
      ctx.fillStyle = '#1a2233';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(w.x, w.y, w.w, 6);
      ctx.strokeStyle = 'rgba(110,231,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }
    // arena border
    ctx.strokeStyle = 'rgba(110,231,255,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, ARENA.w, ARENA.h);
  }

  function drawGems() {
    const rot = performance.now() / 500;
    for (const g of G.gems) {
      if (!onScreen(g.x, g.y)) continue;
      if (g.ttl < 3 && Math.floor(performance.now() / 150) % 2 === 0) continue;
      const a = rot + g.x;
      const c = Math.cos(a), s = Math.sin(a);
      const ry = g.r * 1.4;
      ctx.fillStyle = '#6ee7ff';
      ctx.beginPath();
      ctx.moveTo(g.x + s * ry, g.y - c * ry);
      ctx.lineTo(g.x + c * g.r, g.y + s * g.r);
      ctx.lineTo(g.x - s * ry, g.y + c * ry);
      ctx.lineTo(g.x - c * g.r, g.y - s * g.r);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPickups() {
    for (const pu of G.pickups) {
      if (!onScreen(pu.x, pu.y)) continue;
      const blink = pu.ttl < 3 && Math.floor(performance.now() / 150) % 2 === 0;
      if (blink) continue;
      const pulse = 1 + Math.sin(performance.now() / 300 + pu.ph) * 0.12;
      const rr = 16 * pulse;
      ctx.fillStyle = pu.def.color;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, rr, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, rr * 0.81, 0, TAU);
      ctx.strokeStyle = pu.def.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#0b0e14';
      ctx.font = 'bold 13px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pu.def.letter, pu.x, pu.y + 1);
    }
  }

  function drawBots() {
    for (const b of G.bots) {
      if (!onScreen(b.x, b.y)) continue;
      let br = b.r;
      if (b.boss) {
        const pulse = 1 + Math.sin(performance.now() / 250) * 0.06;
        br = b.r * pulse;
        ctx.strokeStyle = 'rgba(255,45,85,0.4)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, br + 12, 0, TAU);
        ctx.stroke();
      } else if (b.role === 'miniboss') {
        const pulse = 1 + Math.sin(performance.now() / 200) * 0.07;
        ctx.strokeStyle = 'rgba(255,110,168,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * pulse + 10, 0, TAU);
        ctx.stroke();
      }
      if (b.shieldHp !== undefined && b.shieldHp > 0) {
        const shR = br + 5 + Math.sin(performance.now() / 200 + b.seed) * 1.5;
        ctx.fillStyle = 'rgba(110,231,255,0.22)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, shR, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(110,231,255,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, shR, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = b.flash > 0 ? '#ffffff' : b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, br, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, br * 0.35, 0, TAU);
      ctx.fill();

      // weapon hint
      if (b.w && b.w.ranged) {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.w.label === 'Снайпер' ? 2 : 2.5;
        const l = br + 10 + (b.w.label === 'Снайпер' ? 6 : 0);
        ctx.beginPath();
        if (b.w.label === 'Снайпер') {
          ctx.moveTo(b.x - l * 0.5, b.y);
          ctx.lineTo(b.x + l, b.y);
        } else if (b.w.label === 'Стрелок') {
          for (let i = -2; i <= 2; i++) {
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x + l, b.y + i * 6);
          }
        } else {
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x + l, b.y - 3);
        }
        ctx.stroke();
      }

      // rusher windup warning arc
      if (b.w && !b.w.ranged && b.meleeWindup > 0) {
        const a = Math.atan2(G.player.y - b.y, G.player.x - b.x);
        const prog = 1 - b.meleeWindup / 0.35;
        ctx.strokeStyle = 'rgba(255,60,60,' + (0.35 + 0.65 * prog).toFixed(2) + ')';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, br + 14, a - 0.6, a + 0.6);
        ctx.stroke();
      }

      // crown for elite
      if (b.elite) {
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath();
        ctx.moveTo(b.x - 9, b.y - br - 8);
        ctx.lineTo(b.x - 9, b.y - br - 18);
        ctx.lineTo(b.x - 3, b.y - br - 12);
        ctx.lineTo(b.x, b.y - br - 20);
        ctx.lineTo(b.x + 3, b.y - br - 12);
        ctx.lineTo(b.x + 9, b.y - br - 18);
        ctx.lineTo(b.x + 9, b.y - br - 8);
        ctx.closePath();
        ctx.fill();
      }
      if (b.hp < b.maxHp) {
        const w = br * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(b.x - w / 2, b.y - br - 8, w, 4);
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - w / 2, b.y - br - 8, w * (b.hp / b.maxHp), 4);
      }

      const stt = statusTint(b.st);
      if (stt) {
        ctx.globalAlpha = stt.a;
        ctx.fillStyle = stt.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, br + 3, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (b.st.freeze > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.6;
          for (let i = 0; i < 3; i++) {
            const a = b.seed * 2 + i * 2.1;
            ctx.beginPath();
            ctx.arc(b.x + Math.cos(a) * br * 0.6, b.y + Math.sin(a) * br * 0.6, 1.5, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function drawArrows() {
    ctx.save();
    ctx.lineCap = 'round';
    for (const ar of G.arrows) {
      if (!onScreen(ar.x, ar.y)) continue;
      const len = 16;
      const bx = ar.x - Math.cos(ar.angle) * len;
      const by = ar.y - Math.sin(ar.angle) * len;
      ctx.strokeStyle = ar.ownerType === 'player'
        ? (ar.crit ? '#ffd23e' : '#dbe4ff')
        : '#ff4d6d';
      ctx.lineWidth = ar.ownerType === 'player' ? 3 : 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ar.x, ar.y);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(ar.x, ar.y);
      ctx.lineTo(ar.x - Math.cos(ar.angle) * 10 - Math.cos(ar.angle + 2.5) * 5, ar.y - Math.sin(ar.angle) * 10 - Math.sin(ar.angle + 2.5) * 5);
      ctx.lineTo(ar.x - Math.cos(ar.angle) * 10 - Math.cos(ar.angle - 2.5) * 5, ar.y - Math.sin(ar.angle) * 10 - Math.sin(ar.angle - 2.5) * 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = G.player;
    const blink = p.iframes > 0 && Math.floor(performance.now() / 60) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = blink ? 0.35 : 1;

    const w = p.bombMode ? WEAPONS.bomb : (WEAPONS[p.weapon] || WEAPONS.bow);
    // shield ring
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(110,231,255,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 6, 0, TAU);
      ctx.stroke();
    }

    if (p.flash > 0) ctx.fillStyle = '#ffffff';
    else ctx.fillStyle = '#e8ecff';
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7c6eff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // nose / weapon indicator
    ctx.fillStyle = p.flash > 0 ? '#ffffff' : w.color;
    ctx.rotate(p.aim);
    ctx.beginPath();
    ctx.moveTo(p.r + 6, 0);
    ctx.lineTo(p.r - 4, -6);
    ctx.lineTo(p.r - 4, 6);
    ctx.closePath();
    ctx.fill();

    if (p.melee && p.meleeSwing > 0) {
      // sword arc
      ctx.strokeStyle = 'rgba(255,122,61,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, p.meleeRange * 0.7, -0.9, 0.9);
      ctx.stroke();
    }

    ctx.restore();

    // status ring (after restoring transform so it stays round on screen)
    const pstt = statusTint(p.st);
    if (pstt) {
      ctx.globalAlpha = pstt.a;
      ctx.strokeStyle = pstt.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawBeams() {
    for (const bm of G.beams) {
      if (!onScreen(bm.x, bm.y)) continue;
      const ex = bm.x + Math.cos(bm.angle) * bm.range;
      const ey = bm.y + Math.sin(bm.angle) * bm.range;
      const a = clamp(bm.life / bm.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ff3b6b';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bm.x, bm.y); ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = '#ffd9e0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bm.x, bm.y); ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawBoomerangs() {
    for (const bm of G.boomerangs) {
      if (!onScreen(bm.x, bm.y)) continue;
      ctx.save();
      ctx.translate(bm.x, bm.y);
      ctx.rotate(bm.angle);
      ctx.strokeStyle = '#ffae42';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0.4, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(7, 4); ctx.lineTo(10, 1); ctx.lineTo(9, -2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBombs() {
    for (const b of G.bombs) {
      if (!onScreen(b.x, b.y)) continue;
      const T = BOMB_TYPES[b.type] || BOMB_TYPES.normal;
      if (b.flying) {
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        const c = Math.cos(b.x), s = Math.sin(b.x);
        ctx.fillStyle = T.color;
        ctx.beginPath();
        ctx.arc(b.x + c * b.r * 0.6, b.y + s * b.r * 0.6, b.r * 0.6, 0, TAU);
        ctx.fill();
      } else {
        const blink = Math.floor(performance.now() / 120) % 2 === 0;
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = blink ? '#ff4d6d' : T.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawParticles() {
    for (const pt of G.particles) {
      if (!onScreen(pt.x, pt.y)) continue;
      if (pt.ring) {
        ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r * (1 - pt.life / pt.maxLife) * 0.9 + 10, 0, TAU);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    for (const t of G.texts) {
      if (!onScreen(t.x, t.y)) continue;
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.font = 'bold 13px Segoe UI, sans-serif';
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  const BUFF_META = {
    power: { letter: 'P', color: '#ff7a3d' },
    haste: { letter: 'H', color: '#ffd23e' },
    swift: { letter: 'U', color: '#6ee7ff' },
    magnet: { letter: 'M', color: '#7ce7a2' },
    multi: { letter: 'X', color: '#38e08c' },
    vamp: { letter: 'V', color: '#ff5a8f' },
    xp: { letter: '2x', color: '#ffd23e' },
    dmg: { letter: 'D2', color: '#ff7a3d' }
  };

  function updateHUD() {
    const m = Math.floor(G.time / 60);
    const s = Math.floor(G.time % 60);
    hudTime.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (!G.player) return;
    const p = G.player;
    hudLevel.textContent = 'Lv ' + G.level;
    hudWeapon.textContent = p.bombMode ? 'Бомбомёт' : WEAPONS[p.weapon].name;
    const parts = [];
    if (p.bombMode) parts.push('B');
    const elL = { fire: 'F', ice: 'L', poison: 'Y', web: 'N' };
    if (p.element && elL[p.element]) parts.push(elL[p.element]);
    hudBombs.textContent = parts.length ? parts.join(' ') : '0';
    hudKills.textContent = 'Kills ' + G.kills;
    hudHp.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
    hudXp.style.width = clamp(G.xp / G.xpNext * 100, 0, 100) + '%';
    if (dashFill) {
      const dscale = p.dashTime > 0 && p.dashCd > 0 ? 0 : clamp(1 - p.dashCd / 3.2, 0, 1);
      dashFill.style.transform = 'scaleX(' + dscale + ')';
    }

    let buffHtml = '';
    for (const k in BUFF_META) {
      if (p.buff[k] > 0) buffHtml += '<div class="buff-chip" style="background:' + BUFF_META[k].color + '">' + BUFF_META[k].letter + '</div>';
    }
    if (buffbar.__last !== buffHtml) { buffbar.innerHTML = buffHtml; buffbar.__last = buffHtml; }

    let stHtml = '';
    for (const k in STATUS_META) {
      if (p.st[k] > 0) stHtml += '<div class="status-chip" style="background:' + STATUS_META[k].color + ';box-shadow:0 0 6px ' + STATUS_META[k].color + '" title="' + STATUS_META[k].name + '"></div>';
    }
    if (statusChips.__last !== stHtml) { statusChips.innerHTML = stHtml; statusChips.__last = stHtml; }

    let boss = null;
    for (const b of G.bots) if (b.boss) { boss = b; break; }
    if (boss) {
      bossWrap.classList.remove('hidden');
      bossFill.style.width = clamp(boss.hp / boss.maxHp * 100, 0, 100) + '%';
    } else {
      bossWrap.classList.add('hidden');
    }
  }

  function showBanner(text) {
    bannerEl.textContent = text;
    bannerEl.classList.remove('hidden');
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
  }

  // ======================= Screens =======================
  const startScreen = document.getElementById('start-screen');
  const overScreen = document.getElementById('over-screen');
  const overStats = document.getElementById('over-stats');
  const btnRevive = document.getElementById('btn-revive');

  function bestScore() {
    try { return parseInt(localStorage.getItem('needleio_best') || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(score) {
    try { if (score > bestScore()) localStorage.setItem('needleio_best', String(score)); } catch (e) {}
  }
  const startBest = document.getElementById('start-best');
  function updateStartRecord() {
    if (startBest) startBest.textContent = bestScore() > 0 ? 'Рекорд: ' + bestScore() : '';
  }
  updateStartRecord();

  function startGame() {
    audioInit();
    G.state = 'play';
    G.time = 0;
    G.kills = 0;
    G.level = 1;
    G.xp = 0;
    G.xpNext = xpNextFor(1);
    G.player = createPlayer();
    G.bots = [];
    G.arrows = [];
    G.bombs = [];
    G.beams = [];
    G.boomerangs = [];
    G.minions = [];
    G.puddles = [];
    G.gems = [];
    G.pickups = [];
    G.particles = [];
    G.texts = [];
    G.spawnTimer = 0.3;
    G.pickupTimer = 6;
    G.wave = 1;
    G.waveState = 'fight';
    G.waveQueue = 10;
    G.breakTimer = 0;
    G.shake = 0;
    G.paused = false;
    G.pauseOpen = false;
    G.levelUpPending = false;
    G.pendingLevels = 0;
    G.canRevive = true;
    G.lastInterstitial = 0;
    G.mobileFiring = false; // Reset mobile fire state
    G.walls = genWalls();
    G.cam.x = G.player.x;
    G.cam.y = G.player.y;
    showBanner('ВОЛНА 1');

    startScreen.classList.add('hidden');
    overScreen.classList.add('hidden');
    panel.classList.add('hidden');
    treeOpen = false;
    bannerEl.classList.add('hidden');
    document.getElementById('hud').style.opacity = 1;
    ysdkHideBanner();
    yandexGameplayStart();
  }

  function gameOver() {
    if (G.state === 'over') return;
    G.state = 'over';
    G.paused = true;
    G.pauseOpen = false;
    const po = document.getElementById('pause-overlay');
    if (po) po.classList.add('hidden');
    spawnParticles(G.player.x, G.player.y, 30, '#ff4d6d', 300);
    SFX.hurt();
    const m = Math.floor(G.time / 60);
    const s = Math.floor(G.time % 60);
    const score = G.level * 100 + G.kills * 50 + Math.round(G.time);
    saveBest(score);
    overStats.innerHTML =
      'Уровень: ' + G.level + '<br>' +
      'Убито ботов: ' + G.kills + '<br>' +
      'Время: ' + m + ':' + (s < 10 ? '0' : '') + s + '<br>' +
      'Очки: ' + score + (score >= bestScore() && score > 0 ? ' (Новый рекорд!)' : ' (Рекорд: ' + bestScore() + ')');
    if (G.canRevive && ysdkAdv()) {
      btnRevive.classList.remove('hidden');
    } else {
      btnRevive.classList.add('hidden');
    }
    overScreen.classList.remove('hidden');
    ysdkShowInterstitial();
    ysdkShowBanner();
    yandexGameplayStop();
  }

  function reviveGame() {
    if (!G.canRevive || G.state !== 'over') return;
    ysdkShowRewarded().then(ok => {
      if (!ok) return; // неудачная/закрытая реклама — попытка не тратится
      G.canRevive = false;
      btnRevive.classList.add('hidden');
      const p = G.player;
      p.hp = p.maxHp;
      p.st = { freeze: 0, burn: 0, poison: 0, net: 0 };
      p.iframes = 2;
      G.state = 'play';
      G.paused = false;
      overScreen.classList.add('hidden');
      ysdkHideBanner();
      yandexGameplayStart();
    });
  }

  const btnStart = document.getElementById('btn-start');
  const btnRestart = document.getElementById('btn-restart');
  btnStart.addEventListener('click', () => { startGame(); btnStart.blur(); });
  btnRestart.addEventListener('click', () => { startGame(); btnRestart.blur(); });
  btnRevive.addEventListener('click', () => { reviveGame(); btnRevive.blur(); });

  const btnPauseResume = document.getElementById('btn-pause-resume');
  const btnPauseRestart = document.getElementById('btn-pause-restart');
  const btnRewXp = document.getElementById('btn-rew-xp');
  const btnRewDmg = document.getElementById('btn-rew-dmg');
  if (btnPauseResume) btnPauseResume.addEventListener('click', () => { closePause(); btnPauseResume.blur(); });
  if (btnPauseRestart) btnPauseRestart.addEventListener('click', () => { closePause(); startGame(); btnPauseRestart.blur(); });
  if (btnRewXp) btnRewXp.addEventListener('click', function (e) { grantRewarded('xp'); e.currentTarget && e.currentTarget.blur(); });
  if (btnRewDmg) btnRewDmg.addEventListener('click', function (e) { grantRewarded('dmg'); e.currentTarget && e.currentTarget.blur(); });

  function grantRewarded(kind) {
    ysdkShowRewarded().then(ok => {
      if (ok) {
        const p = G.player;
        if (p) {
          if (kind === 'xp') { p.buff.xp = 30; addText(p.x, p.y - 40, 'Двойной опыт 30с!', '#ffd23e'); }
          else if (kind === 'dmg') { p.buff.dmg = 20; addText(p.x, p.y - 40, 'Урон x2 20с!', '#ff7a3d'); }
        }
      }
      closePause();
    });
  }
  window.addEventListener('keydown', e => {
    if (G.state === 'play' && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault();
    if (G.state === 'play' && e.code === 'Space') tryDash();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (G.pauseOpen) closePause();
      else openPause();
    }
    if (e.code === 'Enter' && treeOpen) { confirmVector(); return; }
    if (e.code === 'Enter' && G.state === 'menu') startGame();
    if (e.code === 'Enter' && G.state === 'over') startGame();
  });

  function tryDash() {
    const p = G.player;
    if (!p || p.dashTime > 0 || p.dashCd > 0 || G.paused) return;
    const mv = playerMoveDir();
    let dx = mv.x, dy = mv.y;
    if (dx === 0 && dy === 0) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
    p.dashDx = dx; p.dashDy = dy;
    p.dashTime = 0.16;
    p.dashCd = 3.2;
    spawnParticles(p.x, p.y, 10, '#6ee7ff', 140);
    SFX.shoot();
  }

  function openPause() {
    if (G.state !== 'play' || G.levelUpPending || G.pauseOpen) return;
    G.pauseOpen = true;
    G.paused = true;
    const po = document.getElementById('pause-overlay');
    if (po) po.classList.remove('hidden');
    ysdkShowBanner();
    yandexGameplayStop();
  }
  function closePause() {
    if (!G.pauseOpen) return;
    G.pauseOpen = false;
    G.paused = false;
    const po = document.getElementById('pause-overlay');
    if (po) po.classList.add('hidden');
    ysdkHideBanner();
    yandexGameplayStart();
  }
  if (document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G.state === 'play') openPause();
    });
  }

  // ======================= Loop =======================
  let last = performance.now();
  function loop(now) {
    const step = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.state === 'play') update(step);
    render();
    requestAnimationFrame(loop);
  }

  // ======================= Yandex SDK (safe wrappers) =======================
  let YSDK = null;
  function ysdkAdv() {
    if (!YSDK) return null;
    try { return YSDK.Adv || (YSDK.features && YSDK.features.Adv) || null; } catch (e) { return null; }
  }
  function yandexInit() {
    if (!window.YaGames) return;
    try {
      Promise.resolve(window.YaGames.init()).then(ysdk => {
        YSDK = ysdk;
        try { const l = ysdk.features && ysdk.features.LoadingAPI; if (l && l.ready) l.ready(); } catch (e) {}
        ysdkShowBanner();
      }).catch(() => {});
    } catch (e) {}
  }
  function yandexGameplayStart() {
    if (YSDK) { try { const g = YSDK.features && YSDK.features.GameplayAPI; if (g && g.start) g.start(); } catch (e) {} }
  }
  function yandexGameplayStop() {
    if (YSDK) { try { const g = YSDK.features && YSDK.features.GameplayAPI; if (g && g.stop) g.stop(); } catch (e) {} }
  }
  function ysdkShowRewarded() {
    return new Promise(resolve => {
      const adv = ysdkAdv();
      if (!adv || typeof adv.showRewardedVideo !== 'function') { resolve(false); return; }
      try {
        Promise.resolve(adv.showRewardedVideo({ callbacks: {
          onRewarded: () => resolve(true),
          onClose: () => resolve(false),
          onError: () => resolve(false)
        } })).then(v => {
          if (v === true || v === undefined) resolve(true);
          else if (v === false || v === null) resolve(false);
        }).catch(() => resolve(false));
      } catch (e) { resolve(false); }
    });
  }
  function ysdkShowInterstitial() {
    const adv = ysdkAdv();
    if (!adv || typeof adv.showFullscreenAdv !== 'function') return;
    if (performance.now() - G.lastInterstitial < 60000) return;
    G.lastInterstitial = performance.now();
    try { Promise.resolve(adv.showFullscreenAdv()).catch(() => {}); } catch (e) {}
  }
  function ysdkShowBanner() {
    const adv = ysdkAdv();
    if (!adv || typeof adv.showBannerAdv !== 'function') return;
    try { Promise.resolve(adv.showBannerAdv()).catch(() => {}); } catch (e) {}
  }
  function ysdkHideBanner() {
    const adv = ysdkAdv();
    if (!adv || typeof adv.hideBannerAdv !== 'function') return;
    try { Promise.resolve(adv.hideBannerAdv()).catch(() => {}); } catch (e) {}
  }

  window.addEventListener('load', yandexInit);
  yandexInit();

  window.__G = G;
  window.__CONFIG = { PU_TYPES: PU_TYPES, BUFF_META: BUFF_META, BOMB_TYPES: BOMB_TYPES };
  console.log('NEEDLE.IO v2 loaded — bomb weapon enabled (в консоли эта строка = свежая версия)');

  requestAnimationFrame(loop);
})();