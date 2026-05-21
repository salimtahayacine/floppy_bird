// Flappy Bird — Modern Clone (Enhanced)
// Enhancements: Web Audio sound effects, difficulty scaling, screen shake, score flash, level indicator

(function () {
  'use strict';

  // DOM references
  const canvas = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySubtitle = document.getElementById('overlay-subtitle');
  const overlayBest = document.getElementById('best');
  const startBtn = document.getElementById('start-btn');
  const howBtn = document.getElementById('how-btn');

  const ctx = canvas.getContext('2d');

  const LOGICAL_WIDTH = canvas.width;  // 432
  const LOGICAL_HEIGHT = canvas.height; // 768

  // HiDPI scaling for crisp rendering on high-DPI displays
  function configureCanvasForDevicePixelRatio() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(LOGICAL_WIDTH * dpr);
    canvas.height = Math.floor(LOGICAL_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  configureCanvasForDevicePixelRatio();
  window.addEventListener('resize', configureCanvasForDevicePixelRatio);

  // Base game constants — difficulty scaling adjusts these at runtime
  const GRAVITY_PER_SEC = 1500;
  const JUMP_VELOCITY = -420;
  const TERMINAL_VELOCITY = 900;
  const BASE_PIPE_SPEED = 160;       // px/s
  const BASE_PIPE_GAP = 180;         // px
  const BASE_SPAWN_INTERVAL_MS = 1300; // ms
  const PIPE_WIDTH = 72;
  const BIRD_RADIUS = 14;
  const BIRD_X = Math.floor(LOGICAL_WIDTH * 0.28);

  const STATE = {
    READY: 'ready',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameover',
  };

  // --- Web Audio sound engine ---
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {}
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, gainVal, freqEnd) {
    const ac = getAudioCtx();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (freqEnd !== undefined) {
        osc.frequency.linearRampToValueAtTime(freqEnd, ac.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainVal, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration);
    } catch (_) {}
  }

  function sfxFlap() {
    playTone(400, 'sine', 0.08, 0.12, 600);
  }

  function sfxScore() {
    playTone(880, 'sine', 0.1, 0.18, 1100);
    setTimeout(() => playTone(1200, 'sine', 0.1, 0.14), 90);
  }

  function sfxDeath() {
    playTone(280, 'sawtooth', 0.25, 0.22, 80);
    setTimeout(() => playTone(110, 'sawtooth', 0.35, 0.18, 60), 160);
  }

  // --- Difficulty scaling ---
  // Every 5 points: pipes speed up, gap shrinks, and spawns quicken (all capped)
  function getDifficulty(currentScore) {
    const level = Math.floor(currentScore / 5);
    return {
      pipeSpeed: Math.min(BASE_PIPE_SPEED + level * 14, 340),
      pipeGap: Math.max(BASE_PIPE_GAP - level * 7, 115),
      spawnInterval: Math.max(BASE_SPAWN_INTERVAL_MS - level * 55, 780),
      level: level + 1,
    };
  }

  // --- Screen shake ---
  let shakeTimeRemaining = 0;
  const SHAKE_DURATION = 0.38;
  const SHAKE_INTENSITY = 9;

  function triggerShake() {
    shakeTimeRemaining = SHAKE_DURATION;
  }

  function getShakeOffset() {
    if (shakeTimeRemaining <= 0) return { x: 0, y: 0 };
    const factor = shakeTimeRemaining / SHAKE_DURATION;
    return {
      x: (Math.random() * 2 - 1) * SHAKE_INTENSITY * factor,
      y: (Math.random() * 2 - 1) * SHAKE_INTENSITY * factor,
    };
  }

  // --- Score flash ---
  function triggerScoreFlash() {
    scoreEl.classList.remove('score-flash');
    // Force reflow so re-adding the class restarts the animation
    void scoreEl.offsetWidth;
    scoreEl.classList.add('score-flash');
  }

  // --- Pipes ---
  /**
   * @typedef {{ x: number, gapY: number, gapSize: number, passed: boolean }} Pipe
   * gapSize is baked in at spawn time so existing pipes aren't retroactively resized.
   */
  const pipes = /** @type {Pipe[]} */ ([]);

  let gameState = STATE.READY;
  let score = 0;
  let best = Number(localStorage.getItem('flappy-highscore') || '0') || 0;
  overlayBest.textContent = String(best);

  const bird = {
    x: BIRD_X,
    y: LOGICAL_HEIGHT * 0.4,
    velocityY: 0,
    angle: 0,
  };

  let lastTimestampMs = 0;
  let lastSpawnAtMs = 0;
  let timeSinceStartMs = 0;

  function resetGame() {
    pipes.length = 0;
    score = 0;
    updateScore(0);
    bird.x = BIRD_X;
    bird.y = LOGICAL_HEIGHT * 0.4;
    bird.velocityY = 0;
    bird.angle = 0;
    lastSpawnAtMs = 0;
    timeSinceStartMs = 0;
    shakeTimeRemaining = 0;
    scoreEl.classList.remove('score-flash');
  }

  function updateScore(value) {
    score = value;
    scoreEl.textContent = String(score);
  }

  function showOverlay(title, subtitle, showStart = true) {
    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle;
    overlayBest.textContent = String(best);
    startBtn.style.display = showStart ? 'inline-flex' : 'none';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
  }

  function hideOverlay() {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  }

  // --- Input ---
  function flap() {
    if (gameState === STATE.PAUSED) return;
    if (gameState === STATE.READY) {
      startGame();
      return;
    }
    if (gameState === STATE.PLAYING) {
      bird.velocityY = JUMP_VELOCITY;
      bird.angle = -0.35;
      sfxFlap();
    }
    if (gameState === STATE.GAME_OVER) {
      startGame();
    }
  }

  function togglePause() {
    if (gameState === STATE.PLAYING) {
      gameState = STATE.PAUSED;
      showOverlay('Paused', 'Press P or tap to resume', false);
    } else if (gameState === STATE.PAUSED) {
      gameState = STATE.PLAYING;
      hideOverlay();
    }
  }

  startBtn.addEventListener('click', flap);
  howBtn.addEventListener('click', () => {
    alert(
      'How to play:\n\n' +
      '• Tap / click / Space to flap\n' +
      '• Fly through pipe gaps to score\n' +
      '• Avoid pipes and screen boundaries\n' +
      '• Press P to pause\n\n' +
      'Difficulty increases every 5 points —\n' +
      'pipes get faster, closer together, and spawn quicker!'
    );
  });
  canvas.addEventListener('pointerdown', flap);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      flap();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      togglePause();
    }
  });

  // --- Game lifecycle ---
  function startGame() {
    // Unlock AudioContext on first user gesture (browser policy)
    const ac = getAudioCtx();
    if (ac && ac.state === 'suspended') ac.resume();

    resetGame();
    hideOverlay();
    gameState = STATE.PLAYING;
  }

  function gameOver() {
    gameState = STATE.GAME_OVER;
    sfxDeath();
    triggerShake();
    if (score > best) {
      best = score;
      try { localStorage.setItem('flappy-highscore', String(best)); } catch (_) {}
    }
    showOverlay('Game Over', `Score: ${score} • Best: ${best}`);
  }

  // --- Pipe helpers ---
  function spawnPipe() {
    const { pipeGap } = getDifficulty(score);
    const margin = 80;
    const minY = margin + pipeGap / 2;
    const maxY = LOGICAL_HEIGHT - margin - pipeGap / 2;
    const gapY = Math.floor(minY + Math.random() * (maxY - minY));
    pipes.push({ x: LOGICAL_WIDTH + PIPE_WIDTH, gapY, gapSize: pipeGap, passed: false });
  }

  // --- Update ---
  function update(dtSec) {
    if (gameState !== STATE.PLAYING) return;

    if (shakeTimeRemaining > 0) shakeTimeRemaining = Math.max(0, shakeTimeRemaining - dtSec);

    timeSinceStartMs += dtSec * 1000;

    const diff = getDifficulty(score);

    // Bird physics
    bird.velocityY = Math.min(bird.velocityY + GRAVITY_PER_SEC * dtSec, TERMINAL_VELOCITY);
    bird.y += bird.velocityY * dtSec;
    bird.angle = Math.min(bird.angle + 1.2 * dtSec, 0.5);

    // Boundary: ceiling
    if (bird.y - BIRD_RADIUS <= 0) {
      bird.y = BIRD_RADIUS;
      bird.velocityY = 0;
    }
    // Boundary: floor
    if (bird.y + BIRD_RADIUS >= LOGICAL_HEIGHT) {
      bird.y = LOGICAL_HEIGHT - BIRD_RADIUS;
      gameOver();
      return;
    }

    // Pipe spawning
    if (timeSinceStartMs - lastSpawnAtMs >= diff.spawnInterval) {
      spawnPipe();
      lastSpawnAtMs = timeSinceStartMs;
    }

    // Pipe movement, scoring, and collision
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= diff.pipeSpeed * dtSec;

      if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
        p.passed = true;
        updateScore(score + 1);
        sfxScore();
        triggerScoreFlash();
      }

      if (p.x + PIPE_WIDTH < -8) {
        pipes.splice(i, 1);
        continue;
      }

      // Collision uses each pipe's own baked-in gapSize
      const half = p.gapSize / 2;
      const topRect  = { x: p.x, y: 0,                   w: PIPE_WIDTH, h: p.gapY - half };
      const botRect  = { x: p.x, y: p.gapY + half,       w: PIPE_WIDTH, h: LOGICAL_HEIGHT - (p.gapY + half) };

      if (circleIntersectsRect(bird.x, bird.y, BIRD_RADIUS, topRect) ||
          circleIntersectsRect(bird.x, bird.y, BIRD_RADIUS, botRect)) {
        gameOver();
        return;
      }
    }
  }

  function circleIntersectsRect(cx, cy, r, rect) {
    const closestX = clamp(cx, rect.x, rect.x + rect.w);
    const closestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= r * r;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // --- Rendering ---
  function draw() {
    const shake = getShakeOffset();

    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawBackground();

    for (const p of pipes) {
      drawPipePair(p.x, p.gapY, p.gapSize);
    }

    drawBird(bird.x, bird.y, bird.angle);

    if (gameState === STATE.PLAYING && score > 0) {
      drawLevelIndicator(getDifficulty(score).level);
    }

    ctx.restore();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    g.addColorStop(0, '#e5f0ff');
    g.addColorStop(1, '#f8fafc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fillRect(-20, -20, LOGICAL_WIDTH + 40, 20);
  }

  function drawPipePair(x, gapY, gapSize) {
    const topH = gapY - gapSize / 2;
    const botY = gapY + gapSize / 2;
    const botH = LOGICAL_HEIGHT - botY;

    const pipeGrad = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    pipeGrad.addColorStop(0, '#86efac');
    pipeGrad.addColorStop(1, '#22c55e');
    ctx.fillStyle = pipeGrad;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;

    roundRect(ctx, x, 0,    PIPE_WIDTH, topH, 8, true, true);
    roundRect(ctx, x, botY, PIPE_WIDTH, botH, 8, true, true);
  }

  function drawLevelIndicator(level) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`LVL ${level}`, LOGICAL_WIDTH - 12, 12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y,   x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x,   y + h, radius);
    ctx.arcTo(x,   y + h, x,   y,       radius);
    ctx.arcTo(x,   y,     x + w, y,     radius);
    ctx.closePath();
    if (fill)   ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawBird(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Body
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Wing
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.ellipse(-4, 2, 7, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Eye white
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(5, -4, 2, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(BIRD_RADIUS - 2, -2);
    ctx.lineTo(BIRD_RADIUS + 8, 0);
    ctx.lineTo(BIRD_RADIUS - 2, 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // --- Main loop ---
  function frame(timestampMs) {
    if (lastTimestampMs === 0) lastTimestampMs = timestampMs;
    let dt = (timestampMs - lastTimestampMs) / 1000;
    lastTimestampMs = timestampMs;
    dt = Math.max(0, Math.min(0.035, dt)); // clamp to avoid physics spikes on tab switch

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  showOverlay('Flappy Bird', 'Tap, click, or press Space to flap');
  requestAnimationFrame(frame);
})();
