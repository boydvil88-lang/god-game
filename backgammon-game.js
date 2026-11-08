// =========================================================
// GRAND BOARD — Stage 4: Complete Luxury Backgammon Engine
// =========================================================

import { audio, state } from './app.js';
import {
  Shared3DDiceBox,
  SharedPieceAnimator,
  getAIQuote,
  recordGameOutcome
} from './shared-engine.js';

export class LuxuryBackgammonGame {
  constructor(mountEl, context = {}) {
    this.mountEl = mountEl;
    this.context = context;
    this.diceBox = null;

    // Points 1..24:
    // Positive (+n) = White (Player) checkers moving 24 -> 1 (Home: 1..6)
    // Negative (-n) = Black (AI) checkers moving 1 -> 24 (Home: 19..24)
    this.points = new Array(25).fill(0);
    this.bar = { w: 0, b: 0 };
    this.off = { w: 0, b: 0 };

    this.turn = 'w';
    this.dice = [];
    this.remainingMoves = [];
    this.selectedFrom = null; // 'bar' or 1..24
    this.legalTargets = [];   // Array of { to: 1..24 | 'off', dieUsed }
    this.turnSnapshots = [];  // For Undo within practice mode
    this.moveHistory = [];

    this.doublingCube = { value: 1, owner: null };
    this.practiceMode = true;
    this.isBusy = false;
    this.gameEnded = false;

    this.initStandardBoard();
    this.renderLayout();
    this.updateBoardUI();
  }

  initStandardBoard() {
    this.points.fill(0);
    // White (Player): moves 24 -> 1
    this.points[24] = 2;
    this.points[13] = 5;
    this.points[8] = 3;
    this.points[6] = 5;

    // Black (AI): moves 1 -> 24
    this.points[1] = -2;
    this.points[12] = -5;
    this.points[17] = -3;
    this.points[19] = -5;

    this.bar = { w: 0, b: 0 };
    this.off = { w: 0, b: 0 };
    this.turn = 'w';
    this.dice = [];
    this.remainingMoves = [];
    this.selectedFrom = null;
    this.legalTargets = [];
    this.turnSnapshots = [];
    this.moveHistory = [];
    this.doublingCube = { value: 1, owner: null };
    this.gameEnded = false;
  }

