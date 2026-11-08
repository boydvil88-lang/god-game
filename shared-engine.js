// =========================================================
// GRAND BOARD — Stage 2: Shared 3D Dice & Piece Engine
// =========================================================

import { audio, state, saveState, AI_OPPONENTS, GAMES_CATALOG, closeGameStage } from './app.js';

// 1. SHARED 3D DICE SYSTEM (Used across Backgammon & Ludo)
export class Shared3DDiceBox {
  constructor(containerEl, options = { diceCount: 2 }) {
    this.container = containerEl;
    this.diceCount = options.diceCount || 2;
    this.isRolling = false;
    this.diceMeshes = [];
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animFrame = null;

    this.initThreeScene();
  }

  // Create high-DPI canvas texture for each die face (Ivory/Obsidian + Brushed Gold Pips)
  createFaceTexture(number, isObsidian = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Luxury base material
    const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 180);
    if (isObsidian) {
      grad.addColorStop(0, '#232836');
      grad.addColorStop(1, '#12151E');
    } else {
      grad.addColorStop(0, '#FAF6EE');
      grad.addColorStop(1, '#E5DAC5');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle brushed gold border
    ctx.strokeStyle = '#C6A66A';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 236, 236);

    // Pip coordinates
    const pips = {
      1: [[128, 128]],
      2: [[72, 72], [184, 184]],
      3: [[68, 68], [128, 128], [188, 188]],
      4: [[72, 72], [184, 72], [72, 184], [184, 184]],
      5: [[68, 68], [188, 68], [128, 128], [68, 188], [188, 188]],
      6: [[72, 62], [184, 62], [72, 128], [184, 128], [72, 194], [184, 194]]
    };

    // Draw pips
    (pips[number] || []).forEach(([x, y]) => {
      ctx.beginPath();
      const radius = number === 1 ? 26 : 20;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      if (number === 1) {
        ctx.fillStyle = '#C64D50'; // Royal crimson ace pip
      } else {
        ctx.fillStyle = isObsidian ? '#D9C59B' : '#151923';
      }
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#C6A66A';
      ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  initThreeScene() {
    if (!window.THREE || !this.container) return;

    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 130;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    this.camera.position.set(0, 6.2, 4.2);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Cinematic Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
    this.scene.add(ambientLight);

    const spotLight = new THREE.DirectionalLight(0xffe9c4, 0.95);
    spotLight.position.set(4, 9, 5);
    spotLight.castShadow = true;
    this.scene.add(spotLight);

    // Build 3D Dice Meshes
    // Three.js BoxGeometry material order: [+X(1), -X(6), +Y(2), -Y(5), +Z(3), -Z(4)]
    const faceOrder = [1, 6, 2, 5, 3, 4];
    const isObsidianSkin = state.customization?.diceSkin?.includes('Obsidian');

    const materials = faceOrder.map(num =>
      new THREE.MeshStandardMaterial({
        map: this.createFaceTexture(num, isObsidianSkin),
        roughness: 0.25,
        metalness: 0.15
      })
    );

    const geometry = new THREE.BoxGeometry(1.18, 1.18, 1.18);

    for (let i = 0; i < this.diceCount; i++) {
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.castShadow = true;
      const spacing = this.diceCount === 1 ? 0 : (i === 0 ? -0.95 : 0.95);
      mesh.position.set(spacing, 0, 0);
      this.scene.add(mesh);
      this.diceMeshes.push(mesh);
    }

    this.renderFrame();
  }

  // Exact Euler rotations so top (+Y) camera sees the rolled face value
  getTargetRotationForValue(val) {
    switch (val) {
      case 1: return { x: 0, y: 0, z: Math.PI / 2 };
      case 6: return { x: 0, y: 0, z: -Math.PI / 2 };
      case 2: return { x: 0, y: 0, z: 0 };
      case 5: return { x: Math.PI, y: 0, z: 0 };
      case 3: return { x: -Math.PI / 2, y: 0, z: 0 };
      case 4: return { x: Math.PI / 2, y: 0, z: 0 };
      default: return { x: 0, y: 0, z: 0 };
    }
  }

  renderFrame() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }

  // Roll Dice with Cup Shake, Physics Bounce, and Double Result Celebration
  roll(forcedValues = null) {
    if (this.isRolling) return Promise.resolve(null);
    this.isRolling = true;

    const results = forcedValues || Array.from({ length: this.diceCount }, () =>
      Math.floor(Math.random() * 6) + 1
    );

    // Cup shake visual + sound
    this.container.classList.add('cup-shaking');
    audio.play('dice_roll');

    return new Promise(resolve => {
      const duration = audio.settings.reducedMotion ? 320 : 720;
      const startTime = performance.now();

      const startRotations = this.diceMeshes.map(m => ({
        x: m.rotation.x,
        y: m.rotation.y,
        z: m.rotation.z
      }));

      const targetRotations = results.map(val => {
        const base = this.getTargetRotationForValue(val);
        const extraSpins = audio.settings.reducedMotion ? 1 : 3;
        return {
          x: base.x + Math.PI * 2 * extraSpins,
          y: base.y + Math.PI * 2 * (extraSpins - 1),
          z: base.z + Math.PI * 2 * extraSpins
        };
      });

      const animateStep = now => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Luxury cubic ease-out
        const ease = 1 - Math.pow(1 - progress, 3);

        this.diceMeshes.forEach((mesh, idx) => {
          const s = startRotations[idx];
          const t = targetRotations[idx];

          mesh.rotation.x = s.x + (t.x - s.x) * ease;
          mesh.rotation.y = s.y + (t.y - s.y) * ease;
          mesh.rotation.z = s.z + (t.z - s.z) * ease;

          // Parabolic bounce height
          const bounce = Math.abs(Math.sin(progress * Math.PI * 2.2)) * (1 - progress) * 1.45;
          mesh.position.y = bounce;
        });

        this.renderFrame();

        if (progress < 1) {
          this.animFrame = requestAnimationFrame(animateStep);
        } else {
          this.container.classList.remove('cup-shaking');
          this.isRolling = false;
          audio.play('wood_move');

          // Check for Doubles (Backgammon) or Six Celebration (Ludo)
          const isDouble = results.length === 2 && results[0] === results[1];
          const isSix = results.length === 1 && results[0] === 6;

          if (isDouble || isSix) {
            this.triggerCelebration(isDouble ? `DOUBLE ${results[0]}s!` : 'ROYAL SIX!');
          }

          resolve(results);
        }
      };

      this.animFrame = requestAnimationFrame(animateStep);
    });
  }

