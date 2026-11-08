// ==========================================
// GRAND BOARD — Stage 1: Core Architecture
// ==========================================

const tg = window.Telegram?.WebApp;

// 1. REALISTIC WEB AUDIO SYNTHESIZER (No external MP3 dependencies needed)
class LuxuryAudioEngine {
  constructor() {
    this.ctx = null;
    this.settings = {
      master: 0.85,
      sfx: 0.9,
      ambient: 0.4,
      muted: false,
      haptics: true,
      reducedMotion: false
    };
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  triggerHaptic(style = 'light') {
    if (!this.settings.haptics) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    } else if (navigator.vibrate) {
      navigator.vibrate(style === 'heavy' ? 35 : 12);
    }
  }

  play(type) {
    if (this.settings.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const vol = this.settings.master * this.settings.sfx;
    if (vol <= 0.01) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    switch (type) {
      case 'button':
        this.triggerHaptic('light');
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.045);
        gain.gain.setValueAtTime(vol * 0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;

      case 'wood_move':
      case 'chess_land':
        this.triggerHaptic('medium');
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(165, now);
        osc.frequency.exponentialRampToValueAtTime(58, now + 0.09);
        gain.gain.setValueAtTime(vol * 0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        osc.start(now);
        osc.stop(now + 0.095);
        break;

      case 'dice_roll':
        this.triggerHaptic('light');
        [0, 0.06, 0.13, 0.22].forEach((offset, idx) => {
          const dOsc = this.ctx.createOscillator();
          const dGain = this.ctx.createGain();
          dOsc.connect(dGain);
          dGain.connect(this.ctx.destination);
          dOsc.type = 'triangle';
          dOsc.frequency.setValueAtTime(320 + idx * 70, now + offset);
          dOsc.frequency.exponentialRampToValueAtTime(120, now + offset + 0.04);
          dGain.gain.setValueAtTime(vol * 0.28, now + offset);
          dGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.045);
          dOsc.start(now + offset);
          dOsc.stop(now + offset + 0.05);
        });
        break;

      case 'victory':
        this.triggerHaptic('heavy');
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const vOsc = this.ctx.createOscillator();
          const vGain = this.ctx.createGain();
          vOsc.connect(vGain);
          vGain.connect(this.ctx.destination);
          vOsc.type = 'sine';
          vOsc.frequency.setValueAtTime(freq, now + i * 0.09);
          vGain.gain.setValueAtTime(vol * 0.25, now + i * 0.09);
          vGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);
          vOsc.start(now + i * 0.09);
          vOsc.stop(now + i * 0.09 + 0.36);
        });
        break;
    }
  }
}

export const audio = new LuxuryAudioEngine();

// 2. PERSISTENT STATE & CATALOG DATA
const STORAGE_KEY = 'GRAND_BOARD_STATE_V1';

const DEFAULT_STATE = {
  activeTab: 'home',
  selectedAI: 'gentleman',
  selectedDifficulty: 'Casual',
  lastPlayedGame: 'chess',
  customization: {
    boardSkin: 'Black Marble & Gold',
    pieceSkin: 'Royal Obsidian & Ivory',
    diceSkin: 'Brushed Gold Pips'
  },
  stats: {
    level: 4,
    xp: 340,
    totalGames: 14,
    wins: 9,
    losses: 5,
    streak: 3,
    perGame: {
      chess: { played: 6, wins: 4, losses: 2 },
      backgammon: { played: 5, wins: 3, losses: 2 },
      ludo: { played: 3, wins: 2, losses: 1 },
      domino: { played: 0, wins: 0, losses: 0 },
      checkers: { played: 0, wins: 0, losses: 0 }
    }
  },
  recentMatches: [
    { game: 'Chess', opponent: 'The Gentleman', result: 'Victory', mode: 'Standard • 42 moves', time: '2h ago' },
    { game: 'Backgammon', opponent: 'The Strategist', result: 'Victory', mode: 'Doubling Cube x2', time: 'Yesterday' },
    { game: 'Ludo', opponent: 'The Friend', result: 'Defeat', mode: '4-Player Royal Table', time: '2d ago' }
  ],
  dailyChallenges: [
    { id: 'dc1', title: 'Grandmaster Opening', desc: 'Win 1 Chess match without losing your Queen', progress: 1, target: 1, reward: '+150 XP', completed: true },
    { id: 'dc2', title: 'Golden Double', desc: 'Roll a Double 6 in Backgammon or Ludo', progress: 0, target: 1, reward: '+100 XP', completed: false },
    { id: 'dc3', title: 'Master of the Lounge', desc: 'Play 3 matches against any AI opponent', progress: 2, target: 3, reward: '+200 XP', completed: false }
  ],
  achievements: [
    { title: 'First Checkmate', desc: 'Deliver checkmate against an AI Master', unlocked: true, medal: '🥇' },
    { title: 'Backgammon Tactician', desc: 'Bear off all 15 checkers cleanly', unlocked: true, medal: '🏅' },
    { title: 'Unbroken Streak', desc: 'Win 5 matches in a row across the club', unlocked: false, medal: '👑' },
    { title: 'The King Slayer', desc: 'Defeat "The King" on Master difficulty', unlocked: false, medal: '💎' }
  ]
};