  renderLayout() {
    this.mountEl.innerHTML = `
      <div class="bg-stage-wrap">
        
        <!-- Top Telemetry & Doubling Cube Bar -->
        <div class="bg-hud-bar">
          <div class="bg-score-pill">
            <span class="checker-mini white-mini"></span>
            <span>You • Off: <b id="bg-off-w">0</b>/15</span>
          </div>

          <button class="bg-cube-badge" id="bg-double-btn" title="Offer Double Stakes">
            <span>CUBE</span>
            <strong id="bg-cube-val">1x</strong>
          </button>

          <div class="bg-score-pill">
            <span class="checker-mini black-mini"></span>
            <span>${this.context.ai?.name || 'AI'} • Off: <b id="bg-off-b">0</b>/15</span>
          </div>
        </div>

        <!-- Walnut & Obsidian Backgammon Case -->
        <div class="bg-board-cabinet" id="bg-board-cabinet">
          
          <!-- Top Row: Points 13 -> 18 | BAR | Points 19 -> 24 -->
          <div class="bg-half-row">
            <div class="bg-quadrant" id="bg-quad-tl"></div>
            <div class="bg-center-bar" id="bg-bar-top" data-bar="b">
              <span class="bar-label">BAR</span>
              <div class="bar-stack" id="bg-bar-stack-b"></div>
            </div>
            <div class="bg-quadrant" id="bg-quad-tr"></div>
          </div>

          <!-- Center Status & Remaining Dice Pips -->
          <div class="bg-mid-rail">
            <span id="bg-turn-status">Your Turn — Roll the 3D Dice Cup</span>
            <div class="bg-active-dice-Row" id="bg-remaining-dice"></div>
          </div>

          <!-- Bottom Row: Points 12 -> 7 | BAR | Points 6 -> 1 -->
          <div class="bg-half-row">
            <div class="bg-quadrant" id="bg-quad-bl"></div>
            <div class="bg-center-bar" id="bg-bar-bot" data-bar="w">
              <div class="bar-stack" id="bg-bar-stack-w"></div>
              <span class="bar-label">BAR</span>
            </div>
            <div class="bg-quadrant" id="bg-quad-br"></div>
          </div>

          <!-- Bearing Off Tray Button (Highlights when legal) -->
          <div class="bg-bearoff-rail">
            <button class="bg-bearoff-btn" id="bg-bearoff-w">
              🏛️ Bear Off Home Tray (<span id="bg-tray-count-w">0</span>/15)
            </button>
          </div>

          <!-- Victory / Outcome Modal -->
          <div id="bg-outcome-modal" class="chess-overlay-modal hidden">
            <div class="outcome-crown" id="bg-outcome-icon">🎲</div>
            <h3 id="bg-outcome-title">VICTORY</h3>
            <p id="bg-outcome-desc">Backgammon Royal Match Complete</p>
            <button class="btn-gold" id="bg-rematch-btn" style="margin-top:12px;">New Match</button>
          </div>
        </div>

        <!-- Shared 3D Dice Tray + Action Dock -->
        <div class="bg-dice-dock">
          <div id="bg-3d-dice-tray" class="shared-dice-tray bg-compact-tray"></div>
          <div class="bg-action-col">
            <button class="btn-gold" id="bg-roll-btn">🎲 Roll Dice</button>
            <button class="btn-outline" id="bg-undo-btn">↩ Undo</button>
            <button class="btn-outline" id="bg-new-btn">↻ Reset</button>
          </div>
        </div>

      </div>
    `;

    // Initialize Shared 3D Dice Box (2 Dice)
    const trayEl = document.getElementById('bg-3d-dice-tray');
    this.diceBox = new Shared3DDiceBox(trayEl, { diceCount: 2 });

    // Bind Player Bar click
    document.getElementById('bg-bar-bot')?.addEventListener('click', () => {
      if (this.turn === 'w' && this.bar.w > 0 && this.remainingMoves.length > 0 && !this.isBusy) {
        this.selectSource('bar');
      }
    });

    // Bind Bear Off Tray click
    document.getElementById('bg-bearoff-w')?.addEventListener('click', () => {
      if (this.turn !== 'w' || !this.selectedFrom) return;
      const move = this.legalTargets.find(t => t.to === 'off');
      if (move) this.executeMove('w', this.selectedFrom, 'off', move.dieUsed);
    });

    // Bind Doubling Cube
    document.getElementById('bg-double-btn')?.addEventListener('click', () => {
      if (this.turn !== 'w' || this.remainingMoves.length > 0 || this.doublingCube.value >= 64) return;
      if (this.doublingCube.owner === 'b') return;
      this.doublingCube.value *= 2;
      this.doublingCube.owner = 'w';
      audio.play('victory');
      document.getElementById('bg-cube-val').textContent = `${this.doublingCube.value}x`;
      this.context.setQuote?.(`Stakes doubled to ${this.doublingCube.value}x! I accept the challenge.`);
    });

    // Bind Roll, Undo, Reset
    document.getElementById('bg-roll-btn')?.addEventListener('click', () => this.handlePlayerRoll());
    document.getElementById('bg-undo-btn')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('bg-new-btn')?.addEventListener('click', () => this.resetMatch());
    document.getElementById('bg-rematch-btn')?.addEventListener('click', () => this.resetMatch());
  }

  resetMatch() {
    audio.play('wood_move');
    this.initStandardBoard();
    document.getElementById('bg-outcome-modal')?.classList.add('hidden');
    document.getElementById('bg-cube-val').textContent = '1x';
    this.updateBoardUI();
  }