  triggerCelebration(bannerText) {
    audio.triggerHaptic('heavy');
    const badge = document.createElement('div');
    badge.className = 'dice-celebration-toast';
    badge.textContent = `✨ ${bannerText}`;
    this.container.appendChild(badge);
    setTimeout(() => badge.remove(), 1400);
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.renderer) this.renderer.dispose();
  }
}

// 2. SHARED PIECE ANIMATION & HAPTIC SYSTEM
export const SharedPieceAnimator = {
  // Smooth floating clone between two DOM elements (Chess, Backgammon, Ludo, Checkers)
  animateMove(fromEl, toEl, pieceSymbol, onComplete) {
    if (!fromEl || !toEl || audio.settings.reducedMotion) {
      audio.play('wood_move');
      if (onComplete) onComplete();
      return;
    }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const flyer = document.createElement('div');
    flyer.className = 'floating-luxury-piece';
    flyer.innerHTML = pieceSymbol;
    flyer.style.left = `${fromRect.left + fromRect.width / 2}px`;
    flyer.style.top = `${fromRect.top + fromRect.height / 2}px`;
    document.body.appendChild(flyer);

    audio.triggerHaptic('light');

    requestAnimationFrame(() => {
      flyer.style.transform = `translate(-50%, -50%) scale(1.26)`;
      flyer.style.left = `${toRect.left + toRect.width / 2}px`;
      flyer.style.top = `${toRect.top + toRect.height / 2}px`;
    });

    setTimeout(() => {
      flyer.style.transform = `translate(-50%, -50%) scale(1)`;
      audio.play('chess_land');
    }, 230);

    setTimeout(() => {
      flyer.remove();
      if (onComplete) onComplete();
    }, 280);
  },

  // Subtle camera reaction on piece capture or Check
  pulseBoard(boardEl, type = 'capture') {
    if (!boardEl || audio.settings.reducedMotion) return;
    const cls = type === 'check' ? 'board-check-pulse' : 'board-capture-shake';
    boardEl.classList.remove(cls);
    void boardEl.offsetWidth; // Reflow
    boardEl.classList.add(cls);
    audio.triggerHaptic('heavy');
    setTimeout(() => boardEl.classList.remove(cls), 450);
  }
};

