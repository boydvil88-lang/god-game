// =========================================================
// GRAND BOARD — Stage 5: Complete 4-Player Royal Ludo Engine
// =========================================================

import { audio, state, saveState } from './app.js';
import {
  Shared3DDiceBox,
  SharedPieceAnimator,
  getAIQuote,
  recordGameOutcome
} from './shared-engine.js';

// 52-Step clockwise perimeter track coordinates on a 15x15 Ludo grid [row, col]
const MAIN_TRACK = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0]
];

// 8 Official Safe Star Squares (4 starting squares + 4 star squares)
const SAFE_TRACK_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const PLAYERS_CONFIG = [
  {
    id: 'gold',
    name: 'You (Royal Gold)',
    isAI: false,
    startOffset: 39, // Bottom-Left exit [13, 6]
    colorHex: '#C6A66A',
    tokenSymbol: '🟡',
    yardCoords: [[10, 1], [10, 4], [13, 1], [13, 4]],
    homeStretch: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
  },
  {
    id: 'crimson',
    name: 'The Friend',
    isAI: true,
    startOffset: 0, // Top-Left exit [6, 1]
    colorHex: '#C64D50',
    tokenSymbol: '🔴',
    yardCoords: [[1, 1], [1, 4], [4, 1], [4, 4]],
    homeStretch: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]]
  },
  {
    id: 'emerald',
    name: 'The Gentleman',
    isAI: true,
    startOffset: 13, // Top-Right exit [1, 8]
    colorHex: '#3C9974',
    tokenSymbol: '🟢',
    yardCoords: [[1, 10], [1, 13], [4, 10], [4, 13]],
    homeStretch: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]]
  },
  {
    id: 'sapphire',
    name: 'The Strategist',
    isAI: true,
    startOffset: 26, // Bottom-Right exit [8, 13]
    colorHex: '#4A78C2',
    tokenSymbol: '🔵',
    yardCoords: [[10, 10], [10, 13], [13, 10], [13, 13]],
    homeStretch: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]]
  }
];

export class LuxuryLudoGame {
  constructor(mountEl, context = {}) {
    this.mountEl = mountEl;
    this.context = context;
    this.diceBox = null;

    // Each player has 4 tokens:
    // step = -1 (in starting yard), 0..50 (main track relative steps), 51..55 (colored home column), 56 (finished crown!)
    this.tokens = {
      gold: [-1, -1, -1, -1],
      crimson: [-1, -1, -1, -1],
      emerald: [-1, -1, -1, -1],
      sapphire: [-1, -1, -1, -1]
    };

    this.turnIndex = 0; // 0 = gold (Player)
    this.currentDie = null;
    this.consecutiveSixes = 0;
    this.legalTokenIndices = [];
    this.isBusy = false;
    this.gameEnded = false;

    this.renderLayout();
    this.buildBoardGrid();
    this.updateBoardUI();
  }

