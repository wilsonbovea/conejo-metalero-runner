(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 40;

  const PALETTE = {
    day: {
      skyTop: '#6ec6ff', skyBottom: '#dff3ff',
      sun: '#ffe27a', sunGlow: 'rgba(255,226,122,0.35)',
      hillFar: '#a7dd9b', hillNear: '#7cc477',
      dirt: '#c9a26a', dirtLine: '#a9814f', grass: '#5fae4a',
      text: '#2b2b2b', textShadow: 'rgba(255,255,255,0.6)',
      panel: 'rgba(255,255,255,0.55)',
    },
    night: {
      skyTop: '#0d0221', skyBottom: '#2c1e52',
      moon: '#eef0d5', moonShade: '#cfd2ad', star: '#ffffff',
      hillFar: '#1c1440', hillNear: '#241d55',
      dirt: '#3b2f22', dirtLine: '#2a2118', grass: '#2f5233',
      text: '#f2f2f2', textShadow: 'rgba(0,0,0,0.6)',
      panel: 'rgba(0,0,0,0.45)',
    },
  };

  const RABBIT = {
    fur: '#f7f3ec', furShade: '#dcd5c6', furDeep: '#c3bba8', earInner: '#f4a6c1',
    jacket: '#1c1c1e', jacketHi: '#4a4a4e', stud: '#c9c9cf',
    mohawk: '#e0263f', mohawkDark: '#a3182b',
    glasses: '#111111', lens: '#3a3a3d',
    nose: '#e0507a', boot: '#141414', whisker: '#bdb6a6', blush: 'rgba(240,120,150,0.45)',
    zipper: '#8f8f95', skin: '#e3a878',
  };

  const CACTUS_COLOR = '#3f8f4a', CACTUS_DARK = '#2f6f38';
  const ROCK_COLOR = '#9a9a9a', ROCK_DARK = '#767676';
  const CARROT_BODY = '#ff8a3d', CARROT_DARK = '#e06a1f', CARROT_LEAF = '#3fae4a', CARROT_LEAF_DARK = '#2e8a3a';

  const PREDATOR_STYLES = {
    fox: { body: '#e0742f', dark: '#b85a1f', belly: '#fff3e0', eye: '#ffcf4d' },
    wolf: { body: '#8a8a8a', dark: '#666666', belly: '#e8e8e8', eye: '#e8e46b' },
  };
  const CHASE_BONUS = { fox: 1.3, wolf: 1.8, bird: 1 };
  const BURROW_ROCK_COLOR = '#6b5133', BURROW_ROCK_DARK = '#4a3620';
  const CLAWS_GLOW = '#c9915a', CLAWS_BADGE = '#3a2a1a', CLAWS_MARK = '#e8e0d5';

  const GRAVITY = 0.6;
  const JUMP_VELOCITY = -11.5;
  const START_SPEED = 6;
  const MAX_SPEED = 14;
  const SPEED_INCREMENT = 0.001;
  const NIGHT_SCORE_STEP = 700;
  const METAL_DURATION = 360; // frames (~6s)
  const CLAWS_DURATION = 480; // frames (~8s) — how long the burrow ability stays available
  const BURROW_DEPTH = 34;

  let state = 'waiting'; // waiting | running | gameover
  let speed = START_SPEED;
  let score = 0;
  let highScore = Number(localStorage.getItem('dino_high_score') || 0);
  let isNight = false;
  let frame = 0;
  let groundOffset = 0;
  let hillOffset = 0;

  let metalMode = false;
  let metalTimer = 0;
  let celebrateTimer = 0;
  const CELEBRATE_DURATION = 34;
  let clawsActive = false;
  let clawsTimer = 0;
  let burrowObstacleTimer = 0;
  let downHeld = false;

  const stars = Array.from({ length: 40 }, () => ({
    x: Math.random() * W,
    y: Math.random() * (GROUND_Y - 30),
    r: Math.random() * 1.5 + 0.5,
    phase: Math.random() * Math.PI * 2,
  }));

  let muted = localStorage.getItem('conejo_muted') === '1';

  let audioCtx = null;
  let masterGain = null;
  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(audioCtx.destination);
    }
    return audioCtx;
  }
  function beep(freq, duration, type = 'square', volume = 0.05, delay = 0) {
    if (muted) return;
    try {
      ensureAudioCtx();
      const t0 = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.stop(t0 + duration);
    } catch (e) { /* ignore audio errors */ }
  }
  const jumpAudio = new Audio('sfx/salto.ogg');
  jumpAudio.preload = 'auto';
  const sfxJump = () => {
    if (muted) return;
    try {
      const a = jumpAudio.cloneNode(true);
      a.volume = 0.35;
      a.play().catch(() => {});
    } catch (e) { /* ignore audio errors */ }
  };
  const yeahAudio = new Audio('sfx/yeah.wav');
  yeahAudio.preload = 'auto';
  const sfxYeah = () => {
    if (muted) return;
    try {
      const a = yeahAudio.cloneNode(true);
      a.volume = 0.8;
      a.play().catch(() => {});
    } catch (e) { /* ignore audio errors */ }
  };
  const sfxHit = () => beep(120, 0.3, 'sawtooth', 0.07);
  const sfxPower = () => {
    beep(392, 0.09, 'square', 0.05, 0);
    beep(523, 0.09, 'square', 0.05, 0.09);
    beep(659, 0.14, 'square', 0.06, 0.18);
  };
  const sfxSmash = () => beep(90, 0.15, 'sawtooth', 0.06);
  const sfxAppear = () => {
    beep(1046, 0.1, 'sine', 0.035, 0);
    beep(1568, 0.16, 'sine', 0.03, 0.09);
  };
  const sfxBurrow = () => {
    beep(300, 0.1, 'sawtooth', 0.05, 0);
    beep(180, 0.16, 'sawtooth', 0.05, 0.08);
    beep(110, 0.2, 'sawtooth', 0.05, 0.16);
  };
  const clawsLaughAudio = new Audio('sfx/risa-garras.ogg');
  clawsLaughAudio.preload = 'auto';
  clawsLaughAudio.volume = 0.8;
  clawsLaughAudio.muted = muted;
  const sfxEvilLaugh = () => {
    if (muted) return;
    try {
      clawsLaughAudio.currentTime = 0;
      clawsLaughAudio.play().catch(() => {});
    } catch (e) { /* ignore audio errors */ }
  };
  const stopEvilLaugh = () => {
    try {
      clawsLaughAudio.pause();
      clawsLaughAudio.currentTime = 0;
    } catch (e) { /* ignore audio errors */ }
  };

  const sfxStep = (foot) => {
    beep(foot === 0 ? 150 : 128, 0.07, 'triangle', 0.09);
  };

  let noiseBuffer = null;
  function getNoiseBuffer() {
    if (!noiseBuffer) {
      const len = audioCtx.sampleRate * 2;
      noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }
  let digSource = null;
  const startDigSound = () => {
    try {
      ensureAudioCtx();
      if (digSource) return;
      digSource = audioCtx.createBufferSource();
      digSource.buffer = getNoiseBuffer();
      digSource.loop = true;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 450;
      filter.Q.value = 0.6;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.08;
      digSource.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      digSource.start();
    } catch (e) { /* ignore audio errors */ }
  };
  const stopDigSound = () => {
    try {
      if (digSource) {
        digSource.stop();
        digSource.disconnect();
        digSource = null;
      }
    } catch (e) { /* ignore audio errors */ }
  };

  function setMuted(next) {
    muted = next;
    localStorage.setItem('conejo_muted', muted ? '1' : '0');
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    clawsLaughAudio.muted = muted;
    const btn = document.getElementById('btn-mute');
    if (btn) {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar sonido');
    }
  }

  const dino = {
    x: 130,
    y: GROUND_Y - 50,
    w: 48,
    h: 50,
    duckW: 62,
    duckH: 32,
    vy: 0,
    ducking: false,
    burrowed: false,
    grounded: true,
    legFrame: 0,
    legTimer: 0,
    runPhase: 0,
  };

  function groundRefY() {
    return dino.burrowed ? GROUND_Y + BURROW_DEPTH : GROUND_Y;
  }

  function crouchY() {
    return groundRefY() - dino.duckH;
  }

  function resetDino() {
    dino.burrowed = false;
    dino.y = groundRefY() - dino.h;
    dino.vy = 0;
    dino.ducking = false;
    dino.grounded = true;
    dino.runPhase = 0;
  }

  function jump() {
    if (dino.grounded && state === 'running') {
      dino.vy = JUMP_VELOCITY;
      dino.grounded = false;
      sfxJump();
    }
  }

  function enterBurrow() {
    if (state !== 'running' || !clawsActive || dino.burrowed || !dino.grounded) return;
    dino.burrowed = true;
    dino.ducking = false;
    dino.grounded = true;
    burrowObstacleTimer = nextBurrowRockGap();
    sfxBurrow();
    startDigSound();
  }

  function exitBurrow() {
    if (!dino.burrowed) return;
    dino.burrowed = false;
    dino.y = GROUND_Y - dino.h;
    dino.grounded = true;
    sfxJump();
    stopDigSound();
  }

  function jumpOrSurface() {
    if (dino.burrowed) {
      exitBurrow();
    } else {
      jump();
    }
  }

  function setDuck(on) {
    if (state !== 'running' || dino.burrowed) return;
    if (on && dino.grounded) {
      dino.ducking = true;
    } else if (!on) {
      dino.ducking = false;
    }
  }

  let obstacles = [];
  let obstacleTimer = 0;
  let powerups = [];
  let powerupTimer = 0;
  let particles = [];
  let stepTimer = 0;
  const STEP_DISTANCE = 70;

  function nextObstacleGap() {
    const base = 320 - speed * 10;
    return Math.max(140, base) + Math.random() * 300;
  }

  function nextPowerupGap() {
    return 3600 + Math.random() * 3600;
  }

  function nextBurrowRockGap() {
    return 320 + Math.random() * 280;
  }

  const CACTUS_VARIANTS = [
    { w: 17, h: 35 },
    { w: 25, h: 35 },
    { w: 34, h: 35 },
    { w: 17, h: 22 },
    { w: 34, h: 22 },
  ];
  const ROCK_VARIANTS = [
    { w: 26, h: 20 },
    { w: 34, h: 24 },
  ];
  const PREDATOR_VARIANTS = [
    { type: 'fox', w: 38, h: 24 },
    { type: 'wolf', w: 44, h: 28 },
  ];
  const BIRD_HEIGHTS = [GROUND_Y - 40, GROUND_Y - 70, GROUND_Y - 95];

  function spawnObstacle() {
    const options = ['cactus', 'rock'];
    if (score > 80) options.push('fox', 'wolf');
    if (score > 150) options.push('bird');
    const type = options[Math.floor(Math.random() * options.length)];

    if (type === 'bird') {
      const y = BIRD_HEIGHTS[Math.floor(Math.random() * BIRD_HEIGHTS.length)];
      obstacles.push({ type: 'bird', x: W + 20, y, w: 46, h: 32, wingFrame: 0, wingTimer: 0 });
    } else if (type === 'cactus') {
      const v = CACTUS_VARIANTS[Math.floor(Math.random() * CACTUS_VARIANTS.length)];
      obstacles.push({ type: 'cactus', x: W + 20, y: GROUND_Y - v.h, w: v.w, h: v.h });
    } else if (type === 'rock') {
      const v = ROCK_VARIANTS[Math.floor(Math.random() * ROCK_VARIANTS.length)];
      obstacles.push({ type: 'rock', x: W + 20, y: GROUND_Y - v.h, w: v.w, h: v.h });
    } else {
      const v = PREDATOR_VARIANTS.find(p => p.type === type);
      obstacles.push({ type, x: W + 20, y: GROUND_Y - v.h, w: v.w, h: v.h, legFrame: 0, legTimer: 0 });
    }
  }

  function spawnPowerup() {
    const kind = Math.random() < 0.42 ? 'carrot' : 'claws';
    if (kind === 'carrot') {
      const elevated = Math.random() < 0.5;
      const y = elevated ? GROUND_Y - 78 : GROUND_Y - 24;
      powerups.push({ kind, x: W + 20, y, w: 18, h: 22, baseY: y, t: Math.random() * Math.PI * 2, sparkleTimer: 0 });
    } else {
      const y = GROUND_Y - 22;
      powerups.push({ kind, x: W + 20, y, w: 20, h: 20, baseY: y, t: Math.random() * Math.PI * 2, sparkleTimer: 0 });
    }
    sfxAppear();
  }

  function spawnParticles(x, y, colors, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 2.5;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1,
        life: 24 + Math.random() * 12,
        maxLife: 36,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2.5,
      });
    }
  }

  function resetGame() {
    speed = START_SPEED;
    score = 0;
    isNight = false;
    obstacles = [];
    powerups = [];
    particles = [];
    metalMode = false;
    metalTimer = 0;
    celebrateTimer = 0;
    clawsActive = false;
    clawsTimer = 0;
    stopEvilLaugh();
    stopDigSound();
    stepTimer = 0;
    obstacleTimer = nextObstacleGap();
    powerupTimer = nextPowerupGap();
    resetDino();
  }

  function endGame() {
    state = 'gameover';
    stopEvilLaugh();
    stopDigSound();
    sfxHit();
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('dino_high_score', String(highScore));
    }
  }

  function tryFullscreen() {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      }
    } catch (e) { /* ignore fullscreen errors */ }
  }

  function startGame() {
    tryFullscreen();
    resetGame();
    state = 'running';
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function getDinoHitbox() {
    if (dino.ducking || dino.burrowed) {
      return { x: dino.x, y: crouchY(), w: dino.duckW, h: dino.duckH };
    }
    return { x: dino.x + 4, y: dino.y + 4, w: dino.w - 10, h: dino.h - 6 };
  }

  function activateMetalMode() {
    metalMode = true;
    metalTimer = METAL_DURATION;
    celebrateTimer = CELEBRATE_DURATION;
    sfxPower();
    sfxYeah();
  }

  function activateClawsPower() {
    clawsActive = true;
    clawsTimer = CLAWS_DURATION;
    sfxBurrow();
    sfxEvilLaugh();
  }

  function update() {
    frame++;

    if (state === 'running') {
      speed = Math.min(MAX_SPEED, speed + SPEED_INCREMENT);
      const multiplier = metalMode ? 2 : 1;
      score += speed * 0.05 * multiplier;

      isNight = Math.floor(score / NIGHT_SCORE_STEP) % 2 === 1;

      if (metalMode) {
        metalTimer--;
        if (metalTimer <= 0) {
          metalMode = false;
          powerupTimer = nextPowerupGap();
        }
      }
      if (clawsActive) {
        clawsTimer--;
        if (clawsTimer <= 0) {
          clawsActive = false;
          stopEvilLaugh();
          if (dino.burrowed) exitBurrow();
          powerupTimer = nextPowerupGap();
        }
      }
      if (celebrateTimer > 0) celebrateTimer--;

      if (!dino.grounded) {
        dino.vy += GRAVITY;
        dino.y += dino.vy;
        if (dino.y >= groundRefY() - dino.h) {
          dino.y = groundRefY() - dino.h;
          dino.vy = 0;
          dino.grounded = true;
          if (downHeld) {
            if (clawsActive) {
              enterBurrow();
            } else {
              setDuck(true);
            }
          }
        }
      }

      dino.legTimer++;
      if (dino.legTimer > (metalMode ? 3 : 6)) {
        dino.legTimer = 0;
        dino.legFrame = 1 - dino.legFrame;
      }

      if (dino.grounded && !dino.burrowed) {
        stepTimer -= speed;
        if (stepTimer <= 0) {
          stepTimer += STEP_DISTANCE;
          sfxStep(dino.legFrame);
        }
        if (!dino.ducking) {
          dino.runPhase += speed * (metalMode ? 0.14 : 0.1);
        }
      }

      groundOffset -= speed;
      if (groundOffset <= -20) groundOffset += 20;
      hillOffset -= speed * 0.3;
      if (hillOffset <= -120) hillOffset += 120;

      if (dino.burrowed && frame % 4 === 0) {
        particles.push({
          x: dino.x + 6, y: GROUND_Y - 2,
          vx: -speed * 0.3, vy: -0.3,
          life: 16, maxLife: 16,
          color: BURROW_ROCK_COLOR, size: 2 + Math.random() * 2,
        });
      }

      obstacleTimer -= speed;
      if (obstacleTimer <= 0) {
        spawnObstacle();
        obstacleTimer = nextObstacleGap();
      }

      if (dino.burrowed) {
        burrowObstacleTimer -= speed;
        if (burrowObstacleTimer <= 0) {
          const v = ROCK_VARIANTS[Math.floor(Math.random() * ROCK_VARIANTS.length)];
          obstacles.push({ type: 'burrowRock', x: W + 20, y: GROUND_Y + BURROW_DEPTH - v.h, w: v.w, h: v.h });
          burrowObstacleTimer = nextBurrowRockGap();
        }
      }

      if (!metalMode && !clawsActive && powerups.length === 0) {
        powerupTimer -= speed;
        if (powerupTimer <= 0) {
          spawnPowerup();
          powerupTimer = nextPowerupGap();
        }
      }

      for (const o of obstacles) {
        const chase = CHASE_BONUS[o.type] || 0;
        o.x -= speed + chase;
        if (o.type === 'bird') {
          o.wingTimer++;
          if (o.wingTimer > 10) {
            o.wingTimer = 0;
            o.wingFrame = 1 - o.wingFrame;
          }
        } else if (o.type === 'fox' || o.type === 'wolf') {
          o.legTimer++;
          if (o.legTimer > 5) {
            o.legTimer = 0;
            o.legFrame = 1 - o.legFrame;
          }
        }
      }
      obstacles = obstacles.filter(o => o.x + o.w > -10);

      for (const p of powerups) {
        p.x -= speed;
        p.t += 0.12;
        p.y = p.baseY + Math.sin(p.t) * 5;
        p.sparkleTimer--;
        if (p.sparkleTimer <= 0) {
          p.sparkleTimer = 10;
          const ang = Math.random() * Math.PI * 2;
          particles.push({
            x: p.x + p.w / 2 + Math.cos(ang) * 14,
            y: p.y + p.h / 2 + Math.sin(ang) * 14,
            vx: 0, vy: -0.3,
            life: 20, maxLife: 20,
            color: '#ffe27a', size: 2,
          });
        }
      }
      powerups = powerups.filter(p => p.x + p.w > -10);

      for (const pt of particles) {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.15;
        pt.life--;
      }
      particles = particles.filter(pt => pt.life > 0);

      const hitbox = getDinoHitbox();

      if (!dino.burrowed) {
        powerups = powerups.filter(p => {
          if (rectsOverlap(hitbox, p)) {
            if (p.kind === 'claws') {
              activateClawsPower();
              spawnParticles(p.x + p.w / 2, p.y + p.h / 2, [CLAWS_GLOW, CLAWS_MARK, BURROW_ROCK_COLOR], 16);
            } else {
              activateMetalMode();
              spawnParticles(p.x + p.w / 2, p.y + p.h / 2, [CARROT_BODY, CARROT_LEAF, '#ffe27a'], 16);
            }
            return false;
          }
          return true;
        });
      }

      if (dino.burrowed) {
        for (const o of obstacles) {
          if (o.type === 'burrowRock' && rectsOverlap(hitbox, o)) {
            endGame();
            break;
          }
        }
      } else if (metalMode) {
        const survivors = [];
        for (const o of obstacles) {
          if (o.type !== 'burrowRock' && rectsOverlap(hitbox, o)) {
            spawnParticles(o.x + o.w / 2, o.y + o.h / 2, ['#ff3b57', '#ffb020', '#ffe27a'], 14);
            sfxSmash();
            score += 10;
          } else {
            survivors.push(o);
          }
        }
        obstacles = survivors;
      } else {
        for (const o of obstacles) {
          if (o.type !== 'burrowRock' && rectsOverlap(hitbox, o)) {
            endGame();
            break;
          }
        }
      }
    }
  }

  function drawBackground(c) {
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, c.skyTop);
    grad.addColorStop(1, c.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, GROUND_Y);

    if (isNight) {
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(frame * 0.03 + s.phase);
        ctx.globalAlpha = 0.4 + tw * 0.6;
        ctx.fillStyle = c.star;
        ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.moonShade;
      ctx.beginPath(); ctx.arc(W - 90, 55, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.moon;
      ctx.beginPath(); ctx.arc(W - 96, 50, 20, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = c.sunGlow;
      ctx.beginPath(); ctx.arc(W - 90, 55, 42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.sun;
      ctx.beginPath(); ctx.arc(W - 90, 55, 26, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = c.hillFar;
    for (let x = hillOffset - 120; x < W + 120; x += 120) {
      ctx.beginPath();
      ctx.arc(x, GROUND_Y + 10, 70, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = c.hillNear;
    for (let x = hillOffset * 1.6 - 90; x < W + 90; x += 160) {
      ctx.beginPath();
      ctx.arc(x, GROUND_Y + 18, 55, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawGround(c) {
    ctx.fillStyle = c.dirt;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = c.grass;
    ctx.fillRect(0, GROUND_Y, W, 5);
    ctx.fillStyle = c.dirtLine;
    for (let x = groundOffset; x < W; x += 24) {
      ctx.fillRect(x, GROUND_Y + 12, 12, 3);
    }
  }

  function drawBurrowTunnel() {
    ctx.fillStyle = '#3d2b1a';
    ctx.fillRect(0, GROUND_Y + 6, W, H - GROUND_Y - 6);
    ctx.fillStyle = '#2a1c10';
    for (let x = groundOffset * 1.4; x < W; x += 34) {
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y + 16, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let x = groundOffset * 0.8 - 17; x < W; x += 30) {
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(x, GROUND_Y + 26, 3, 8);
    }
  }

  function drawLimb(sx, sy, angleDeg, length, isFist) {
    const rad = (angleDeg * Math.PI) / 180;
    const hx = sx + Math.cos(rad) * length;
    const hy = sy + Math.sin(rad) * length;
    ctx.strokeStyle = RABBIT.jacket;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = RABBIT.fur;
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
    if (isFist) {
      ctx.strokeStyle = RABBIT.fur;
      ctx.lineWidth = 2.5;
      const spread = 0.32;
      [rad - spread, rad + spread].forEach((a) => {
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8);
        ctx.stroke();
      });
    }
  }

  function drawRabbit(c) {
    const glow = metalMode ? (0.5 + 0.5 * Math.sin(frame * 0.5)) : 0;
    const crouching = dino.ducking || dino.burrowed;
    if (metalMode || dino.burrowed) {
      const cx = crouching ? dino.x + dino.duckW / 2 : dino.x + dino.w / 2;
      const cy = crouching ? crouchY() + dino.duckH / 2 : dino.y + dino.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.25 + glow * 0.25;
      ctx.fillStyle = metalMode ? '#ff3b57' : CLAWS_GLOW;
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (crouching) {
      const y = crouchY();
      const x = dino.x;
      const w = dino.duckW;
      const cy = y + dino.duckH - 12;

      ctx.fillStyle = RABBIT.furDeep;
      ctx.beginPath();
      ctx.ellipse(x + w / 2 - 4, cy + 2, w / 2 - 2, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = RABBIT.fur;
      ctx.beginPath();
      ctx.arc(x + w - 16, cy - 4, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = RABBIT.fur;
      roundRect(x - 4, y + 2, 16, 7, 3.5); ctx.fill();
      roundRect(x - 10, y + 8, 15, 7, 3.5); ctx.fill();
      ctx.fillStyle = RABBIT.earInner;
      roundRect(x - 1, y + 4, 9, 3, 1.5); ctx.fill();
      roundRect(x - 6, y + 10, 8, 3, 1.5); ctx.fill();

      ctx.fillStyle = RABBIT.glasses;
      roundRect(x + w - 24, cy - 8, 15, 6, 2); ctx.fill();
      if (dino.burrowed) {
        ctx.fillStyle = CLAWS_GLOW;
        roundRect(x + w - 22, cy - 7, 11, 4, 1.5); ctx.fill();
      }
      ctx.fillStyle = RABBIT.nose;
      ctx.beginPath(); ctx.arc(x + w - 5, cy - 3, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = RABBIT.whisker;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + w - 4, cy - 3); ctx.lineTo(x + w + 4, cy - 5);
      ctx.moveTo(x + w - 4, cy - 1); ctx.lineTo(x + w + 4, cy - 1);
      ctx.stroke();

      ctx.fillStyle = RABBIT.jacket;
      roundRect(x + 6, cy - 4, w - 30, 13, 5); ctx.fill();
      ctx.fillStyle = RABBIT.stud;
      ctx.fillRect(x + 12, cy, 2.5, 2.5);
      ctx.fillRect(x + 20, cy, 2.5, 2.5);

      const legY = y + dino.duckH - 6;
      ctx.fillStyle = RABBIT.boot;
      if (dino.legFrame === 0) {
        ctx.beginPath(); ctx.ellipse(x + 12, legY, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 32, legY, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.ellipse(x + 16, legY, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 36, legY, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }

    const x = dino.x, y = dino.y, w = dino.w, h = dino.h;
    const earFlap = dino.grounded ? Math.sin(frame * 0.3) * 2 : -5;
    const celebrating = celebrateTimer > 0;
    const headCx = x + 30, headCy = y + 13;
    const hipY = y + 42;
    const torsoCx = x + 23;
    const runSwing = dino.grounded ? Math.sin(dino.runPhase) : 0;

    ctx.save();
    if (dino.grounded && !celebrating) {
      const pivotX = x + 20, pivotY = y + h;
      ctx.translate(pivotX, pivotY);
      ctx.rotate(0.1);
      ctx.translate(-pivotX, -pivotY);
    }

    // tail (costume pompom)
    ctx.fillStyle = RABBIT.fur;
    ctx.beginPath(); ctx.arc(x + 9, hipY - 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = RABBIT.furShade;
    ctx.beginPath(); ctx.arc(x + 10, hipY - 4, 3.5, 0, Math.PI * 2); ctx.fill();

    // back arm (behind torso)
    const backShoulder = { x: x + 15, y: y + 25 };
    if (celebrating) {
      drawLimb(backShoulder.x, backShoulder.y, -100, 15, true);
    } else if (!dino.grounded) {
      drawLimb(backShoulder.x, backShoulder.y, 135, 13, false);
    } else {
      drawLimb(backShoulder.x, backShoulder.y, 87.5 + runSwing * 17.5, 14, false);
    }

    // hood ears (behind head, tilted back)
    ctx.fillStyle = RABBIT.fur;
    ctx.save();
    ctx.translate(x + 25, y + 4);
    ctx.rotate(-0.18);
    roundRect(-4, -26 + earFlap, 9, 28, 4.5); ctx.fill();
    ctx.fillStyle = RABBIT.earInner;
    roundRect(-2, -21 + earFlap, 5, 18, 2.5); ctx.fill();
    ctx.restore();

    ctx.fillStyle = RABBIT.fur;
    ctx.save();
    ctx.translate(x + 34, y + 2);
    ctx.rotate(0.12);
    roundRect(-4, -28 - earFlap, 9, 30, 4.5); ctx.fill();
    ctx.fillStyle = RABBIT.earInner;
    roundRect(-2, -23 - earFlap, 5, 19, 2.5); ctx.fill();
    ctx.restore();

    // mohawk between the ears
    ctx.fillStyle = RABBIT.mohawk;
    for (let i = 0; i < 3; i++) {
      const mx = x + 21 + i * 6;
      const mh = 9 + (i === 1 ? 4 : 0);
      ctx.beginPath();
      ctx.moveTo(mx, y + 4);
      ctx.lineTo(mx + 3, y + 4 - mh);
      ctx.lineTo(mx + 6, y + 4);
      ctx.closePath();
      ctx.fill();
    }

    // legs (human-proportioned, gap between them)
    ctx.fillStyle = RABBIT.boot;
    if (!dino.grounded) {
      ctx.beginPath(); ctx.ellipse(x + 17, y + h - 6, 5.5, 8, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 30, y + h - 6, 5.5, 8, -0.1, 0, Math.PI * 2); ctx.fill();
    } else {
      const strideX = runSwing * 2;
      ctx.beginPath();
      ctx.ellipse(x + 16 - strideX, y + h - 6 - runSwing * 2, 6, 7.5 + runSwing * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 31 + strideX, y + h - 6 + runSwing * 2, 6, 7.5 - runSwing * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // torso (leather jacket over the costume)
    ctx.fillStyle = RABBIT.jacket;
    roundRect(x + 12, y + 21, 22, 22, 7);
    ctx.fill();
    ctx.strokeStyle = RABBIT.zipper;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(torsoCx, y + 24); ctx.lineTo(torsoCx, hipY - 2);
    ctx.stroke();
    ctx.fillStyle = RABBIT.jacketHi;
    roundRect(x + 27, y + 24, 5, 14, 2); ctx.fill();
    ctx.fillStyle = RABBIT.stud;
    ctx.fillRect(x + 16, y + 27, 2.5, 2.5);
    ctx.fillRect(x + 16, y + 34, 2.5, 2.5);

    // front arm (in front of torso)
    const frontShoulder = { x: x + 32, y: y + 23 };
    if (celebrating) {
      drawLimb(frontShoulder.x, frontShoulder.y, -80, 16, true);
    } else if (!dino.grounded) {
      drawLimb(frontShoulder.x, frontShoulder.y, 45, 13, false);
    } else {
      drawLimb(frontShoulder.x, frontShoulder.y, 87.5 - runSwing * 17.5, 14, false);
    }

    // studded collar
    ctx.fillStyle = RABBIT.jacket;
    roundRect(headCx - 10, headCy + 11, 16, 5, 2.5); ctx.fill();
    ctx.fillStyle = RABBIT.stud;
    ctx.fillRect(headCx - 6, headCy + 12.5, 2, 2);
    ctx.fillRect(headCx, headCy + 12.5, 2, 2);

    // head (costume hood)
    ctx.fillStyle = RABBIT.fur;
    ctx.beginPath();
    ctx.arc(headCx, headCy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RABBIT.blush;
    ctx.beginPath();
    ctx.arc(headCx + 1, headCy + 7, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // sunglasses (single lens, profile view facing the direction of travel)
    ctx.fillStyle = RABBIT.glasses;
    roundRect(headCx - 3, headCy - 4, 14, 7, 2.5);
    ctx.fill();
    ctx.fillStyle = celebrating || metalMode ? `rgba(255,59,87,${0.55 + glow * 0.45})` : dino.burrowed ? CLAWS_GLOW : RABBIT.lens;
    roundRect(headCx - 1, headCy - 3, 10, 5, 1.5); ctx.fill();

    // snout + nose
    ctx.fillStyle = RABBIT.fur;
    ctx.beginPath();
    ctx.arc(headCx + 10, headCy + 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RABBIT.nose;
    ctx.beginPath();
    ctx.arc(headCx + 14, headCy + 4, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // whiskers
    ctx.strokeStyle = RABBIT.whisker;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headCx + 12, headCy + 6); ctx.lineTo(headCx + 22, headCy + 3);
    ctx.moveTo(headCx + 12, headCy + 8); ctx.lineTo(headCx + 22, headCy + 9);
    ctx.stroke();

    ctx.restore();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      if (o.type === 'cactus') {
        ctx.fillStyle = CACTUS_COLOR;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillRect(o.x - 5, o.y + 6, 5, 8);
        ctx.fillRect(o.x + o.w, o.y + 12, 5, 8);
        ctx.fillStyle = CACTUS_DARK;
        ctx.fillRect(o.x + o.w - 4, o.y, 4, o.h);
      } else if (o.type === 'rock' || o.type === 'burrowRock') {
        const rc = o.type === 'burrowRock' ? BURROW_ROCK_COLOR : ROCK_COLOR;
        const rd = o.type === 'burrowRock' ? BURROW_ROCK_DARK : ROCK_DARK;
        ctx.fillStyle = rc;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + 3, o.y + 4);
        ctx.lineTo(o.x + o.w * 0.5, o.y);
        ctx.lineTo(o.x + o.w - 3, o.y + 4);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rd;
        ctx.beginPath();
        ctx.moveTo(o.x + o.w * 0.5, o.y + o.h * 0.3);
        ctx.lineTo(o.x + o.w - 3, o.y + 4);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.lineTo(o.x + o.w * 0.5, o.y + o.h);
        ctx.closePath();
        ctx.fill();
      } else if (o.type === 'bird') {
        drawHawk(o);
      } else {
        drawPredator(o);
      }
    }
  }

  function drawHawk(o) {
    ctx.save();
    ctx.translate(o.x + o.w, o.y);
    ctx.scale(-1, 1);
    o = { x: 0, y: 0, w: o.w, h: o.h, wingFrame: o.wingFrame };

    const bodyColor = '#7a5230', bellyColor = '#dcb98a', wingColor = '#4a3220', beakColor = '#f2a93b', eyeColor = '#1a1a1a';
    const cx = o.x + 22, cy = o.y + 16;
    const wingUp = o.wingFrame === 0;

    ctx.fillStyle = wingColor;
    ctx.beginPath();
    ctx.moveTo(o.x, cy);
    ctx.lineTo(o.x - 9, cy - 4);
    ctx.lineTo(o.x - 7, cy + 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bellyColor;
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 3, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(cx + 16, cy - 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = beakColor;
    ctx.beginPath();
    ctx.moveTo(cx + 21, cy - 3);
    ctx.lineTo(cx + 28, cy - 1);
    ctx.lineTo(cx + 21, cy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(cx + 18, cy - 4, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = wingColor;
    ctx.beginPath();
    if (wingUp) {
      ctx.moveTo(cx - 6, cy - 1);
      ctx.lineTo(cx - 4, cy - 18);
      ctx.lineTo(cx + 3, cy - 14);
      ctx.lineTo(cx + 9, cy - 4);
      ctx.closePath();
    } else {
      ctx.moveTo(cx - 6, cy + 1);
      ctx.lineTo(cx - 4, cy + 15);
      ctx.lineTo(cx + 3, cy + 11);
      ctx.lineTo(cx + 9, cy + 3);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  function drawPredator(o) {
    const s = PREDATOR_STYLES[o.type];
    const isFox = o.type === 'fox';

    ctx.save();
    ctx.translate(o.x + o.w, o.y);
    ctx.scale(-1, 1);
    o = { x: 0, y: 0, w: o.w, h: o.h, legFrame: o.legFrame, type: o.type };

    const cx = o.x + o.w * 0.5, cy = o.y + o.h * 0.42;

    ctx.fillStyle = s.dark;
    if (isFox) {
      ctx.beginPath();
      ctx.ellipse(o.x - 1, cy - 1, 9, 5, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(o.x - 8, cy - 3, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(o.x + 2, cy + 1, 7, 3, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const legY = o.y + o.h - 1;
    ctx.fillStyle = s.dark;
    if (o.legFrame === 0) {
      ctx.fillRect(o.x + o.w * 0.22, legY - 9, 4, 9);
      ctx.fillRect(o.x + o.w * 0.68, legY - 11, 4, 11);
    } else {
      ctx.fillRect(o.x + o.w * 0.22, legY - 11, 4, 11);
      ctx.fillRect(o.x + o.w * 0.68, legY - 9, 4, 9);
    }

    ctx.fillStyle = s.body;
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.34, o.h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.belly;
    ctx.beginPath();
    ctx.ellipse(cx, cy + o.h * 0.14, o.w * 0.24, o.h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    const headX = o.x + o.w - 7, headY = cy - o.h * 0.16;
    const earH = o.h * 0.38;
    ctx.fillStyle = s.body;
    ctx.beginPath();
    ctx.moveTo(headX - 5, headY - earH * 0.4);
    ctx.lineTo(headX - 1, headY - earH);
    ctx.lineTo(headX + 3, headY - earH * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX, headY, o.h * 0.26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = s.belly;
    ctx.beginPath();
    ctx.ellipse(headX + o.h * 0.22, headY + 2, o.h * 0.15, o.h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(headX + o.h * 0.34, headY + 2, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = s.eye;
    ctx.beginPath();
    ctx.arc(headX + 2, headY - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(headX + 2.5, headY - 2, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPowerups() {
    for (const p of powerups) {
      if (p.kind === 'claws') {
        drawClawsIcon(p);
      } else {
        drawCarrotIcon(p);
      }
    }
  }

  function drawCarrotIcon(p) {
    const bob = Math.sin(p.t) * 1;
    ctx.fillStyle = CARROT_LEAF_DARK;
    ctx.fillRect(p.x + 4, p.y - 6 + bob, 3, 8);
    ctx.fillStyle = CARROT_LEAF;
    ctx.fillRect(p.x + 7, p.y - 8 + bob, 3, 9);
    ctx.fillRect(p.x + 10, p.y - 6 + bob, 3, 8);

    ctx.fillStyle = CARROT_BODY;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 2);
    ctx.lineTo(p.x + p.w, p.y + 2);
    ctx.lineTo(p.x + p.w / 2, p.y + p.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CARROT_DARK;
    ctx.fillRect(p.x + 3, p.y + 7, p.w - 6, 2);
    ctx.fillRect(p.x + 5, p.y + 12, p.w - 10, 2);

    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(frame * 0.15 + p.t);
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawClawsIcon(p) {
    const bob = Math.sin(p.t) * 1;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + bob;

    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(frame * 0.15 + p.t);
    ctx.fillStyle = CLAWS_GLOW;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = CLAWS_BADGE;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = CLAWS_MARK;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 5 + i * 4, cy - 6);
      ctx.lineTo(cx + 5 + i * 4, cy + 6);
      ctx.stroke();
    }
  }

  function drawParticles() {
    for (const pt of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      ctx.restore();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function getSafeBounds() {
    const rect = canvas.getBoundingClientRect();
    let left = 0, right = W, top = 0, bottom = H;
    if (rect.width > 0 && rect.height > 0) {
      const displayAspect = rect.width / rect.height;
      const gameAspect = W / H;
      if (displayAspect < gameAspect) {
        const visibleWidth = H * displayAspect;
        const crop = (W - visibleWidth) / 2;
        left = crop; right = W - crop;
      } else if (displayAspect > gameAspect) {
        const visibleHeight = W / displayAspect;
        const crop = (H - visibleHeight) / 2;
        top = crop; bottom = H - crop;
      }
    }
    return { left, right, top, bottom };
  }

  function drawHUD(c) {
    const s = String(Math.floor(score)).padStart(5, '0');
    const hs = String(highScore).padStart(5, '0');
    const bounds = getSafeBounds();
    const right = bounds.right;
    const top = bounds.top;

    ctx.fillStyle = c.panel;
    roundRect(right - 190, top + 8, 180, 26, 6);
    ctx.fill();

    ctx.fillStyle = c.text;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`HI ${hs}   ${s}`, right - 14, top + 26);

    if (metalMode) {
      const pct = metalTimer / METAL_DURATION;
      ctx.fillStyle = c.panel;
      roundRect(right - 190, top + 38, 180, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ff3b57';
      roundRect(right - 184, top + 41, 168 * pct, 8, 4);
      ctx.fill();
      ctx.fillStyle = c.text;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('MODO METAL', right - 14, top + 55);
    } else if (clawsActive) {
      const pct = clawsTimer / CLAWS_DURATION;
      ctx.fillStyle = c.panel;
      roundRect(right - 190, top + 38, 180, 20, 6);
      ctx.fill();
      ctx.fillStyle = CLAWS_GLOW;
      roundRect(right - 184, top + 41, 168 * pct, 8, 4);
      ctx.fill();
      ctx.fillStyle = c.text;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('GARRAS', right - 14, top + 55);
    }
  }

  function drawControlHint(c) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 36);
    ctx.lineTo(W / 2, H - 6);
    ctx.stroke();
    ctx.fillStyle = c.text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('◀ AGACHARSE', W / 4, H - 14);
    ctx.fillText('SALTAR ▶', (W * 3) / 4, H - 14);
    ctx.restore();
  }

  function drawCenterText(c, title) {
    ctx.fillStyle = c.panel;
    roundRect(W / 2 - 190, H / 2 - 34, 380, 56, 10);
    ctx.fill();
    ctx.fillStyle = c.text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(title, W / 2, H / 2 - 2);
  }

  function draw() {
    const c = isNight ? PALETTE.night : PALETTE.day;
    drawBackground(c);
    drawGround(c);
    if (dino.burrowed) drawBurrowTunnel();
    drawPowerups();
    drawObstacles();
    drawRabbit(c);
    drawParticles();
    drawHUD(c);

    const btnStart = document.getElementById('btn-start');
    if (state === 'waiting' || state === 'gameover') {
      drawCenterText(c, state === 'waiting' ? 'CONEJO METALERO' : 'GAME OVER');
      drawControlHint(c);
      if (btnStart) {
        btnStart.textContent = state === 'waiting' ? '▶ EMPEZAR' : '▶ REINTENTAR';
        btnStart.classList.add('visible');
      }
    } else if (btnStart) {
      btnStart.classList.remove('visible');
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function handleJumpKey(e) {
    e.preventDefault();
    if (state === 'waiting' || state === 'gameover') {
      startGame();
    } else {
      jumpOrSurface();
    }
  }

  function pressDown() {
    downHeld = true;
    if (clawsActive) {
      enterBurrow();
    } else {
      setDuck(true);
    }
  }

  function releaseDown() {
    downHeld = false;
    setDuck(false);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      handleJumpKey(e);
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      pressDown();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') {
      releaseDown();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state !== 'running') return;
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width / 2) {
      pressDown();
    } else {
      jumpOrSurface();
    }
  });

  canvas.addEventListener('pointerup', () => releaseDown());
  canvas.addEventListener('pointerleave', () => releaseDown());
  canvas.addEventListener('pointercancel', () => releaseDown());

  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    btnStart.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startGame();
    });
  }

  const btnMute = document.getElementById('btn-mute');
  if (btnMute) {
    btnMute.textContent = muted ? '🔇' : '🔊';
    btnMute.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar sonido');
    btnMute.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMuted(!muted);
    });
  }

  let deferredInstallPrompt = null;
  const btnInstall = document.getElementById('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall) btnInstall.classList.add('visible');
  });
  if (btnInstall) {
    btnInstall.addEventListener('pointerdown', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      btnInstall.classList.remove('visible');
    });
  }
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (btnInstall) btnInstall.classList.remove('visible');
  });

  resetDino();
  requestAnimationFrame(loop);
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