// 3. AI PERSONALITY CHATTER & TABLE HEADER CONTROLLER
const AI_QUOTES = {
  friend: {
    start: "Glad you're here! Let's enjoy a relaxed, thoughtful game.",
    goodMove: "Nice spot! That puts real pressure on my position.",
    win: "Well played! You earned that victory.",
    lose: "Good game! Want to review where the momentum shifted?"
  },
  gentleman: {
    start: "An honor to share the velvet table with you.",
    goodMove: "A refined maneuver. Let me consider a proper reply.",
    win: "My compliments. A masterclass in patience and precision.",
    lose: "A close contest indeed. Shall we set the pieces once more?"
  },
  strategist: {
    start: "Every square and pip has a probability. Let us begin.",
    goodMove: "Interesting line. You saw through the immediate tactical trap.",
    win: "Impressive calculation. You outmaneuvered my defense.",
    lose: "The position was decided three turns ago. Care for a rematch?"
  },
  king: {
    start: "Many enter the Grand Lounge. Few leave with my crown.",
    goodMove: "Bold. Let us see if your structure holds under royal pressure.",
    win: "Extraordinary. You have bested the Crown today.",
    lose: "The throne remains undefeated. Challenge me again when ready."
  }
};

export function getAIQuote(eventKey = 'start') {
  const aiId = state.selectedAI || 'gentleman';
  return AI_QUOTES[aiId]?.[eventKey] || AI_QUOTES.gentleman[eventKey];
}

// Record match outcome into persistent user stats & daily challenges
export function recordGameOutcome(gameId, playerWon, modeSummary = 'Royal Club Match') {
  const aiObj = AI_OPPONENTS.find(a => a.id === state.selectedAI) || AI_OPPONENTS[1];
  const gameObj = GAMES_CATALOG.find(g => g.id === gameId) || { name: gameId };

  state.stats.totalGames += 1;
  if (!state.stats.perGame[gameId]) {
    state.stats.perGame[gameId] = { played: 0, wins: 0, losses: 0 };
  }
  state.stats.perGame[gameId].played += 1;

  if (playerWon) {
    state.stats.wins += 1;
    state.stats.perGame[gameId].wins += 1;
    state.stats.streak += 1;
    state.stats.xp += 120;
    audio.play('victory');
  } else {
    state.stats.losses += 1;
    state.stats.perGame[gameId].losses += 1;
    state.stats.streak = 0;
    state.stats.xp += 40;
  }

  state.stats.level = Math.max(1, Math.floor(state.stats.xp / 250) + 1);

  state.recentMatches.unshift({
    game: gameObj.name,
    opponent: aiObj.name,
    result: playerWon ? 'Victory' : 'Defeat',
    mode: modeSummary,
    time: 'Just now'
  });
  state.recentMatches = state.recentMatches.slice(0, 12);

  saveState();
}

// 4. STAGE MANAGER REGISTRY (Connects Chess, Backgammon, Ludo, Domino, Checkers)
window.GrandBoardEngines = window.GrandBoardEngines || {};