export const GAMES_CATALOG = [
  {
    id: 'chess',
    name: 'Chess',
    priority: 1,
    icon: '♟️',
    tagline: 'Official FIDE Rules & Stockfish AI',
    badge: 'Flagship • Ready',
    features: ['Castling & En Passant', 'Checkmate Camera', 'Clock & Analysis']
  },
  {
    id: 'backgammon',
    name: 'Backgammon',
    priority: 1,
    icon: '🎲',
    tagline: '3D Dice Cup, Bar & Doubling Cube',
    badge: 'Flagship • Ready',
    features: ['Shared 3D Physics Dice', 'Hit & Bar Re-entry', 'Bearing Off']
  },
  {
    id: 'ludo',
    name: 'Ludo',
    priority: 1,
    icon: '👑',
    tagline: 'Four-Color Royal Club Table',
    badge: 'Priority 1 • Ready',
    features: ['Shared 3D Dice System', 'Safe Star Zones', 'Strategic 4-Player AI']
  },
  {
    id: 'domino',
    name: 'Domino',
    priority: 2,
    icon: '🁣',
    tagline: 'Ivory & Gold Brass Spinners',
    badge: 'Priority 2 • Club Table',
    features: ['Draw & Block Variants', 'Collision Physics', 'Score Tracking']
  },
  {
    id: 'checkers',
    name: 'Checkers',
    priority: 2,
    icon: '⚫',
    tagline: 'Mandatory Jumps & King Crowning',
    badge: 'Priority 2 • Club Table',
    features: ['Multi-Jump Chains', 'King Promotion', 'Tactical AI']
  }
];

export const FUTURE_GAMES = [
  'Snakes & Ladders', 'Tic Tac Toe', 'Connect Four', 'Reversi', 'Mancala', 'Battleship', 'Mahjong'
];

export const AI_OPPONENTS = [
  { id: 'friend', name: 'The Friend', difficulty: 'Beginner', icon: '🤝', personality: 'Friendly and educational. Forgiving lines and helpful pace.' },
  { id: 'gentleman', name: 'The Gentleman', difficulty: 'Casual', icon: '🎩', personality: 'Calm and strategic. Classic positional play with noble etiquette.' },
  { id: 'strategist', name: 'The Strategist', difficulty: 'Expert', icon: '🦅', personality: 'Analytical and competitive. Calculates multi-move traps.' },
  { id: 'king', name: 'The King', difficulty: 'Master', icon: '👑', personality: 'Highly challenging. Ruthless precision across every board.' }
];

// Load & Save State
export let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('State save error:', e);
  }
}

