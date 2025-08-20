// Flappy Bird — Modern Clone
// Clean, readable code with time-based updates and crisp canvas rendering

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

  // Logical canvas size (do not change without adjusting CSS as well)
  const LOGICAL_WIDTH = canvas.width; // 432
  const LOGICAL_HEIGHT = canvas.height; // 768

  // HiDPI scaling for crisp rendering
  function configureCanvasForDevicePixelRatio() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(LOGICAL_WIDTH * dpr);
    canvas.height = Math.floor(LOGICAL_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  configureCanvasForDevicePixelRatio();
  window.addEventListener('resize', configureCanvasForDevicePixelRatio);

  // Game constants
  const GRAVITY_PER_SEC = 1500; // px/s^2
  const JUMP_VELOCITY = -420; // px/s
  const TERMINAL_VELOCITY = 900; // px/s
  const PIPE_SPEED = 160; // px/s to the left
  const PIPE_WIDTH = 72; // px
  const PIPE_GAP = 180; // px gap between top and bottom pipe
  const PIPE_SPAWN_INTERVAL_MS = 1300; // spawn cadence
  const BIRD_RADIUS = 14; // px
  const BIRD_X = Math.floor(LOGICAL_WIDTH * 0.28);

  const STATE = {
    READY: 'ready',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameover',
  };

  /** @typedef {{ x:number, gapY:number, passed:boolean }} Pipe */
  /**
   * Pipes are represented by x position and vertical center of the gap (gapY).
   * Top pipe extends from y=0 to (gapY - PIPE_GAP/2). Bottom starts at (gapY + PIPE_GAP/2) to canvas bottom.
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
    angle: 0, // visual tilt only
  };

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

  // Input handlers
  function flap() {
    if (gameState === STATE.PAUSED) return;
    if (gameState === STATE.READY) {
      startGame();
    }
    if (gameState === STATE.PLAYING) {
      bird.velocityY = JUMP_VELOCITY;
      bird.angle = -0.35; // slight tilt up
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

  // Events
  startBtn.addEventListener('click', flap);
  howBtn.addEventListener('click', () => {
    alert('How to play:\n\n- Tap/click/Space to flap\n- Fly through gaps to score\n- Avoid pipes and boundaries\n- Press P to pause');
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

  // Game loop state
  let lastTimestampMs = 0;
  let lastSpawnAtMs = 0;
  let timeSinceStartMs = 0;

  function startGame() {
    resetGame();
    hideOverlay();
    gameState = STATE.PLAYING;
  }

  function gameOver() {
    gameState = STATE.GAME_OVER;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('flappy-highscore', String(best));
      } catch (_) {}
    }
    showOverlay('Game Over', `Score: ${score} • Best: ${best}`);
  }

  // Pipe helpers
  function spawnPipe() {
    const margin = 80; // keep gap fully on screen
    const minY = margin + PIPE_GAP / 2;
    const maxY = LOGICAL_HEIGHT - margin - PIPE_GAP / 2;
    const gapY = Math.floor(minY + Math.random() * (maxY - minY));
    pipes.push({ x: LOGICAL_WIDTH + PIPE_WIDTH, gapY, passed: false });
  }

  function update(dtSec) {
    if (gameState !== STATE.PLAYING) return;

    timeSinceStartMs += dtSec * 1000;

    // Bird physics
    bird.velocityY = Math.min(bird.velocityY + GRAVITY_PER_SEC * dtSec, TERMINAL_VELOCITY);
    bird.y += bird.velocityY * dtSec;
    bird.angle = Math.min(bird.angle + 1.2 * dtSec, 0.5); // ease towards down tilt

    // Boundaries
    if (bird.y - BIRD_RADIUS <= 0) {
      bird.y = BIRD_RADIUS;
      bird.velocityY = 0;
    }
    if (bird.y + BIRD_RADIUS >= LOGICAL_HEIGHT) {
      bird.y = LOGICAL_HEIGHT - BIRD_RADIUS;
      gameOver();
    }

    // Pipes spawn
    if (timeSinceStartMs - lastSpawnAtMs >= PIPE_SPAWN_INTERVAL_MS) {
      spawnPipe();
      lastSpawnAtMs = timeSinceStartMs;
    }

    // Pipes update and collisions
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= PIPE_SPEED * dtSec;

      // Score when passing the pipe center
      if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
        p.passed = true;
        updateScore(score + 1);
      }

      // Remove off-screen pipes
      if (p.x + PIPE_WIDTH < -8) {
        pipes.splice(i, 1);
        continue;
      }

      // Collision check (circle vs AABB)
      const topPipe = { x: p.x, y: 0, w: PIPE_WIDTH, h: p.gapY - PIPE_GAP / 2 };
      const bottomPipe = { x: p.x, y: p.gapY + PIPE_GAP / 2, w: PIPE_WIDTH, h: LOGICAL_HEIGHT - (p.gapY + PIPE_GAP / 2) };

      if (circleIntersectsRect(bird.x, bird.y, BIRD_RADIUS, topPipe) || circleIntersectsRect(bird.x, bird.y, BIRD_RADIUS, bottomPipe)) {
        gameOver();
        break;
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

  // Rendering
  function draw() {
    // Background
    drawBackground();

    // Pipes
    for (const p of pipes) {
      drawPipePair(p.x, p.gapY);
    }

    // Bird
    drawBird(bird.x, bird.y, bird.angle);
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    g.addColorStop(0, '#e5f0ff');
    g.addColorStop(1, '#f8fafc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Soft vignette
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fillRect(-20, -20, LOGICAL_WIDTH + 40, 20);
  }

  function drawPipePair(x, gapY) {
    const topH = gapY - PIPE_GAP / 2;
    const botY = gapY + PIPE_GAP / 2;
    const botH = LOGICAL_HEIGHT - botY;

    // Pipe style
    const pipeGradient = ctx.createLinearGradient(0, 0, PIPE_WIDTH, 0);
    pipeGradient.addColorStop(0, '#86efac');
    pipeGradient.addColorStop(1, '#22c55e');
    ctx.fillStyle = pipeGradient;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;

    // Top pipe
    roundRect(ctx, x, 0, PIPE_WIDTH, topH, 8, true, true);

    // Bottom pipe
    roundRect(ctx, x, botY, PIPE_WIDTH, botH, 8, true, true);
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fill) ctx.fill();
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

    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, -4, 4, 0, Math.PI * 2);
    ctx.fill();
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

  // Main loop
  function frame(timestampMs) {
    if (lastTimestampMs === 0) lastTimestampMs = timestampMs;
    let dt = (timestampMs - lastTimestampMs) / 1000; // seconds
    lastTimestampMs = timestampMs;

    // Clamp delta to avoid huge jumps on tab switch
    dt = Math.max(0, Math.min(0.035, dt));

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  // Initial state
  showOverlay('Flappy Bird', 'Tap, click, or press Space to flap');
  requestAnimationFrame(frame);
})();