  // Render the 24 triangles across the 4 quadrants
  updateBoardUI() {
    const qTL = document.getElementById('bg-quad-tl');
    const qTR = document.getElementById('bg-quad-tr');
    const qBL = document.getElementById('bg-quad-bl');
    const qBR = document.getElementById('bg-quad-br');
    if (!qTL || !qTR || !qBL || !qBR) return;

    qTL.innerHTML = '';
    qTR.innerHTML = '';
    qBL.innerHTML = '';
    qBR.innerHTML = '';

    const buildPointEl = (ptIndex, isTop) => {
      const count = this.points[ptIndex];
      const owner = count > 0 ? 'w' : count < 0 ? 'b' : null;
      const absCount = Math.abs(count);

      const ptEl = document.createElement('div');
      ptEl.className = `bg-point ${isTop ? 'pt-top' : 'pt-bot'} ${ptIndex % 2 === 0 ? 'pt-even' : 'pt-odd'}`;
      ptEl.dataset.pt = ptIndex;

      if (this.selectedFrom === ptIndex) ptEl.classList.add('pt-selected');
      if (this.legalTargets.some(t => t.to === ptIndex)) ptEl.classList.add('pt-target');

      const numSpan = document.createElement('span');
      numSpan.className = 'pt-num';
      numSpan.textContent = ptIndex;
      ptEl.appendChild(numSpan);

      const stackEl = document.createElement('div');
      stackEl.className = 'pt-checker-stack';

      const visibleCheckers = Math.min(absCount, 5);
      for (let i = 0; i < visibleCheckers; i++) {
        const chk = document.createElement('div');
        chk.className = `bg-checker ${owner === 'w' ? 'chk-ivory' : 'chk-obsidian'}`;
        if (i === visibleCheckers - 1 && absCount > 5) {
          chk.textContent = absCount;
        }
        stackEl.appendChild(chk);
      }

      ptEl.appendChild(stackEl);
      ptEl.addEventListener('click', () => this.onPointTap(ptIndex));
      return ptEl;
    };

    // Top-Left: 13..18
    for (let p = 13; p <= 18; p++) qTL.appendChild(buildPointEl(p, true));
    // Top-Right: 19..24
    for (let p = 19; p <= 24; p++) qTR.appendChild(buildPointEl(p, true));
    // Bottom-Left: 12..7
    for (let p = 12; p >= 7; p--) qBL.appendChild(buildPointEl(p, false));
    // Bottom-Right: 6..1
    for (let p = 6; p >= 1; p--) qBR.appendChild(buildPointEl(p, false));

    // Render Bar Stacks
    this.renderBarStack('w', 'bg-bar-stack-w');
    this.renderBarStack('b', 'bg-bar-stack-b');
    document.getElementById('bg-bar-bot')?.classList.toggle('pt-selected', this.selectedFrom === 'bar');

    // Render Off Counters & Bearoff Highlight
    document.getElementById('bg-off-w').textContent = this.off.w;
    document.getElementById('bg-off-b').textContent = this.off.b;
    document.getElementById('bg-tray-count-w').textContent = this.off.w;

    const bearBtn = document.getElementById('bg-bearoff-w');
    if (bearBtn) {
      bearBtn.classList.toggle('bearoff-ready', this.legalTargets.some(t => t.to === 'off'));
    }

    // Remaining Dice Badges
    const diceRow = document.getElementById('bg-remaining-dice');
    if (diceRow) {
      diceRow.innerHTML = this.remainingMoves
        .map(d => `<span class="bg-die-chip">🎲 ${d}</span>`)
        .join('');
    }

    // Roll button state
    const rollBtn = document.getElementById('bg-roll-btn');
    if (rollBtn) {
      rollBtn.disabled = this.isBusy || this.turn !== 'w' || this.remainingMoves.length > 0 || this.gameEnded;
    }
  }

  renderBarStack(color, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    const count = this.bar[color];
    if (count <= 0) return;

    const chk = document.createElement('div');
    chk.className = `bg-checker ${color === 'w' ? 'chk-ivory' : 'chk-obsidian'}`;
    if (count > 1) chk.textContent = count;
    el.appendChild(chk);
  }