// 3. TELEGRAM MINI APP INTEGRATION
function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) tg.setHeaderColor('#090B10');
  if (tg.setBackgroundColor) tg.setBackgroundColor('#090B10');

  const user = tg.initDataUnsafe?.user;
  if (user) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
    document.getElementById('user-name').textContent = fullName || user.username || 'VIP Member';
    if (user.photo_url) {
      document.getElementById('user-avatar').src = user.photo_url;
    }
  }

  tg.BackButton.onClick(() => {
    const stageEl = document.getElementById('game-stage-container');
    if (!stageEl.classList.contains('hidden')) {
      closeGameStage();
    } else if (state.activeTab !== 'home') {
      switchTab('home');
    }
  });
}

// 4. VIEW RENDERING ENGINE
const mainView = document.getElementById('main-view');

export function switchTab(tabId) {
  audio.play('button');
  state.activeTab = tabId;
  saveState();

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  if (tg?.BackButton) {
    if (tabId === 'home') tg.BackButton.hide();
    else tg.BackButton.show();
  }

  renderCurrentTab();
}

export function renderCurrentTab() {
  document.getElementById('user-level-badge').textContent = state.stats.level;

  switch (state.activeTab) {
    case 'home':
      renderHomeLounge();
      break;
    case 'collection':
      renderGameCollection();
      break;
    case 'ai':
      renderAIMasters();
      break;
    case 'challenges':
      renderChallengesAndAchievements();
      break;
    case 'stats':
      renderProfileAndStats();
      break;
    case 'settings':
      renderSettings();
      break;
  }
}