window.GrandBoardStageManager = {
  activeInstance: null,

  openGame(gameId, stageEl) {
    if (this.activeInstance?.destroy) {
      this.activeInstance.destroy();
      this.activeInstance = null;
    }

    const aiObj = AI_OPPONENTS.find(a => a.id === state.selectedAI) || AI_OPPONENTS[1];
    const gameObj = GAMES_CATALOG.find(g => g.id === gameId) || GAMES_CATALOG[0];

    stageEl.innerHTML = `
      <!-- Top Game Table Bar -->
      <div class="table-top-bar">
        <button class="btn-outline" id="stage-exit-btn">← Lounge</button>
        <div class="table-title-block">
          <span class="brand-title">${gameObj.name.toUpperCase()}</span>
          <span class="brand-sub">${state.customization.boardSkin}</span>
        </div>
        <div class="ai-opponent-pill" id="stage-ai-switch" title="Tap to switch opponent">
          <span>${aiObj.icon}</span>
          <div>
            <strong>${aiObj.name}</strong>
            <small>${aiObj.difficulty}</small>
          </div>
        </div>
      </div>

      <!-- AI Live Dialogue Ribbon -->
      <div class="ai-dialogue-bar" id="ai-dialogue-bar">
        <span class="ai-quote-icon">${aiObj.icon}</span>
        <p id="ai-live-quote">"${getAIQuote('start')}"</p>
      </div>

      <!-- Main Interactive Game Board Mount -->
      <div id="game-board-mount" class="game-board-mount"></div>
    `;

    document.getElementById('stage-exit-btn')?.addEventListener('click', () => {
      if (this.activeInstance?.destroy) this.activeInstance.destroy();
      closeGameStage();
    });

    // Quick AI Switcher inside the table
    document.getElementById('stage-ai-switch')?.addEventListener('click', () => {
      const idx = AI_OPPONENTS.findIndex(a => a.id === state.selectedAI);
      const nextAI = AI_OPPONENTS[(idx + 1) % AI_OPPONENTS.length];
      state.selectedAI = nextAI.id;
      state.selectedDifficulty = nextAI.difficulty;
      saveState();
      audio.play('button');
      this.openGame(gameId, stageEl);
    });

    const mountEl = document.getElementById('game-board-mount');
    const EngineFactory = window.GrandBoardEngines[gameId];

    if (EngineFactory) {
      this.activeInstance = new EngineFactory(mountEl, {
        ai: aiObj,
        setQuote: text => {
          const qEl = document.getElementById('ai-live-quote');
          if (qEl) qEl.textContent = `"${text}"`;
        }
      });
    } else {
      // Interactive 3D Dice Showcase Fallback until Game Module is loaded
      this.renderSharedEngineShowcase(mountEl, gameObj);
    }
  },

  renderSharedEngineShowcase(mountEl, gameObj) {
    const diceCount = gameObj.id === 'ludo' ? 1 : 2;
    mountEl.innerHTML = `
      <div class="showcase-wrapper">
        <div class="luxury-card velvet-banner" style="width:100%; text-align:center;">
          <span class="priority-tag">SHARED 3D PHYSICS TRAY (${diceCount} ${diceCount === 1 ? 'DIE' : 'DICE'})</span>
          <h3 style="font-family:var(--font-display); margin:4px 0 10px;">${gameObj.name} — Interactive 3D Dice Test</h3>
          <div id="demo-dice-tray" class="shared-dice-tray"></div>
          <div style="display:flex; justify-content:center; gap:10px; margin-top:12px;">
            <button class="btn-gold" id="demo-roll-btn">🎲 Shake Cup & Roll</button>
            <button class="btn-outline" id="demo-double-btn">✨ Force Double 6</button>
          </div>
          <p id="demo-roll-result" style="font-size:12px; color:var(--gold-secondary); margin-top:10px;">
            Tap Roll to test 3D physics, haptics & sound synthesis.
          </p>
        </div>
      </div>
    `;

    const trayEl = document.getElementById('demo-dice-tray');
    const diceBox = new Shared3DDiceBox(trayEl, { diceCount });
    this.activeInstance = diceBox;

    document.getElementById('demo-roll-btn')?.addEventListener('click', async () => {
      const res = await diceBox.roll();
      if (res) {
        document.getElementById('demo-roll-result').textContent =
          `Rolled: ${res.join(' & ')} (Total: ${res.reduce((a, b) => a + b, 0)})`;
      }
    });

    document.getElementById('demo-double-btn')?.addEventListener('click', async () => {
      const forced = diceCount === 1 ? [6] : [6, 6];
      const res = await diceBox.roll(forced);
      if (res) {
        document.getElementById('demo-roll-result').textContent =
          `Royal Roll: ${res.join(' & ')}!`;
      }
    });
  }
};