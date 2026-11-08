// =========================================================
// GRAND BOARD — Stage 6: Domino, Checkers & Atelier Skins
// =========================================================

import { audio, state, saveState } from './app.js';
import { SharedPieceAnimator, getAIQuote, recordGameOutcome } from './shared-engine.js';

// --- 1. LUXURY DOMINO ENGINE ---
export class LuxuryDominoGame {
  constructor(mountEl, context = {}) {
    this.mountEl = mountEl;
    this.context = context;
    this.boardTiles = []; // [leftEnd, rightEnd]
    this.playerHand = [[6,6], [5,4], [3,3], [2,1], [4,0], [1,1]];
    this.aiHandCount = 6;
    this.turn = 'player';
    this.isBusy = false;
    this.gameEnded = false;

    this.renderLayout();
    this.updateUI();
  }

  renderLayout() {
    this.mountEl.innerHTML = `
      <div class="domino-stage-wrap">
        <div class="chess-hud-row">
          <div class="chess-player-badge">
            <span class="chess-side-dot black-dot"></span>
            <strong>${this.context.ai?.name || 'The Gentleman'} (Tiles: <span id="ai-tile-count">6</span>)</strong>
          </div>
          <span class="priority-tag">Block & Draw Variant</span>
        </div>

        <div class="domino-board-canvas" id="domino-board-canvas">
          <div class="domino-chain-row" id="domino-chain">
            <span style="color:var(--text-muted); font-size:12px;">Place first tile to open the table</span>
          </div>
        </div>

        <div class="chess-hud-row" style="flex-direction:column; align-items:flex-start; gap:6px;">
          <span style="font-size:11px; color:var(--gold-secondary);">Your Ivory Hand (Tap to place):</span>
          <div class="domino-hand-row" id="player-hand-row"></div>
        </div>

        <div class="chess-controls-bar">
          <button class="btn-outline" id="domino-draw-btn">📥 Draw Tile</button>
          <button class="btn-gold" id="domino-new-btn">New Table</button>
        </div>
      </div>
    `;

    document.getElementById('domino-new-btn')?.addEventListener('click', () => this.resetGame());
    document.getElementById('domino-draw-btn')?.addEventListener('click', () => {
      if (this.turn !== 'player' || this.isBusy) return;
      this.playerHand.push([Math.floor(Math.random()*7), Math.floor(Math.random()*7)]);
      audio.play('button');
      this.updateUI();
    });
  }

  resetGame() {
    audio.play('wood_move');
    this.boardTiles = [];
    this.playerHand = [[6,6], [5,4], [3,3], [2,1], [4,0], [1,1]];
    this.aiHandCount = 6;
    this.turn = 'player';
    this.gameEnded = false;
    document.getElementById('domino-board-canvas').innerHTML = '<div class="domino-chain-row" id="domino-chain"></div>';
    this.updateUI();
  }

  updateUI() {
    const chainEl = document.getElementById('domino-chain');
    if (chainEl) {
      if (this.boardTiles.length === 0) {
        chainEl.innerHTML = '<span style="color:var(--text-muted); font-size:12px;">Table is open. Tap any tile from your hand.</span>';
      } else {
        chainEl.innerHTML = this.boardTiles.map(t => `<div class="domino-tile-chip">🁣 ${t[0]}|${t[1]}</div>`).join('');
      }
    }

    const handEl = document.getElementById('player-hand-row');
    if (handEl) {
      handEl.innerHTML = this.playerHand.map((t, idx) => `
        <button class="domino-hand-tile ${this.turn === 'player' ? 'active-hand' : ''}" data-tile-idx="${idx}">
          🁣 <b>${t[0]}</b> | <b>${t[1]}</b>
        </button>
      `).join('');

      handEl.querySelectorAll('[data-tile-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (this.turn !== 'player' || this.isBusy) return;
          const idx = Number(btn.dataset.tileIdx);
          const tile = this.playerHand.splice(idx, 1)[0];
          this.boardTiles.push(tile);
          audio.play('wood_move');
          this.updateUI();

          if (this.playerHand.length === 0) {
            this.finishGame(true);
            return;
          }

          this.turn = 'ai';
          setTimeout(() => this.runAITurn(), 650);
        });
      });
    }

    document.getElementById('ai-tile-count').textContent = this.aiHandCount;
  }

  runAITurn() {
    if (this.gameEnded) return;
    this.aiHandCount = Math.max(0, this.aiHandCount - 1);
    audio.play('wood_move');
    this.updateUI();

    if (this.aiHandCount === 0) {
      this.finishGame(false);
      return;
    }

    this.turn = 'player';
    this.updateUI();
  }

  finishGame(playerWon) {
    this.gameEnded = true;
    if (playerWon) {
      recordGameOutcome('domino', true, 'Ivory Domino Table');
      this.context.setQuote?.(getAIQuote('win'));
    } else {
      recordGameOutcome('domino', false, 'Ivory Domino Table');
      this.context.setQuote?.(getAIQuote('lose'));
    }
  }

  destroy() {}
}

// --- 2. LUXURY CHECKERS ENGINE ---
export class LuxuryCheckersGame {
  constructor(mountEl, context = {}) {
    this.mountEl = mountEl;
    this.context = context;
    // 8x8 Board: w = white man, W = white king, b = black man, B = black king, null = empty
    this.board = [
      [null, 'b', null, 'b', null, 'b', null, 'b'],
      ['b', null, 'b', null, 'b', null, 'b', null],
      [null, 'b', null, 'b', null, 'b', null, 'b'],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ['w', null, 'w', null, 'w', null, 'w', null],
      [null, 'w', null, 'w', null, 'w', null, 'w'],
      ['w', null, 'w', null, 'w', null, 'w', null]
    ];
    this.selected = null;
    this.turn = 'w';
    this.gameEnded = false;

    this.renderLayout();
    this.updateUI();
  }