// --- TAB 1: HOME LOUNGE ---
function renderHomeLounge() {
  const lastGame = GAMES_CATALOG.find(g => g.id === state.lastPlayedGame) || GAMES_CATALOG[0];
  const currentAI = AI_OPPONENTS.find(a => a.id === state.selectedAI) || AI_OPPONENTS[1];

  mainView.innerHTML = `
    <!-- Continue Playing Card -->
    <section class="luxury-card velvet-banner continue-card">
      <div class="continue-info">
        <span class="badge-pill">PRIVATE TABLE READY</span>
        <h3>${lastGame.icon} ${lastGame.name}</h3>
        <p>Opponent: <strong>${currentAI.name}</strong> (${currentAI.difficulty})</p>
      </div>
      <button class="btn-gold" data-launch="${lastGame.id}">Enter Table</button>
    </section>

    <!-- Priority 1 Game Collection Carousel -->
    <section>
      <div class="section-header">
        <span class="section-title">THE ROYAL COLLECTION</span>
        <span class="section-link" data-nav="collection">View All (${GAMES_CATALOG.length}) →</span>
      </div>
      <div class="carousel-row">
        ${GAMES_CATALOG.map(game => `
          <div class="game-tile priority-${game.priority}" data-launch="${game.id}">
            <div>
              <div class="game-icon-box">${game.icon}</div>
              <span class="priority-tag" style="display:block; margin-top:8px;">${game.badge}</span>
              <h4>${game.name}</h4>
              <p>${game.tagline}</p>
            </div>
            <button class="btn-outline" style="width:100%; margin-top:6px;">Play Now</button>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Daily Challenge Spotlight -->
    <section class="luxury-card walnut-card">
      <div class="section-header" style="margin-bottom:6px;">
        <span class="section-title">🏆 DAILY CLUB CHALLENGE</span>
        <span class="section-link" data-nav="challenges">All Quests →</span>
      </div>
      <p style="font-size:13px; color:var(--text-ivory); font-weight:600;">${state.dailyChallenges[1].title}</p>
      <p style="font-size:12px; color:var(--text-muted); margin-top:3px;">${state.dailyChallenges[1].desc}</p>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span style="font-size:11px; color:var(--gold-primary); font-weight:700;">Reward: ${state.dailyChallenges[1].reward}</span>
        <button class="btn-outline" data-launch="backgammon">Roll Dice</button>
      </div>
    </section>

    <!-- Recent Matches & Achievements Preview -->
    <section>
      <div class="section-header">
        <span class="section-title">RECENT LOUNGE MATCHES</span>
        <span class="section-link" data-nav="stats">Full History →</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${state.recentMatches.slice(0, 3).map(m => `
          <div class="luxury-card" style="padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="font-size:13px; color:var(--text-ivory);">${m.game} vs. ${m.opponent}</strong>
              <p style="font-size:11px; color:var(--text-muted);">${m.mode} • ${m.time}</p>
            </div>
            <span style="font-size:12px; font-weight:700; color:${m.result === 'Victory' ? 'var(--emerald-success)' : 'var(--crimson-danger)'};">
              ${m.result}
            </span>
          </div>
        `).join('')}
      </div>
    </section>
  `;

  bindInteractiveEvents();
}

// --- TAB 2: GAME COLLECTION ---
function renderGameCollection() {
  mainView.innerHTML = `
    <div class="section-header">
      <span class="section-title">MASTERPIECE COLLECTION</span>
      <span style="font-size:11px; color:var(--text-muted);">Shared 3D Physics Engine</span>
    </div>

    <div style="display:flex; flex-direction:column; gap:12px;">
      ${GAMES_CATALOG.map(game => `
        <div class="luxury-card" style="display:flex; justify-content:space-between; align-items:center; gap:14px;">
          <div style="display:flex; gap:12px; align-items:center;">
            <div class="game-icon-box" style="width:52px; height:52px; font-size:28px;">${game.icon}</div>
            <div>
              <span class="priority-tag">${game.badge}</span>
              <h3 style="font-family:var(--font-display); font-size:16px; margin:2px 0;">${game.name}</h3>
              <p style="font-size:11px; color:var(--text-muted);">${game.features.join(' • ')}</p>
            </div>
          </div>
          <button class="btn-gold" data-launch="${game.id}">Play</button>
        </div>
      `).join('')}
    </div>

    <div class="luxury-card" style="margin-top:8px;">
      <span class="section-title" style="display:block; margin-bottom:8px;">UPCOMING CLUB TABLES (ARCHITECTED)</span>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${FUTURE_GAMES.map(name => `
          <span style="font-size:11px; padding:6px 10px; border-radius:8px; background:var(--surface-secondary); border:var(--gold-border); color:var(--text-muted);">
            🔒 ${name}
          </span>
        `).join('')}
      </div>
    </div>
  `;
  bindInteractiveEvents();
}

// --- TAB 3: AI MASTERS ---
function renderAIMasters() {
  mainView.innerHTML = `
    <div class="section-header">
      <span class="section-title">CHOOSE YOUR OPPONENT</span>
      <span style="font-size:11px; color:var(--gold-primary);">Active: ${state.selectedDifficulty}</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:12px;">
      ${AI_OPPONENTS.map(ai => {
        const isSelected = state.selectedAI === ai.id;
        return `
          <div class="luxury-card ai-card" style="border-color:${isSelected ? 'var(--gold-primary)' : 'rgba(198,166,106,0.22)'};">
            <div style="display:flex; gap:12px; align-items:center;">
              <div class="ai-avatar">${ai.icon}</div>
              <div>
                <span class="priority-tag">${ai.difficulty} Level</span>
                <h3 style="font-family:var(--font-display); font-size:15px; color:var(--text-ivory);">${ai.name}</h3>
                <p style="font-size:11px; color:var(--text-muted); margin-top:2px;">${ai.personality}</p>
              </div>
            </div>
            <button class="${isSelected ? 'btn-gold' : 'btn-outline'}" data-select-ai="${ai.id}">
              ${isSelected ? 'Selected' : 'Select'}
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;
  bindInteractiveEvents();
}

// --- TAB 4: DAILY CHALLENGES & ACHIEVEMENTS ---
function renderChallengesAndAchievements() {
  mainView.innerHTML = `
    <div class="section-header">
      <span class="section-title">DAILY CHALLENGES</span>
      <span style="font-size:11px; color:var(--gold-primary);">Win Streak: 🔥 ${state.stats.streak}</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${state.dailyChallenges.map(ch => `
        <div class="luxury-card" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="font-size:14px; color:var(--text-ivory);">${ch.title}</h4>
            <p style="font-size:11px; color:var(--text-muted); margin-top:2px;">${ch.desc}</p>
            <span style="font-size:10px; color:var(--gold-primary); font-weight:700;">${ch.reward} • Progress: ${ch.progress}/${ch.target}</span>
          </div>
          <span style="font-size:18px;">${ch.completed ? '✅' : '⏳'}</span>
        </div>
      `).join('')}
    </div>

    <div class="section-header" style="margin-top:8px;">
      <span class="section-title">COLLECTIBLE MEDALS</span>
    </div>
    <div class="grid-2">
      ${state.achievements.map(ach => `
        <div class="luxury-card" style="opacity:${ach.unlocked ? '1' : '0.55'};">
          <div style="font-size:24px; margin-bottom:6px;">${ach.medal}</div>
          <h4 style="font-size:13px; color:var(--gold-secondary);">${ach.title}</h4>
          <p style="font-size:11px; color:var(--text-muted); margin-top:3px;">${ach.desc}</p>
        </div>
      `).join('')}
    </div>
  `;
}

// --- TAB 5: STATISTICS & CUSTOMIZATION ---
function renderProfileAndStats() {
  const winRate = state.stats.totalGames > 0
    ? Math.round((state.stats.wins / state.stats.totalGames) * 100)
    : 0;

  mainView.innerHTML = `
    <div class="section-header">
      <span class="section-title">CLUB RECORD & TELEMETRY</span>
      <span style="font-size:11px; color:var(--gold-primary);">Level ${state.stats.level} (${state.stats.xp} XP)</span>
    </div>
    <div class="grid-2">
      <div class="stat-box">
        <div class="stat-value">${state.stats.totalGames}</div>
        <div class="stat-label">Total Matches</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--emerald-success);">${winRate}%</div>
        <div class="stat-label">Win Ratio</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${state.stats.wins}</div>
        <div class="stat-label">Victories</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--crimson-danger);">${state.stats.losses}</div>
        <div class="stat-label">Defeats</div>
      </div>
    </div>

    <div class="luxury-card">
      <span class="section-title" style="display:block; margin-bottom:10px;">ATELIER CUSTOMIZATION</span>
      <div class="setting-row">
        <span style="font-size:12px; color:var(--text-muted);">Board Material</span>
        <strong style="font-size:12px; color:var(--gold-secondary);">${state.customization.boardSkin}</strong>
      </div>
      <div class="setting-row">
        <span style="font-size:12px; color:var(--text-muted);">Piece Set</span>
        <strong style="font-size:12px; color:var(--gold-secondary);">${state.customization.pieceSkin}</strong>
      </div>
      <div class="setting-row">
        <span style="font-size:12px; color:var(--text-muted);">3D Dice Finish</span>
        <strong style="font-size:12px; color:var(--gold-secondary);">${state.customization.diceSkin}</strong>
      </div>
    </div>
  `;
}

// --- TAB 6: AUDIO & PERFORMANCE SETTINGS ---
function renderSettings() {
  mainView.innerHTML = `
    <div class="luxury-card">
      <span class="section-title" style="display:block; margin-bottom:10px;">ACOUSTICS & HAPTICS</span>
      <div class="setting-row">
        <span style="font-size:13px;">Master Volume</span>
        <input type="range" min="0" max="1" step="0.05" value="${audio.settings.master}" class="range-slider" id="vol-master" />
      </div>
      <div class="setting-row">
        <span style="font-size:13px;">Sound Effects (Dice & Wood)</span>
        <input type="range" min="0" max="1" step="0.05" value="${audio.settings.sfx}" class="range-slider" id="vol-sfx" />
      </div>
      <div class="setting-row">
        <span style="font-size:13px;">Subtle Haptic Feedback</span>
        <button class="btn-outline" id="toggle-haptics">${audio.settings.haptics ? 'Enabled' : 'Off'}</button>
      </div>
      <div class="setting-row">
        <span style="font-size:13px;">Reduced Motion (60 FPS Lock)</span>
        <button class="btn-outline" id="toggle-motion">${audio.settings.reducedMotion ? 'On' : 'Standard 3D'}</button>
      </div>
    </div>
  `;

  document.getElementById('vol-master')?.addEventListener('input', e => {
    audio.settings.master = parseFloat(e.target.value);
    audio.play('button');
  });
  document.getElementById('vol-sfx')?.addEventListener('input', e => {
    audio.settings.sfx = parseFloat(e.target.value);
    audio.play('wood_move');
  });
  document.getElementById('toggle-haptics')?.addEventListener('click', () => {
    audio.settings.haptics = !audio.settings.haptics;
    audio.play('button');
    renderSettings();
  });
  document.getElementById('toggle-motion')?.addEventListener('click', () => {
    audio.settings.reducedMotion = !audio.settings.reducedMotion;
    audio.play('button');
    renderSettings();
  });
}

// 5. EVENT BINDING & STAGE LAUNCHER HOOK
function bindInteractiveEvents() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.nav));
  });

  document.querySelectorAll('[data-select-ai]').forEach(btn => {
    btn.addEventListener('click', () => {
      const aiObj = AI_OPPONENTS.find(a => a.id === btn.dataset.selectAi);
      if (aiObj) {
        state.selectedAI = aiObj.id;
        state.selectedDifficulty = aiObj.difficulty;
        audio.play('wood_move');
        saveState();
        renderAIMasters();
      }
    });
  });

  document.querySelectorAll('[data-launch]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      launchGameTable(btn.dataset.launch);
    });
  });
}

export function launchGameTable(gameId) {
  audio.play('wood_move');
  state.lastPlayedGame = gameId;
  saveState();

  const stageEl = document.getElementById('game-stage-container');
  stageEl.classList.remove('hidden');
  if (tg?.BackButton) tg.BackButton.show();

  // Hook for Stages 2-6 Game Modules
  if (window.GrandBoardStageManager?.openGame) {
    window.GrandBoardStageManager.openGame(gameId, stageEl);
  } else {
    const game = GAMES_CATALOG.find(g => g.id === gameId);
    stageEl.innerHTML = `
      <div style="padding:20px; display:flex; flex-direction:column; height:100%; justify-content:space-between;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button class="btn-outline" id="close-stage-btn">← Back to Lounge</button>
          <span class="brand-title">${game.name.toUpperCase()}</span>
          <span class="priority-tag">${state.selectedDifficulty} AI</span>
        </div>
        <div class="luxury-card velvet-banner" style="text-align:center; padding:32px 20px;">
          <div style="font-size:48px; margin-bottom:12px;">${game.icon}</div>
          <h2 style="font-family:var(--font-display); color:var(--gold-secondary);">${game.name} Royal Table</h2>
          <p style="font-size:13px; color:var(--text-muted); margin:10px 0 20px;">
            Stage 1 Core Shell is active. In Stages 2–6 we connect the 3D Shared Dice Engine and full rule engines here.
          </p>
          <button class="btn-gold" id="test-sound-btn">Test Luxury Dice Sound 🎲</button>
        </div>
        <div></div>
      </div>
    `;
    document.getElementById('close-stage-btn')?.addEventListener('click', closeGameStage);
    document.getElementById('test-sound-btn')?.addEventListener('click', () => audio.play('dice_roll'));
  }
}

export function closeGameStage() {
  audio.play('button');
  const stageEl = document.getElementById('game-stage-container');
  stageEl.classList.add('hidden');
  stageEl.innerHTML = '';
  if (tg?.BackButton && state.activeTab === 'home') tg.BackButton.hide();
  renderCurrentTab();
}

// 6. BOOTSTRAP
window.addEventListener('DOMContentLoaded', () => {
  initTelegram();

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('header-profile-btn')?.addEventListener('click', () => switchTab('stats'));

  document.getElementById('quick-mute-btn')?.addEventListener('click', () => {
    audio.settings.muted = !audio.settings.muted;
    document.getElementById('mute-icon').textContent = audio.settings.muted ? '🔇' : '🔊';
    if (!audio.settings.muted) audio.play('button');
  });

  renderCurrentTab();
});