// =========================================================
// GRAND BOARD — Stage 3: Complete Luxury Chess Engine
// =========================================================

import { audio, state } from './app.js';
import { SharedPieceAnimator, getAIQuote, recordGameOutcome } from './shared-engine.js';

const PIECE_UNICODE = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚'
};

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Positional Piece-Square Tables (White perspective)
const PST = {
  p: [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
  ],
  n: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  b: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ]
};

export class LuxuryChessGame {
  constructor(mountEl, context = {}) {
    this.mountEl = mountEl;
    this.context = context;
    this.chess = new window.Chess();
    this.selectedSquare = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.pendingPromotion = null;
    this.practiceMode = true;
    this.isAIThinking = false;
    this.gameEnded = false;

    // Chess Clocks (10 minutes per side)
    this.timers = { w: 600, b: 600 };
    this.clockInterval = null;

    this.renderLayout();
    this.startClock();
    this.updateBoardUI();
  }

  renderLayout() {
    this.mountEl.innerHTML = `
      <div class="chess-stage-wrap">
        
        <!-- Top Opponent Status & Clock -->
        <div class="chess-hud-row">
          <div class="chess-player-badge">
            <span class="chess-side-dot black-dot"></span>
            <div>
              <strong id="chess-ai-name">${this.context.ai?.name || 'The Gentleman'}</strong>
              <small id="chess-captured-by-b" class="captured-tray"></small>
            </div>
          </div>
          <div class="chess-clock" id="clock-b">10:00</div>
        </div>

        <!-- Live Position Evaluation Bar (Game Analysis) -->
        <div class="chess-eval-bar-wrap" title="Live Position Evaluation">
          <div id="chess-eval-fill" class="chess-eval-fill" style="width: 50%;"></div>
          <span id="chess-eval-label" class="chess-eval-label">0.0 Equal</span>
        </div>

        <!-- 3D-Styled Luxury Chess Board -->
        <div class="chess-board-frame" id="chess-board-frame">
          <div class="chess-board-grid" id="chess-board-grid"></div>

          <!-- Pawn Promotion Modal Overlay -->
          <div id="chess-promo-modal" class="chess-overlay-modal hidden">
            <p class="promo-title">PROMOTE PAWN TO</p>
            <div class="promo-choices">
              <button data-promo="q">♕<span>Queen</span></button>
              <button data-promo="r">♖<span>Rook</span></button>
              <button data-promo="b">♗<span>Bishop</span></button>
              <button data-promo="n">♘<span>Knight</span></button>
            </div>
          </div>

          <!-- Checkmate / Outcome Cinematic Overlay -->
          <div id="chess-outcome-modal" class="chess-overlay-modal hidden">
            <div class="outcome-crown" id="outcome-icon">👑</div>
            <h3 id="outcome-title">CHECKMATE</h3>
            <p id="outcome-desc">Victory at the Grand Table</p>
            <button class="btn-gold" id="chess-rematch-btn" style="margin-top:12px;">Play Again</button>
          </div>
        </div>

        <!-- Bottom Player Status & Clock -->
        <div class="chess-hud-row">
          <div class="chess-player-badge">
            <span class="chess-side-dot white-dot"></span>
            <div>
              <strong>You (White Ivory)</strong>
              <small id="chess-captured-by-w" class="captured-tray"></small>
            </div>
          </div>
          <div class="chess-clock active-clock" id="clock-w">10:00</div>
        </div>

        <!-- Move History Ribbon -->
        <div class="chess-history-strip" id="chess-history-strip">
          <span style="color:var(--text-muted);">Opening ready — Make your first move.</span>
        </div>

        <!-- Controls Bar -->
        <div class="chess-controls-bar">
          <button class="btn-outline" id="chess-mode-btn">Practice: ON</button>
          <button class="btn-outline" id="chess-undo-btn">↩ Undo</button>
          <button class="btn-outline" id="chess-hint-btn">💡 Analysis Hint</button>
          <button class="btn-gold" id="chess-new-btn">New Table</button>
        </div>

      </div>
    `;

    this.boardGrid = document.getElementById('chess-board-grid');
    this.boardFrame = document.getElementById('chess-board-frame');

    // Bind Promotion Choices
    document.querySelectorAll('[data-promo]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.pendingPromotion) return;
        const promoPiece = btn.dataset.promo;
        const { from, to } = this.pendingPromotion;
        this.pendingPromotion = null;
        document.getElementById('chess-promo-modal')?.classList.add('hidden');
        this.executePlayerMove(from, to, promoPiece);
      });
    });

    // Bind Controls
    document.getElementById('chess-mode-btn')?.addEventListener('click', e => {
      this.practiceMode = !this.practiceMode;
      e.target.textContent = `Practice: ${this.practiceMode ? 'ON' : 'OFF'}`;
      document.getElementById('chess-undo-btn').disabled = !this.practiceMode;
      audio.play('button');
    });

    document.getElementById('chess-undo-btn')?.addEventListener('click', () => {
      if (!this.practiceMode || this.isAIThinking || this.gameEnded) return;
      this.chess.undo(); // Undo AI move
      this.chess.undo(); // Undo Player move
      this.selectedSquare = null;
      this.legalTargets = [];
      audio.play('wood_move');
      this.updateBoardUI();
    });

    document.getElementById('chess-hint-btn')?.addEventListener('click', () => {
      if (this.isAIThinking || this.gameEnded || this.chess.turn() !== 'w') return;
      audio.play('button');
      const best = this.findBestMove('w', 2);
      if (best) {
        this.selectedSquare = best.from;
        this.legalTargets = this.chess.moves({ square: best.from, verbose: true });
        this.updateBoardUI();
        this.context.setQuote?.(`Suggested line: ${best.san} (${best.from.toUpperCase()} → ${best.to.toUpperCase()})`);
      }
    });

    document.getElementById('chess-new-btn')?.addEventListener('click', () => this.resetGame());
    document.getElementById('chess-rematch-btn')?.addEventListener('click', () => this.resetGame());
  }

  resetGame() {
    audio.play('wood_move');
    this.chess.reset();
    this.selectedSquare = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.gameEnded = false;
    this.timers = { w: 600, b: 600 };
    document.getElementById('chess-outcome-modal')?.classList.add('hidden');
    this.context.setQuote?.(getAIQuote('start'));
    this.updateBoardUI();
  }

  startClock() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.clockInterval = setInterval(() => {
      if (this.gameEnded) return;
      const turn = this.chess.turn();
      this.timers[turn] = Math.max(0, this.timers[turn] - 1);
      this.renderClocks();

      if (this.timers[turn] === 0) {
        this.handleGameOver(turn === 'b', 'Time Flag Fallen');
      }
    }, 1000);
  }

  renderClocks() {
    const fmt = secs => {
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };
    const wEl = document.getElementById('clock-w');
    const bEl = document.getElementById('clock-b');
    if (wEl) {
      wEl.textContent = fmt(this.timers.w);
      wEl.classList.toggle('active-clock', this.chess.turn() === 'w');
    }
    if (bEl) {
      bEl.textContent = fmt(this.timers.b);
      bEl.classList.toggle('active-clock', this.chess.turn() === 'b');
    }
  }

  updateBoardUI() {
    if (!this.boardGrid) return;
    const board = this.chess.board();
    const inCheck = this.chess.in_check();
    const turn = this.chess.turn();

    this.boardGrid.innerHTML = '';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = String.fromCharCode(97 + c);
        const rank = 8 - r;
        const sqName = `${file}${rank}`;
        const isLight = (r + c) % 2 === 0;
        const cell = board[r][c];

        const sqEl = document.createElement('div');
        sqEl.className = `chess-sq ${isLight ? 'sq-light' : 'sq-dark'}`;
        sqEl.dataset.sq = sqName;

        // Coordinate labels on edges
        if (c === 0) {
          const rLbl = document.createElement('span');
          rLbl.className = 'sq-coord-rank';
          rLbl.textContent = rank;
          sqEl.appendChild(rLbl);
        }
        if (r === 7) {
          const fLbl = document.createElement('span');
          fLbl.className = 'sq-coord-file';
          fLbl.textContent = file;
          sqEl.appendChild(fLbl);
        }

        // Highlights
        if (this.selectedSquare === sqName) sqEl.classList.add('sq-selected');
        if (this.lastMove && (this.lastMove.from === sqName || this.lastMove.to === sqName)) {
          sqEl.classList.add('sq-last-move');
        }

        const legalMove = this.legalTargets.find(m => m.to === sqName);
        if (legalMove) {
          const dot = document.createElement('span');
          dot.className = legalMove.captured ? 'sq-capture-ring' : 'sq-legal-dot';
          sqEl.appendChild(dot);
        }

        // Render Piece
        if (cell) {
          if (inCheck && cell.type === 'k' && cell.color === turn) {
            sqEl.classList.add('sq-king-check');
          }
          const pEl = document.createElement('span');
          pEl.className = `chess-piece-3d ${cell.color === 'w' ? 'piece-ivory' : 'piece-obsidian'}`;
          if (this.selectedSquare === sqName) pEl.classList.add('piece-lifted');
          pEl.textContent = PIECE_UNICODE[`${cell.color}${cell.type}`];
          sqEl.appendChild(pEl);
        }

        sqEl.addEventListener('click', () => this.onSquareTap(sqName));
        this.boardGrid.appendChild(sqEl);
      }
    }

    this.updateAnalysisAndHistory();
    this.checkGameState();
  }

  onSquareTap(sqName) {
    if (this.isAIThinking || this.gameEnded || this.chess.turn() !== 'w') return;

    // Check if tapping a legal destination square
    const targetMove = this.legalTargets.find(m => m.to === sqName);
    if (this.selectedSquare && targetMove) {
      // Check for Pawn Promotion
      if (targetMove.flags.includes('p')) {
        this.pendingPromotion = { from: this.selectedSquare, to: sqName };
        document.getElementById('chess-promo-modal')?.classList.remove('hidden');
        audio.play('button');
        return;
      }
      this.executePlayerMove(this.selectedSquare, sqName, 'q');
      return;
    }

    // Otherwise select own piece
    const piece = this.chess.get(sqName);
    if (piece && piece.color === 'w') {
      audio.play('button');
      this.selectedSquare = sqName;
      this.legalTargets = this.chess.moves({ square: sqName, verbose: true });
      this.updateBoardUI();
    } else {
      this.selectedSquare = null;
      this.legalTargets = [];
      this.updateBoardUI();
    }
  }

  executePlayerMove(fromSq, toSq, promotion = 'q') {
    const fromEl = this.boardGrid.querySelector(`[data-sq="${fromSq}"]`);
    const toEl = this.boardGrid.querySelector(`[data-sq="${toSq}"]`);
    const movingPiece = this.chess.get(fromSq);
    const symbol = movingPiece ? PIECE_UNICODE[`${movingPiece.color}${movingPiece.type}`] : '♙';

    const moveObj = this.chess.move({ from: fromSq, to: toSq, promotion });
    if (!moveObj) return;

    this.selectedSquare = null;
    this.legalTargets = [];
    this.lastMove = { from: fromSq, to: toSq };

    SharedPieceAnimator.animateMove(fromEl, toEl, symbol, () => {
      if (moveObj.captured) {
        SharedPieceAnimator.pulseBoard(this.boardFrame, 'capture');
      } else if (this.chess.in_check()) {
        SharedPieceAnimator.pulseBoard(this.boardFrame, 'check');
      }

      this.updateBoardUI();

      if (!this.gameEnded && this.chess.turn() === 'b') {
        this.isAIThinking = true;
        setTimeout(() => this.makeAIMove(), 420);
      }
    });
  }

  // 4-Level Minimax + Alpha-Beta Pruning Chess AI Engine
  makeAIMove() {
    if (this.gameEnded) return;

    const diff = state.selectedDifficulty || 'Casual';
    let depth = 2;
    if (diff === 'Beginner') depth = 1;
    else if (diff === 'Casual') depth = 2;
    else if (diff === 'Expert') depth = 3;
    else if (diff === 'Master') depth = 3;

    const chosenMove = this.findBestMove('b', depth, diff === 'Beginner');
    if (!chosenMove) {
      this.isAIThinking = false;
      this.checkGameState();
      return;
    }

    const fromEl = this.boardGrid.querySelector(`[data-sq="${chosenMove.from}"]`);
    const toEl = this.boardGrid.querySelector(`[data-sq="${chosenMove.to}"]`);
    const symbol = PIECE_UNICODE[`b${chosenMove.piece}`] || '♟';

    const executed = this.chess.move(chosenMove);
    this.lastMove = { from: chosenMove.from, to: chosenMove.to };

    SharedPieceAnimator.animateMove(fromEl, toEl, symbol, () => {
      this.isAIThinking = false;
      if (executed?.captured) {
        SharedPieceAnimator.pulseBoard(this.boardFrame, 'capture');
        this.context.setQuote?.(getAIQuote('goodMove'));
      } else if (this.chess.in_check()) {
        SharedPieceAnimator.pulseBoard(this.boardFrame, 'check');
      }
      this.updateBoardUI();
    });
  }

  evaluateBoard() {
    const board = this.chess.board();
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        let val = PIECE_VALUES[cell.type] || 0;
        const table = PST[cell.type];
        if (table) {
          const tableRow = cell.color === 'w' ? r : 7 - r;
          val += table[tableRow][c];
        }
        score += cell.color === 'w' ? val : -val;
      }
    }
    return score;
  }

  findBestMove(color, depth, allowSoftMoves = false) {
    const moves = this.chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    // Beginner ("The Friend") occasionally plays a casual second-best move
    if (allowSoftMoves && Math.random() < 0.35) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // Order captures first for faster alpha-beta pruning
    moves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0));

    let bestMove = moves[0];
    let bestValue = color === 'w' ? -Infinity : Infinity;

    for (const move of moves) {
      this.chess.move(move);
      const val = this.minimax(depth - 1, -Infinity, Infinity, color === 'b');
      this.chess.undo();

      if (color === 'w' && val > bestValue) {
        bestValue = val;
        bestMove = move;
      } else if (color === 'b' && val < bestValue) {
        bestValue = val;
        bestMove = move;
      }
    }
    return bestMove;
  }

  minimax(depth, alpha, beta, isMaximizingWhite) {
    if (depth === 0 || this.chess.game_over()) {
      return this.evaluateBoard();
    }

    const moves = this.chess.moves({ verbose: true });
    if (isMaximizingWhite) {
      let maxEval = -Infinity;
      for (const m of moves) {
        this.chess.move(m);
        const ev = this.minimax(depth - 1, alpha, beta, false);
        this.chess.undo();
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        this.chess.move(m);
        const ev = this.minimax(depth - 1, alpha, beta, true);
        this.chess.undo();
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  updateAnalysisAndHistory() {
    // 1. Evaluation Bar
    const rawEval = this.evaluateBoard() / 100;
    const clamped = Math.max(-10, Math.min(10, rawEval));
    const whitePct = Math.round(50 + (clamped / 10) * 45);

    const fillEl = document.getElementById('chess-eval-fill');
    const lblEl = document.getElementById('chess-eval-label');
    if (fillEl) fillEl.style.width = `${whitePct}%`;
    if (lblEl) {
      const sign = rawEval > 0 ? '+' : '';
      lblEl.textContent = `${sign}${rawEval.toFixed(1)} ${rawEval > 0.3 ? 'White Edge' : rawEval < -0.3 ? 'Black Edge' : 'Balanced'}`;
    }

    // 2. Move History Strip
    const history = this.chess.history();
    const stripEl = document.getElementById('chess-history-strip');
    if (stripEl && history.length > 0) {
      const pairs = [];
      for (let i = 0; i < history.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        pairs.push(`<span class="hist-pair"><b>${moveNum}.</b> ${history[i]} ${history[i + 1] || ''}</span>`);
      }
      stripEl.innerHTML = pairs.join(' ');
      stripEl.scrollLeft = stripEl.scrollWidth;
    }
  }

  checkGameState() {
    if (this.gameEnded) return;

    if (this.chess.in_checkmate()) {
      const playerWon = this.chess.turn() === 'b';
      this.handleGameOver(playerWon, 'Official Checkmate');
    } else if (this.chess.in_stalemate()) {
      this.handleGameOver(false, 'Draw by Stalemate', true);
    } else if (this.chess.in_threefold_repetition()) {
      this.handleGameOver(false, 'Draw by Threefold Repetition', true);
    } else if (this.chess.insufficient_material()) {
      this.handleGameOver(false, 'Draw by Insufficient Material', true);
    } else if (this.chess.in_draw()) {
      this.handleGameOver(false, 'Official 50-Move Draw', true);
    }
  }

  handleGameOver(playerWon, reason, isDraw = false) {
    this.gameEnded = true;
    const modal = document.getElementById('chess-outcome-modal');
    const titleEl = document.getElementById('outcome-title');
    const descEl = document.getElementById('outcome-desc');
    const iconEl = document.getElementById('outcome-icon');

    if (modal) modal.classList.remove('hidden');

    if (isDraw) {
      iconEl.textContent = '🤝';
      titleEl.textContent = 'ROYAL DRAW';
      descEl.textContent = reason;
    } else if (playerWon) {
      iconEl.textContent = '👑';
      titleEl.textContent = 'CHECKMATE VICTORY';
      descEl.textContent = `${reason} • ${this.chess.history().length} moves`;
      this.context.setQuote?.(getAIQuote('win'));
      recordGameOutcome('chess', true, reason);
    } else {
      iconEl.textContent = '♟️';
      titleEl.textContent = 'CHECKMATE DEFEAT';
      descEl.textContent = `${reason} • ${this.chess.history().length} moves`;
      this.context.setQuote?.(getAIQuote('lose'));
      recordGameOutcome('chess', false, reason);
    }
  }

  destroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }
}

// Register Chess Engine into Global Stage Registry
window.GrandBoardEngines = window.GrandBoardEngines || {};
window.GrandBoardEngines.chess = LuxuryChessGame;