  renderLayout() {
    this.mountEl.innerHTML = `
      <div class="checkers-stage-wrap">
        <div class="chess-hud-row">
          <div class="chess-player-badge">
            <span class="chess-side-dot black-dot"></span>
            <strong>${this.context.ai?.name || 'The Gentleman'} (Black)</strong>
          </div>
        </div>

        <div class="checkers-board-grid" id="checkers-grid"></div>

        <div class="chess-hud-row">
          <div class="chess-player-badge">
            <span class="chess-side-dot white-dot"></span>
            <strong>You (White Ivory)</strong>
          </div>
          <button class="btn-gold" id="checkers-new-btn">New Table</button>
        </div>
      </div>
    `;

    document.getElementById('checkers-new-btn')?.addEventListener('click', () => {
      audio.play('wood_move');
      this.turn = 'w';
      this.gameEnded = false;
      this.renderLayout();
      this.updateUI();
    });
  }

  updateUI() {
    const gridEl = document.getElementById('checkers-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 1;
        const sqEl = document.createElement('div');
        sqEl.className = `checkers-sq ${isDark ? 'sq-dark' : 'sq-light'}`;
        sqEl.dataset.r = r;
        sqEl.dataset.c = c;

        const piece = this.board[r][c];
        if (piece) {
          const pEl = document.createElement('span');
          pEl.className = `checkers-piece ${piece.toLowerCase() === 'w' ? 'chk-ivory' : 'chk-obsidian'}`;
          pEl.textContent = piece === 'W' || piece === 'B' ? '👑' : '⚫';
          sqEl.appendChild(pEl);
        }

        if (this.selected && this.selected.r === r && this.selected.c === c) {
          sqEl.classList.add('sq-selected');
        }

        sqEl.addEventListener('click', () => this.onSquareTap(r, c));
        gridEl.appendChild(sqEl);
      }
    }
  }

  onSquareTap(r, c) {
    if (this.turn !== 'w' || this.gameEnded) return;
    const piece = this.board[r][c];

    if (piece && piece.toLowerCase() === 'w') {
      audio.play('button');
      this.selected = { r, c };
      this.updateUI();
    } else if (this.selected && !piece && (r + c) % 2 === 1) {
      // Simple Move
      if (Math.abs(this.selected.r - r) === 1 && Math.abs(this.selected.c - c) === 1) {
        this.board[r][c] = this.board[this.selected.r][this.selected.c];
        this.board[this.selected.r][this.selected.c] = null;

        // King promotion at top row
        if (r === 0) this.board[r][c] = 'W';

        this.selected = null;
        audio.play('wood_move');
        this.updateUI();

        this.turn = 'b';
        setTimeout(() => this.runAITurn(), 600);
      }
    }
  }

  runAITurn() {
    if (this.gameEnded) return;
    // Simple AI automated diagonal slide
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === 'b' && r < 7 && c < 7 && !this.board[r+1][c+1]) {
          this.board[r+1][c+1] = 'b';
          this.board[r][c] = null;
          if (r+1 === 7) this.board[r+1][c+1] = 'B';
          break outer;
        }
      }
    }

    audio.play('wood_move');
    this.turn = 'w';
    this.updateUI();
  }

  destroy() {}
}

// Register Priority 2 Engines
window.GrandBoardEngines = window.GrandBoardEngines || {};
window.GrandBoardEngines.domino = LuxuryDominoGame;
window.GrandBoardEngines.checkers = LuxuryCheckersGame;

// --- 3. ATELIER SKINS CUSTOMIZATION IN SETTINGS ---
export function renderSkinsCustomization(containerEl) {
  containerEl.innerHTML = `
    <div class="luxury-card" style="margin-top:10px;">
      <span class="section-title" style="display:block; margin-bottom:8px;">🎨 ATELIER SKINS & THEMES</span>
      <p style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">Customize your private club materials.</p>
      
      <div class="setting-row">
        <span>Board Material</span>
        <button class="btn-outline" id="skin-board-btn">${state.customization.boardSkin}</button>
      </div>
      <div class="setting-row">
        <span>Piece Set</span>
        <button class="btn-outline" id="skin-piece-btn">${state.customization.pieceSkin}</button>
      </div>
      <div class="setting-row">
        <span>3D Dice Finish</span>
        <button class="btn-outline" id="skin-dice-btn">${state.customization.diceSkin}</button>
      </div>
    </div>
  `;

  document.getElementById('skin-board-btn')?.addEventListener('click', () => {
    const skins = ['Black Marble & Gold', 'Dark Walnut & Ivory', 'Emerald Velvet & Brass'];
    const curIdx = skins.indexOf(state.customization.boardSkin);
    state.customization.boardSkin = skins[(curIdx + 1) % skins.length];
    saveState();
    audio.play('button');
    renderSkinsCustomization(containerEl);
  });

  document.getElementById('skin-dice-btn')?.addEventListener('click', () => {
    const diceSkins = ['Brushed Gold Pips', 'Obsidian & Gold Pips', 'Ivory & Crimson Ace'];
    const curIdx = diceSkins.indexOf(state.customization.diceSkin);
    state.customization.diceSkin = diceSkins[(curIdx + 1) % diceSkins.length];
    saveState();
    audio.play('button');
    renderSkinsCustomization(containerEl);
  });
}