  // Official Backgammon Rule Validation
  canBearOff(color) {
    if (this.bar[color] > 0) return false;
    if (color === 'w') {
      // White home board is 1..6; no White checkers allowed on 7..24
      for (let p = 7; p <= 24; p++) {
        if (this.points[p] > 0) return false;
      }
      return true;
    } else {
      // Black home board is 19..24; no Black checkers allowed on 1..18
      for (let p = 1; p <= 18; p++) {
        if (this.points[p] < 0) return false;
      }
      return true;
    }
  }

  isPointOpenFor(color, ptIndex) {
    if (ptIndex < 1 || ptIndex > 24) return false;
    const val = this.points[ptIndex];
    // Blocked if opponent has 2 or more checkers
    return color === 'w' ? val >= -1 : val <= 1;
  }

  getLegalMovesForSource(color, fromSource) {
    const uniqueDice = [...new Set(this.remainingMoves)];
    const moves = [];

    // Must enter from Bar first if any checker is on the Bar
    if (this.bar[color] > 0 && fromSource !== 'bar') return [];

    for (const die of uniqueDice) {
      if (fromSource === 'bar') {
        const targetPt = color === 'w' ? 25 - die : die;
        if (this.isPointOpenFor(color, targetPt)) {
          moves.push({ from: 'bar', to: targetPt, dieUsed: die });
        }
      } else {
        const fromPt = Number(fromSource);
        const hasPiece = color === 'w' ? this.points[fromPt] > 0 : this.points[fromPt] < 0;
        if (!hasPiece) continue;

        const targetPt = color === 'w' ? fromPt - die : fromPt + die;

        if (targetPt >= 1 && targetPt <= 24) {
          if (this.isPointOpenFor(color, targetPt)) {
            moves.push({ from: fromPt, to: targetPt, dieUsed: die });
          }
        } else if (this.canBearOff(color)) {
          // Exact bear off OR bearing off from highest occupied home point with higher die
          if (color === 'w') {
            if (targetPt === 0) {
              moves.push({ from: fromPt, to: 'off', dieUsed: die });
            } else if (targetPt < 0) {
              const higherOccupied = [6, 5, 4, 3, 2, 1].some(p => p > fromPt && this.points[p] > 0);
              if (!higherOccupied) moves.push({ from: fromPt, to: 'off', dieUsed: die });
            }
          } else {
            if (targetPt === 25) {
              moves.push({ from: fromPt, to: 'off', dieUsed: die });
            } else if (targetPt > 25) {
              const higherOccupied = [19, 20, 21, 22, 23, 24].some(p => p < fromPt && this.points[p] < 0);
              if (!higherOccupied) moves.push({ from: fromPt, to: 'off', dieUsed: die });
            }
          }
        }
      }
    }

    return moves;
  }

  getAllLegalMoves(color) {
    if (this.bar[color] > 0) {
      return this.getLegalMovesForSource(color, 'bar');
    }
    const all = [];
    for (let p = 1; p <= 24; p++) {
      const hasPiece = color === 'w' ? this.points[p] > 0 : this.points[p] < 0;
      if (hasPiece) {
        all.push(...this.getLegalMovesForSource(color, p));
      }
    }
    return all;
  }

  async handlePlayerRoll() {
    if (this.isBusy || this.turn !== 'w' || this.remainingMoves.length > 0 || this.gameEnded) return;
    this.isBusy = true;
    this.turnSnapshots = [];

    const rolled = await this.diceBox.roll();
    this.isBusy = false;
    if (!rolled) return;

    this.dice = rolled;
    this.remainingMoves = rolled[0] === rolled[1]
      ? [rolled[0], rolled[0], rolled[0], rolled[0]]
      : [...rolled];

    this.setStatus(`Rolled ${rolled[0]} & ${rolled[1]} — Select a checker`);
    this.updateBoardUI();

    // Auto-select Bar if player has a checker on Bar
    if (this.bar.w > 0) {
      this.selectSource('bar');
    }

    this.checkIfNoLegalMoves('w');
  }

  selectSource(source) {
    const legal = this.getLegalMovesForSource('w', source);
    if (legal.length === 0) return;
    audio.play('button');
    this.selectedFrom = source;
    this.legalTargets = legal;
    this.updateBoardUI();
  }