  renderLayout() {
    this.mountEl.innerHTML = `
      <div class="ludo-stage-wrap">
        
        <!-- 4-Player Status & Crown Progress Row -->
        <div class="ludo-hud-grid">
          ${PLAYERS_CONFIG.map((p, idx) => `
            <div class="ludo-player-pill ${idx === 0 ? 'active-turn' : ''}" id="ludo-pill-${p.id}">
              <span class="ludo-color-dot" style="background:${p.colorHex};"></span>
              <div class="ludo-pill-meta">
                <strong>${idx === 3 && this.context.ai ? this.context.ai.name : p.name}</strong>
                <small id="ludo-score-${p.id}">Home: 0/4</small>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- 15x15 Luxury Ludo Board Frame -->
        <div class="ludo-board-frame" id="ludo-board-frame">
          <div class="ludo-grid-15" id="ludo-grid-15"></div>

          <!-- Victory / Outcome Modal -->
          <div id="ludo-outcome-modal" class="chess-overlay-modal hidden">
            <div class="outcome-crown" id="ludo-outcome-icon">👑</div>
            <h3 id="ludo-outcome-title">ROYAL LUDO VICTORY</h3>
            <p id="ludo-outcome-desc">All 4 tokens have reached the Grand Crown!</p>
            <button class="btn-gold" id="ludo-rematch-btn" style="margin-top:12px;">Play Again</button>
          </div>
        </div>

        <!-- Turn Status Ribbon -->
        <div class="ludo-status-strip" id="ludo-status-strip">
          Your Turn (Royal Gold) — Tap Roll to shake the 3D Dice Cup
        </div>

        <!-- Shared 3D Dice Tray (1 Die Mode) + Controls -->
        <div class="bg-dice-dock">
          <div id="ludo-3d-dice-tray" class="shared-dice-tray bg-compact-tray"></div>
          <div class="bg-action-col">
            <button class="btn-gold" id="ludo-roll-btn">🎲 Roll Die</button>
            <button class="btn-outline" id="ludo-six-btn" title="Practice Mode Test">✨ Roll 6 (Practice)</button>
            <button class="btn-outline" id="ludo-new-btn">↻ New Table</button>
          </div>
        </div>

      </div>
    `;

    // Initialize Shared 3D Dice Engine with 1 Die
    const trayEl = document.getElementById('ludo-3d-dice-tray');
    this.diceBox = new Shared3DDiceBox(trayEl, { diceCount: 1 });

    document.getElementById('ludo-roll-btn')?.addEventListener('click', () => this.handlePlayerRoll(null));
    document.getElementById('ludo-six-btn')?.addEventListener('click', () => this.handlePlayerRoll([6]));
    document.getElementById('ludo-new-btn')?.addEventListener('click', () => this.resetMatch());
    document.getElementById('ludo-rematch-btn')?.addEventListener('click', () => this.resetMatch());
  }

  resetMatch() {
    audio.play('wood_move');
    this.tokens = {
      gold: [-1, -1, -1, -1],
      crimson: [-1, -1, -1, -1],
      emerald: [-1, -1, -1, -1],
      sapphire: [-1, -1, -1, -1]
    };
    this.turnIndex = 0;
    this.currentDie = null;
    this.consecutiveSixes = 0;
    this.legalTokenIndices = [];
    this.isBusy = false;
    this.gameEnded = false;
    document.getElementById('ludo-outcome-modal')?.classList.add('hidden');
    this.setStatus('Your Turn (Royal Gold) — Roll the 3D Dice Cup');
    this.updateBoardUI();
  }

  buildBoardGrid() {
    const gridEl = document.getElementById('ludo-grid-15');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const cell = document.createElement('div');
        cell.className = 'ludo-cell';
        cell.dataset.rc = `${r},${c}`;

        // 4 Corner Yards
        if (r < 6 && c < 6) cell.classList.add('yard-crimson');
        else if (r < 6 && c > 8) cell.classList.add('yard-emerald');
        else if (r > 8 && c < 6) cell.classList.add('yard-gold');
        else if (r > 8 && c > 8) cell.classList.add('yard-sapphire');
        // Center 3x3 Crown Goal
        else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
          cell.classList.add('ludo-center-crown');
          if (r === 7 && c === 7) cell.innerHTML = '<span class="crown-emblem">👑</span>';
        }

        // Colored Home Stretches
        if (r === 7 && c >= 1 && c <= 5) cell.classList.add('stretch-crimson');
        if (c === 7 && r >= 1 && r <= 5) cell.classList.add('stretch-emerald');
        if (c === 7 && r >= 9 && r <= 13) cell.classList.add('stretch-gold');
        if (r === 7 && c >= 9 && c <= 13) cell.classList.add('stretch-sapphire');

        // Safe Star Squares on Main Track
        const trackIdx = MAIN_TRACK.findIndex(([tr, tc]) => tr === r && tc === c);
        if (trackIdx !== -1 && SAFE_TRACK_INDICES.has(trackIdx)) {
          cell.classList.add('ludo-safe-star');
          cell.innerHTML = '<span class="safe-star-mark">★</span>';
        }

        gridEl.appendChild(cell);
      }
    }
  }

  // Convert a player's token step (-1..56) to [row, col] on the 15x15 grid
  getTokenGridCoord(playerCfg, tokenIndex, stepVal) {
    if (stepVal === -1) {
      return playerCfg.yardCoords[tokenIndex];
    }
    if (stepVal >= 0 && stepVal <= 50) {
      const globalIdx = (playerCfg.startOffset + stepVal) % 52;
      return MAIN_TRACK[globalIdx];
    }
    if (stepVal >= 51 && stepVal <= 56) {
      return playerCfg.homeStretch[stepVal - 51];
    }
    return [7, 7];
  }

  getGlobalTrackIndex(playerCfg, stepVal) {
    if (stepVal < 0 || stepVal > 50) return null;
    return (playerCfg.startOffset + stepVal) % 52;
  }

  getLegalMovesForPlayer(playerId, dieVal) {
    const steps = this.tokens[playerId];
    const legalIndices = [];

    steps.forEach((step, idx) => {
      if (step === -1) {
        if (dieVal === 6) legalIndices.push(idx);
      } else if (step + dieVal <= 56) {
        legalIndices.push(idx);
      }
    });

    return legalIndices;
  }

  updateBoardUI() {
    // Clear existing rendered tokens
    this.mountEl.querySelectorAll('.ludo-token').forEach(el => el.remove());

    // Update HUD active turn & scores
    PLAYERS_CONFIG.forEach((p, idx) => {
      const pill = document.getElementById(`ludo-pill-${p.id}`);
      if (pill) pill.classList.toggle('active-turn', idx === this.turnIndex);

      const finishedCount = this.tokens[p.id].filter(s => s === 56).length;
      const scoreEl = document.getElementById(`ludo-score-${p.id}`);
      if (scoreEl) scoreEl.textContent = `Crown: ${finishedCount}/4`;
    });

    // Place all 16 tokens on the 15x15 grid
    PLAYERS_CONFIG.forEach(p => {
      this.tokens[p.id].forEach((step, tIdx) => {
        const [r, c] = this.getTokenGridCoord(p, tIdx, step);
        const cell = this.mountEl.querySelector(`[data-rc="${r},${c}"]`);
        if (!cell) return;

        const tokEl = document.createElement('button');
        tokEl.className = `ludo-token tok-${p.id}`;
        tokEl.style.backgroundColor = p.colorHex;

        const isSelectable =
          p.id === 'gold' &&
          this.turnIndex === 0 &&
          this.legalTokenIndices.includes(tIdx) &&
          !this.isBusy;

        if (isSelectable) {
          tokEl.classList.add('tok-selectable');
          tokEl.addEventListener('click', e => {
            e.stopPropagation();
            this.executeTokenMove('gold', tIdx, this.currentDie);
          });
        }

        cell.appendChild(tokEl);
      });
    });

    const rollBtn = document.getElementById('ludo-roll-btn');
    const sixBtn = document.getElementById('ludo-six-btn');
    const canRoll = !this.isBusy && this.turnIndex === 0 && this.currentDie === null && !this.gameEnded;
    if (rollBtn) rollBtn.disabled = !canRoll;
    if (sixBtn) sixBtn.disabled = !canRoll;
  }

  async handlePlayerRoll(forcedArray = null) {
    if (this.isBusy || this.turnIndex !== 0 || this.currentDie !== null || this.gameEnded) return;
    this.isBusy = true;

    const res = await this.diceBox.roll(forcedArray);
    this.isBusy = false;
    if (!res) return;

    const die = res[0];
    this.currentDie = die;

    // Update Daily Challenge #2 if a 6 is rolled
    if (die === 6 && state.dailyChallenges?.[1] && !state.dailyChallenges[1].completed) {
      state.dailyChallenges[1].progress = 1;
      state.dailyChallenges[1].completed = true;
      saveState();
    }

    // Three consecutive 6s forfeit turn per official Ludo rule
    if (die === 6) {
      this.consecutiveSixes += 1;
      if (this.consecutiveSixes >= 3) {
        this.setStatus('Rolled three 6s in a row! Turn passes.');
        this.currentDie = null;
        this.consecutiveSixes = 0;
        setTimeout(() => this.advanceTurn(), 900);
        return;
      }
    } else {
      this.consecutiveSixes = 0;
    }

    const legal = this.getLegalMovesForPlayer('gold', die);
    this.legalTokenIndices = legal;

    if (legal.length === 0) {
      this.setStatus(`Rolled ${die} — No legal moves available.`);
      this.currentDie = null;
      this.updateBoardUI();
      setTimeout(() => this.advanceTurn(), 850);
    } else if (legal.length === 1) {
      // Auto-move if only a single token has a legal move
      this.setStatus(`Rolled ${die} — Moving your only legal token...`);
      this.updateBoardUI();
      setTimeout(() => this.executeTokenMove('gold', legal[0], die), 360);
    } else {
      this.setStatus(`Rolled ${die} — Tap a glowing Gold token to move`);
      this.updateBoardUI();
    }
  }

  executeTokenMove(playerId, tokenIdx, dieVal) {
    this.isBusy = true;
    const playerCfg = PLAYERS_CONFIG.find(p => p.id === playerId);
    const oldStep = this.tokens[playerId][tokenIdx];
    const newStep = oldStep === -1 ? 0 : oldStep + dieVal;

    const [fromR, fromC] = this.getTokenGridCoord(playerCfg, tokenIdx, oldStep);
    const [toR, toC] = this.getTokenGridCoord(playerCfg, tokenIdx, newStep);
    const fromEl = this.mountEl.querySelector(`[data-rc="${fromR},${fromC}"]`);
    const toEl = this.mountEl.querySelector(`[data-rc="${toR},${toC}"]`);

    this.tokens[playerId][tokenIdx] = newStep;
    this.legalTokenIndices = [];
    this.currentDie = null;

    // Check for Capturing Opponent Tokens on non-safe Main Track squares
    let capturedOpponent = false;
    const destGlobalIdx = this.getGlobalTrackIndex(playerCfg, newStep);

    if (destGlobalIdx !== null && !SAFE_TRACK_INDICES.has(destGlobalIdx)) {
      PLAYERS_CONFIG.forEach(otherP => {
        if (otherP.id === playerId) return;
        this.tokens[otherP.id].forEach((otherStep, oIdx) => {
          const otherGlobal = this.getGlobalTrackIndex(otherP, otherStep);
          if (otherGlobal === destGlobalIdx) {
            this.tokens[otherP.id][oIdx] = -1; // Send back to starting yard
            capturedOpponent = true;
          }
        });
      });
    }

    SharedPieceAnimator.animateMove(fromEl, toEl, playerCfg.tokenSymbol, () => {
      if (capturedOpponent) {
        SharedPieceAnimator.pulseBoard(document.getElementById('ludo-board-frame'), 'capture');
        this.context.setQuote?.(getAIQuote('goodMove'));
      }

      this.isBusy = false;
      this.updateBoardUI();

      // Check Win Condition (All 4 tokens at step 56)
      if (this.tokens[playerId].every(s => s === 56)) {
        this.finishLudoGame(playerId === 'gold', playerCfg.name);
        return;
      }

      // Bonus roll on rolling a 6, capturing a piece, or reaching the center crown (56)
      const earnedBonusRoll = dieVal === 6 || capturedOpponent || newStep === 56;
      if (earnedBonusRoll) {
        if (playerId === 'gold') {
          this.setStatus('Bonus Turn! Roll the 3D Dice Cup again.');
          this.updateBoardUI();
        } else {
          setTimeout(() => this.runAITurn(), 550);
        }
      } else {
        this.advanceTurn();
      }
    });
  }

  advanceTurn() {
    if (this.gameEnded) return;
    this.turnIndex = (this.turnIndex + 1) % 4;
    this.consecutiveSixes = 0;
    this.currentDie = null;
    this.legalTokenIndices = [];
    this.updateBoardUI();

    if (this.turnIndex === 0) {
      this.setStatus('Your Turn (Royal Gold) — Roll the 3D Dice Cup');
    } else {
      this.runAITurn();
    }
  }

  async runAITurn() {
    if (this.gameEnded) return;
    const aiPlayer = PLAYERS_CONFIG[this.turnIndex];
    this.isBusy = true;
    this.setStatus(`${aiPlayer.name} is rolling the 3D die...`);
    this.updateBoardUI();

    await new Promise(r => setTimeout(r, 420));
    const rolled = await this.diceBox.roll();
    if (!rolled) return;

    const die = rolled[0];
    const legal = this.getLegalMovesForPlayer(aiPlayer.id, die);

    if (legal.length === 0) {
      this.isBusy = false;
      this.setStatus(`${aiPlayer.name} rolled ${die} — No legal moves.`);
      setTimeout(() => this.advanceTurn(), 650);
      return;
    }

    // Strategic AI Token Selection Heuristics
    let chosenIdx = legal[0];
    let bestScore = -Infinity;

    for (const tIdx of legal) {
      const curStep = this.tokens[aiPlayer.id][tIdx];
      const nextStep = curStep === -1 ? 0 : curStep + die;
      let score = 0;

      // 1. Exiting the yard on a 6 is top priority
      if (curStep === -1 && die === 6) score += 90;

      // 2. Reaching exact home crown (56)
      if (nextStep === 56) score += 110;

      // 3. Capturing an opponent token
      const nextGlobal = this.getGlobalTrackIndex(aiPlayer, nextStep);
      if (nextGlobal !== null && !SAFE_TRACK_INDICES.has(nextGlobal)) {
        const canHit = PLAYERS_CONFIG.some(op =>
          op.id !== aiPlayer.id &&
          this.tokens[op.id].some(os => this.getGlobalTrackIndex(op, os) === nextGlobal)
        );
        if (canHit) score += 120;
      }

      // 4. Landing on a Safe Star Square
      if (nextGlobal !== null && SAFE_TRACK_INDICES.has(nextGlobal)) {
        score += 45;
      }

      // 5. Progress along the track
      score += nextStep * 1.2;

      if (score > bestScore) {
        bestScore = score;
        chosenIdx = tIdx;
      }
    }

    setTimeout(() => {
      this.executeTokenMove(aiPlayer.id, chosenIdx, die);
    }, 380);
  }

  finishLudoGame(playerWon, winnerName) {
    this.gameEnded = true;
    this.isBusy = false;
    const modal = document.getElementById('ludo-outcome-modal');
    const titleEl = document.getElementById('ludo-outcome-title');
    const descEl = document.getElementById('ludo-outcome-desc');
    if (modal) modal.classList.remove('hidden');

    if (playerWon) {
      titleEl.textContent = 'ROYAL LUDO VICTORY!';
      descEl.textContent = 'All 4 Gold tokens crowned before the Masters!';
      this.context.setQuote?.(getAIQuote('win'));
      recordGameOutcome('ludo', true, '4-Player Royal Table');
    } else {
      titleEl.textContent = `${winnerName.toUpperCase()} WINS`;
      descEl.textContent = 'An AI Master crowned all 4 tokens first.';
      this.context.setQuote?.(getAIQuote('lose'));
      recordGameOutcome('ludo', false, `Won by ${winnerName}`);
    }
  }

  setStatus(text) {
    const el = document.getElementById('ludo-status-strip');
    if (el) el.textContent = text;
  }

  destroy() {
    if (this.diceBox) this.diceBox.destroy();
  }
}

// Register Ludo Engine into Global Stage Registry
window.GrandBoardEngines = window.GrandBoardEngines || {};
window.GrandBoardEngines.ludo = LuxuryLudoGame;