  onPointTap(ptIndex) {
    if (this.isBusy || this.turn !== 'w' || this.remainingMoves.length === 0 || this.gameEnded) return;

    // 1. Check if tapping a valid destination for currently selected checker
    if (this.selectedFrom !== null) {
      const move = this.legalTargets.find(t => t.to === ptIndex);
      if (move) {
        this.executeMove('w', this.selectedFrom, ptIndex, move.dieUsed);
        return;
      }
    }

    // 2. Otherwise select own checker on this point
    if (this.bar.w > 0) {
      this.setStatus('You must re-enter your checker from the BAR first!');
      this.selectSource('bar');
      return;
    }

    if (this.points[ptIndex] > 0) {
      this.selectSource(ptIndex);
    } else {
      this.selectedFrom = null;
      this.legalTargets = [];
      this.updateBoardUI();
    }
  }

  executeMove(color, from, to, dieUsed, onDone = null) {
    // Save snapshot for Undo (Player only)
    if (color === 'w') {
      this.turnSnapshots.push({
        points: [...this.points],
        bar: { ...this.bar },
        off: { ...this.off },
        remainingMoves: [...this.remainingMoves]
      });
    }

    const fromEl = from === 'bar'
      ? document.getElementById(color === 'w' ? 'bg-bar-bot' : 'bg-bar-top')
      : this.mountEl.querySelector(`[data-pt="${from}"]`);
    const toEl = to === 'off'
      ? document.getElementById('bg-bearoff-w')
      : this.mountEl.querySelector(`[data-pt="${to}"]`);

    // Deduct from source
    if (from === 'bar') {
      this.bar[color] -= 1;
    } else {
      this.points[from] += color === 'w' ? -1 : 1;
    }

    // Apply to destination & check for hitting an opponent Blot
    let hitBlot = false;
    if (to === 'off') {
      this.off[color] += 1;
    } else {
      if (color === 'w' && this.points[to] === -1) {
        this.points[to] = 1;
        this.bar.b += 1;
        hitBlot = true;
      } else if (color === 'b' && this.points[to] === 1) {
        this.points[to] = -1;
        this.bar.w += 1;
        hitBlot = true;
      } else {
        this.points[to] += color === 'w' ? 1 : -1;
      }
    }

    // Consume die
    const dieIdx = this.remainingMoves.indexOf(dieUsed);
    if (dieIdx !== -1) this.remainingMoves.splice(dieIdx, 1);

    this.selectedFrom = null;
    this.legalTargets = [];

    const symbol = color === 'w' ? '⚪' : '⚫';
    SharedPieceAnimator.animateMove(fromEl, toEl, symbol, () => {
      if (hitBlot) {
        SharedPieceAnimator.pulseBoard(document.getElementById('bg-board-cabinet'), 'capture');
        this.context.setQuote?.(getAIQuote('goodMove'));
      }

      this.updateBoardUI();

      // Check Victory (15 checkers borne off)
      if (this.off[color] >= 15) {
        this.finishMatch(color === 'w');
        return;
      }

      if (color === 'w') {
        if (this.remainingMoves.length === 0) {
          this.startAITurn();
        } else {
          if (this.bar.w > 0) this.selectSource('bar');
          this.checkIfNoLegalMoves('w');
        }
      } else if (onDone) {
        onDone();
      }
    });
  }

  checkIfNoLegalMoves(color) {
    if (this.remainingMoves.length === 0) return;
    const allLegal = this.getAllLegalMoves(color);
    if (allLegal.length === 0) {
      this.setStatus(`${color === 'w' ? 'You have' : 'AI has'} no legal moves — Turn passes.`);
      this.remainingMoves = [];
      this.updateBoardUI();
      setTimeout(() => {
        if (color === 'w') this.startAITurn();
        else {
          this.turn = 'w';
          this.setStatus('Your Turn — Roll the 3D Dice Cup');
          this.updateBoardUI();
        }
      }, 900);
    }
  }

  handleUndo() {
    if (!this.practiceMode || this.turn !== 'w' || this.turnSnapshots.length === 0 || this.isBusy) return;
    const snap = this.turnSnapshots.pop();
    this.points = snap.points;
    this.bar = snap.bar;
    this.off = snap.off;
    this.remainingMoves = snap.remainingMoves;
    this.selectedFrom = null;
    this.legalTargets = [];
    audio.play('wood_move');
    this.updateBoardUI();
  }

  // Strategic Backgammon AI Turn
  async startAITurn() {
    if (this.gameEnded) return;
    this.turn = 'b';
    this.isBusy = true;
    this.setStatus(`${this.context.ai?.name || 'AI'} is shaking the Dice Cup...`);
    this.updateBoardUI();

    await new Promise(r => setTimeout(r, 550));
    const rolled = await this.diceBox.roll();
    if (!rolled) return;

    this.remainingMoves = rolled[0] === rolled[1]
      ? [rolled[0], rolled[0], rolled[0], rolled[0]]
      : [...rolled];

    this.setStatus(`${this.context.ai?.name || 'AI'} rolled ${rolled[0]} & ${rolled[1]}`);
    this.updateBoardUI();

    this.playNextAIMove();
  }

  playNextAIMove() {
    if (this.gameEnded) return;
    if (this.remainingMoves.length === 0) {
      this.turn = 'w';
      this.isBusy = false;
      this.setStatus('Your Turn — Roll the 3D Dice Cup');
      this.updateBoardUI();
      return;
    }

    const legalMoves = this.getAllLegalMoves('b');
    if (legalMoves.length === 0) {
      this.checkIfNoLegalMoves('b');
      this.isBusy = false;
      return;
    }

    // Score each candidate move according to Backgammon heuristics
    const diff = state.selectedDifficulty || 'Casual';
    let bestMove = legalMoves[0];
    let bestScore = -Infinity;

    for (const m of legalMoves) {
      let score = 0;
      if (m.to === 'off') {
        score += 95; // Priority: Bear off
      } else {
        // Hitting a White blot
        if (this.points[m.to] === 1) score += 75;
        // Making a secure point (anchoring with 2nd Black checker)
        if (this.points[m.to] === -1) score += 55;
        // Avoid leaving an exposed blot in White's home board
        if (this.points[m.to] === 0 && m.to <= 6) score -= 18;
        // Advance closer to Black's home (19..24)
        score += m.to * 1.4;
      }

      if (diff === 'Beginner') score += (Math.random() - 0.5) * 60;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    setTimeout(() => {
      this.executeMove('b', bestMove.from, bestMove.to, bestMove.dieUsed, () => {
        this.playNextAIMove();
      });
    }, 460);
  }

  finishMatch(playerWon) {
    this.gameEnded = true;
    this.isBusy = false;
    const isGammon = playerWon ? this.off.b === 0 : this.off.w === 0;
    const matchType = isGammon ? `Gammon (2x) • Cube ${this.doublingCube.value}x` : `Standard • Cube ${this.doublingCube.value}x`;

    const modal = document.getElementById('bg-outcome-modal');
    const titleEl = document.getElementById('bg-outcome-title');
    const descEl = document.getElementById('bg-outcome-desc');
    if (modal) modal.classList.remove('hidden');

    if (playerWon) {
      titleEl.textContent = isGammon ? 'ROYAL GAMMON VICTORY!' : 'BACKGAMMON VICTORY!';
      descEl.textContent = matchType;
      this.context.setQuote?.(getAIQuote('win'));
      recordGameOutcome('backgammon', true, matchType);
    } else {
      titleEl.textContent = 'CLUB DEFEAT';
      descEl.textContent = matchType;
      this.context.setQuote?.(getAIQuote('lose'));
      recordGameOutcome('backgammon', false, matchType);
    }
  }

  setStatus(text) {
    const el = document.getElementById('bg-turn-status');
    if (el) el.textContent = text;
  }

  destroy() {
    if (this.diceBox) this.diceBox.destroy();
  }
}

// Register Backgammon Engine into Global Stage Registry
window.GrandBoardEngines = window.GrandBoardEngines || {};
window.GrandBoardEngines.backgammon = LuxuryBackgammonGame;