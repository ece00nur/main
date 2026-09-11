// ==========================================
// FLYING BIRD - FULL ENGINE & CONTROLLER
// ==========================================

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 640;

// Game States
const STATE = {
    SELECT: 0,
    READY: 1,
    PLAYING: 2,
    GAMEOVER: 3
};

// Persistent storage keys (bump a key if the stored shape ever changes)
const STORAGE_KEYS = {
    highScore: 'flying_bird_highscore',
    unlocked: 'flying_bird_unlocked',
    selected: 'flying_bird_selected'
};

// Baseline physics every character modifies multiplicatively (see
// applyCharacterPhysics). Keeping one source of truth here means a
// character with neutral modifiers (1.0/1.0) is byte-for-byte identical to
// the old hardcoded values -- existing collision/scoring stays unaffected.
const BASE_PHYSICS = {
    gravity: 0.35,
    jump: -6.4,
    maxFallSpeed: 8.8
};

// Character registry: the single source of truth for the roster. Every
// entry follows the same schema so selection, persistence, physics and
// rendering can all loop over CHARACTERS generically instead of branching
// per-id.
//   id               stable identifier; persisted to localStorage
//   spriteUrl        sprite asset path (procedural-fallback birds could
//                    instead carry a `renderProcedural(ctx)` fn here)
//   hitboxRadius     collision circle radius in px (fair-play padding is
//                    still applied in checkPipeCollision, unchanged)
//   physicsModifiers multipliers applied to BASE_PHYSICS; 1.0 = unchanged
//   unlockCondition  { type: 'default' } or { type: 'score', value: N }
const CHARACTERS = [
    {
        id: 0,
        name: "KAZUHA BIRD",
        badge: "Sonbahar Esintisi 🍁",
        badgeClass: "badge-autumn",
        desc: "Zıpladıkça arkasında rüzgârla süzülen akçaağaç yaprakları bırakır.",
        spriteUrl: "assets/bird1.png",
        particleType: "leaf",
        themeColor: "#d35400",
        hitboxRadius: 19,
        physicsModifiers: { jumpMultiplier: 1.0, gravityMultiplier: 1.0 },
        unlockCondition: { type: "default" }
    },
    {
        id: 1,
        name: "WANDERER BIRD",
        badge: "Anemo Bıçağı 🍃",
        badgeClass: "badge-anemo",
        desc: "Zıpladıkça arkasında anemo rüzgâr halkaları ve parlak tüyler saçar.",
        spriteUrl: "assets/bird2.png",
        particleType: "feather",
        themeColor: "#16a085",
        hitboxRadius: 19,
        physicsModifiers: { jumpMultiplier: 1.0, gravityMultiplier: 1.0 },
        unlockCondition: { type: "score", value: 10 }
    },
    {
        id: 2,
        name: "YAE MIKO BIRD",
        badge: "Sakura Esintisi 🌸",
        badgeClass: "badge-sakura",
        desc: "Zıpladıkça havada süzülen büyüleyici pembe sakura yaprakları saçar.",
        spriteUrl: "assets/bird3.png",
        particleType: "sakura",
        themeColor: "#e84393",
        hitboxRadius: 19,
        physicsModifiers: { jumpMultiplier: 1.0, gravityMultiplier: 1.0 },
        unlockCondition: { type: "score", value: 20 }
    },
    {
        id: 3,
        name: "RAIDEN SHOGUN BIRD",
        badge: "Ebediyet Şimşeği ⚡",
        badgeClass: "badge-electro",
        desc: "Zıpladıkça etrafına parıldayan mor şimşek kıvılcımları saçar.",
        spriteUrl: "assets/bird4.png",
        particleType: "electro",
        themeColor: "#6c5ce7",
        hitboxRadius: 19,
        physicsModifiers: { jumpMultiplier: 1.0, gravityMultiplier: 1.0 },
        unlockCondition: { type: "score", value: 30 }
    },
    {
        id: 4,
        name: "ZHONGLI BIRD",
        badge: "Taşların Hakimi 🔶",
        badgeClass: "badge-geo",
        desc: "Zıpladıkça arkasında süzülen altın rengi ginkgo yaprakları bırakır.",
        spriteUrl: "assets/bird5.png",
        particleType: "ginkgo",
        themeColor: "#d35400",
        hitboxRadius: 19,
        physicsModifiers: { jumpMultiplier: 1.0, gravityMultiplier: 1.0 },
        unlockCondition: { type: "score", value: 40 }
    },
    {
        id: 5,
        name: "XIAO BIRD",
        badge: "Gardiyan Yaksha 🗡️",
        badgeClass: "badge-yaksha",
        desc: "Zıpladıkça arkasında keskin yeşim anemo rüzgâr bıçakları bırakır.",
        spriteUrl: "assets/bird6.png",
        particleType: "anemo_blade",
        themeColor: "#00b894",
        hitboxRadius: 19,
        physicsModifiers: { jumpMultiplier: 1.0, gravityMultiplier: 1.0 },
        unlockCondition: { type: "score", value: 50 }
    },
    {
        id: 6,
        name: "EFSANEVİ KUŞ",
        badge: "Altın Efsane 👑",
        badgeClass: "badge-legendary",
        desc: "Gökyüzünün en usta uçucusu. Sadece en azimli kaşifler ulaşabilir.",
        spriteUrl: "assets/bird7.png",
        particleType: "leaf",
        themeColor: "#f1c40f",
        hitboxRadius: 19,
        physicsModifiers: { jumpMultiplier: 1.05, gravityMultiplier: 0.92 },
        unlockCondition: { type: "score", value: 75 }
    }
];

// ==========================================
// 1. RETRO WEB AUDIO SYNTHESIZER
// ==========================================
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playJump() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = 'square';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
    }

    playScore() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Two-tone chime
        [880, 1320].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const time = now + (idx * 0.07);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.18);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + 0.18);
        });
    }

    playHit() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Noise buffer for punch impact
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.linearRampToValueAtTime(80, now + 0.15);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
        noise.stop(now + 0.15);
    }

    playSelect() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.06);
    }

    playDenied() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = 'square';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.15);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    playUnlock() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        [660, 880, 1100, 1320].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const time = now + (idx * 0.09);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.14, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.22);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + 0.22);
        });
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }
}

// ==========================================
// 2. PARTICLE SYSTEM
// ==========================================
class ParticleEngine {
    constructor() {
        this.particles = [];
        this.leafImg = new Image();
        this.leafImg.src = 'assets/leaf.png';
        this.featherImg = new Image();
        this.featherImg.src = 'assets/feather.png';
        this.sakuraImg = new Image();
        this.sakuraImg.src = 'assets/sakura.png';
        this.electroImg = new Image();
        this.electroImg.src = 'assets/electro.png';
        this.ginkgoImg = new Image();
        this.ginkgoImg.src = 'assets/ginkgo.png';
        this.bladeImg = new Image();
        this.bladeImg.src = 'assets/anemo_blade.png';
    }

    emit(x, y, type, count = 2) {
        for (let i = 0; i < count; i++) {
            const angle = Math.PI + (Math.random() * 0.8 - 0.4);
            const speed = Math.random() * 2 + 1.5;
            this.particles.push({
                x: x - 10 + (Math.random() * 10 - 5),
                y: y + (Math.random() * 10 - 5),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + 0.5,
                rot: Math.random() * Math.PI * 2,
                vrot: (Math.random() - 0.5) * 0.15,
                size: Math.random() * 12 + 16,
                alpha: 1.0,
                life: 1.0,
                decay: Math.random() * 0.02 + 0.02,
                type: type
            });
        }
    }

    emitHitBurst(x, y, count = 12) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rot: Math.random() * Math.PI * 2,
                vrot: (Math.random() - 0.5) * 0.25,
                size: Math.random() * 10 + 14,
                alpha: 1.0,
                life: 1.0,
                decay: Math.random() * 0.03 + 0.025,
                type: 'hit'
            });
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vrot;
            p.life -= p.decay;
            p.alpha = Math.max(0, p.life);

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        for (const p of this.particles) {
            ctx.globalAlpha = p.alpha;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);

            if (p.type === 'leaf' && this.leafImg.complete) {
                ctx.drawImage(this.leafImg, -p.size/2, -p.size/2, p.size, p.size);
            } else if (p.type === 'feather' && this.featherImg.complete) {
                ctx.drawImage(this.featherImg, -p.size/2, -p.size/2, p.size, p.size);
            } else if (p.type === 'sakura' && this.sakuraImg.complete) {
                ctx.drawImage(this.sakuraImg, -p.size/2, -p.size/2, p.size, p.size);
            } else if (p.type === 'electro' && this.electroImg.complete) {
                ctx.drawImage(this.electroImg, -p.size/2, -p.size/2, p.size, p.size);
            } else if (p.type === 'ginkgo' && this.ginkgoImg.complete) {
                ctx.drawImage(this.ginkgoImg, -p.size/2, -p.size/2, p.size, p.size);
            } else if (p.type === 'anemo_blade' && this.bladeImg.complete) {
                ctx.drawImage(this.bladeImg, -p.size/2, -p.size/2, p.size, p.size);
            } else {
                // Generic sparkle / hit
                ctx.fillStyle = '#fce138';
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore();
    }

    reset() {
        this.particles = [];
    }
}

// ==========================================
// 3. MAIN GAME CONTROLLER
// ==========================================
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupRetinaCanvas();

        // Audio and Particles
        this.audio = new SoundEngine();
        this.particles = new ParticleEngine();

        // Assets
        this.images = {
            bg: new Image(),
            ground: new Image(),
            pipeTop: new Image(),
            pipeBottom: new Image(),
            birds: CHARACTERS.map(() => new Image())
        };
        this.images.bg.src = 'assets/bg_panorama.png';
        this.images.ground.src = 'assets/ground.png';
        this.images.pipeTop.src = 'assets/pipe_top.png';
        this.images.pipeBottom.src = 'assets/pipe_bottom.png';
        CHARACTERS.forEach((char, idx) => {
            this.images.birds[idx].src = char.spriteUrl;
        });

        // State & Scores
        this.state = STATE.SELECT;
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem(STORAGE_KEYS.highScore) || '0', 10);

        // Bird unlock progression (persisted)
        this.unlockedIds = this.loadUnlocked();
        this.selectedCharIndex = this.loadSelectedIndex();

        // FPS calculation
        this.fps = 60;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fpsTimer = 0;

        // Visual Parallax & Shakes
        this.bgX = 0;
        this.groundX = 0;
        this.screenShake = 0;
        this.flashAlpha = 0;

        // Day / Night cycle: eases toward 0 (day) or 1 (night) so the
        // transition at every 100-pipe boundary fades smoothly instead of
        // cutting instantly.
        this.dayNightT = 0;
        this.stars = Array.from({ length: 40 }, () => ({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * (CANVAS_HEIGHT - 220),
            size: Math.random() * 2 + 1,
            twinkle: Math.random() * 0.5 + 0.5
        }));

        // Bird Physics. radius/gravity/jump/maxFallSpeed are bound from the
        // selected character's schema right below (see applyCharacterPhysics)
        // instead of being hardcoded, so switching characters changes feel.
        this.bird = {
            x: 110,
            y: 280,
            radius: 19,
            drawWidth: 58,
            drawHeight: 58,
            velocity: 0,
            gravity: BASE_PHYSICS.gravity,
            jump: BASE_PHYSICS.jump,
            maxFallSpeed: BASE_PHYSICS.maxFallSpeed,
            rotation: 0,
            targetRotation: 0,
            hoverTimer: 0
        };
        this.applyCharacterPhysics(CHARACTERS[this.selectedCharIndex]);

        // Pipe Engine
        this.pipes = [];
        this.pipeWidth = 72; // in-game scaled pipe width
        this.pipeCapWidth = 84;
        this.pipeGap = 175; // Much wider, comfortable gap
        this.pipeSpeed = 2.0; // More relaxed speed
        this.pipeSpawnTimer = -35; // Extra preparation time for the first pipe
        this.pipeSpawnInterval = 130; // More horizontal breathing room between pipes
        this.groundHeight = 84;

        // UI DOM elements
        this.ui = {
            soundBtn: document.getElementById('sound-btn'),
            screenSelect: document.getElementById('screen-select'),
            screenReady: document.getElementById('screen-ready'),
            screenGameOver: document.getElementById('screen-gameover'),
            prevBtn: document.getElementById('prev-char-btn'),
            nextBtn: document.getElementById('next-char-btn'),
            startBtn: document.getElementById('start-btn'),
            startBtnLabel: document.querySelector('#start-btn span'),
            restartBtn: document.getElementById('restart-btn'),
            changeCharBtn: document.getElementById('change-char-btn'),
            characterCard: document.querySelector('.character-card'),
            charPreviewBox: document.getElementById('char-preview-box'),
            charPreviewImg: document.getElementById('char-preview-img'),
            charName: document.getElementById('char-name'),
            charBadge: document.getElementById('char-badge'),
            charDesc: document.getElementById('char-desc'),
            lockBadge: document.getElementById('lock-badge'),
            lockReq: document.getElementById('lock-req'),
            dotsContainer: document.getElementById('select-indicator'),
            menuHighScore: document.getElementById('menu-high-score'),
            finalScore: document.getElementById('final-score'),
            finalHighScore: document.getElementById('final-high-score'),
            medalDisplay: document.getElementById('medal-display'),
            newRecordBadge: document.getElementById('new-record-badge'),
            unlockToast: document.getElementById('unlock-toast'),
            unlockToastText: document.getElementById('unlock-toast-text'),
            openLeaderboardBtn: document.getElementById('open-leaderboard-btn'),
            viewLeaderboardBtn: document.getElementById('view-leaderboard-btn'),
            closeLeaderboardBtn: document.getElementById('close-leaderboard-btn'),
            refreshLeaderboardBtn: document.getElementById('refresh-leaderboard-btn'),
            screenLeaderboard: document.getElementById('screen-leaderboard'),
            nicknameInput: document.getElementById('nickname-input'),
            saveNicknameBtn: document.getElementById('save-nickname-btn'),
            nicknameFeedback: document.getElementById('nickname-feedback'),
            leaderboardStatus: document.getElementById('leaderboard-status'),
            leaderboardList: document.getElementById('leaderboard-list')
        };
        this.toastHideTimer = null;

        // Score awaiting a nickname before it can be pushed to the global
        // leaderboard (set when a new record happens with no nickname saved
        // yet; flushed the moment the player saves one).
        this.pendingLeaderboardEntry = null;

        this.initUI();
        this.bindEvents();

        // Retry any score that failed to sync last session (e.g. offline).
        if (window.leaderboardManager) {
            window.leaderboardManager.flushPending();
        }

        // Start Loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    setupRetinaCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = CANVAS_WIDTH * dpr;
        this.canvas.height = CANVAS_HEIGHT * dpr;
        this.ctx.scale(dpr, dpr);
    }

    // ==========================================
    // PERSISTENCE (unlocked birds, last selection)
    // ==========================================
    loadUnlocked() {
        let ids;
        try {
            ids = JSON.parse(localStorage.getItem(STORAGE_KEYS.unlocked) || '[0]');
            if (!Array.isArray(ids)) ids = [0];
        } catch (e) {
            ids = [0];
        }
        const set = new Set(ids);
        set.add(0); // default bird is always unlocked
        return set;
    }

    saveUnlocked() {
        localStorage.setItem(STORAGE_KEYS.unlocked, JSON.stringify([...this.unlockedIds]));
    }

    loadSelectedIndex() {
        const savedId = parseInt(localStorage.getItem(STORAGE_KEYS.selected), 10);
        const idx = CHARACTERS.findIndex(c => c.id === savedId);
        return (idx >= 0 && this.unlockedIds.has(savedId)) ? idx : 0;
    }

    saveSelected(charId) {
        localStorage.setItem(STORAGE_KEYS.selected, String(charId));
    }

    // Binds one character's hitbox/physics onto the shared bird entity.
    // Multiplies BASE_PHYSICS rather than assigning fixed numbers, so a
    // neutral (1.0/1.0) character reproduces the original feel exactly --
    // collision detection (checkPipeCollision) keeps reading this.bird.radius
    // unchanged, it just now varies per-character.
    applyCharacterPhysics(char) {
        const mods = char.physicsModifiers;
        this.bird.radius = char.hitboxRadius;
        this.bird.gravity = BASE_PHYSICS.gravity * mods.gravityMultiplier;
        this.bird.jump = BASE_PHYSICS.jump * mods.jumpMultiplier;
        this.bird.maxFallSpeed = BASE_PHYSICS.maxFallSpeed * mods.gravityMultiplier;
    }

    // Checks the current run's pipe score against every locked bird's
    // unlockCondition and unlocks + persists + toasts any newly reached.
    checkUnlocks() {
        for (const char of CHARACTERS) {
            if (this.unlockedIds.has(char.id)) continue;
            const cond = char.unlockCondition;
            if (cond.type === 'score' && this.score >= cond.value) {
                this.unlockedIds.add(char.id);
                this.saveUnlocked();
                this.queueUnlockToast(char);
            }
        }
    }

    queueUnlockToast(char) {
        this.audio.playUnlock();
        this.ui.unlockToastText.textContent = `Yeni Kuş Açıldı: ${char.name}!`;
        this.ui.unlockToast.classList.remove('hidden');
        // Force reflow so retriggering the animation class works if a toast
        // is already mid-animation from a previous unlock.
        void this.ui.unlockToast.offsetWidth;
        this.ui.unlockToast.classList.add('show');

        if (this.toastHideTimer) clearTimeout(this.toastHideTimer);
        this.toastHideTimer = setTimeout(() => {
            this.ui.unlockToast.classList.remove('show');
            this.toastHideTimer = setTimeout(() => {
                this.ui.unlockToast.classList.add('hidden');
            }, 300);
        }, 2600);
    }

    // ==========================================
    // LEADERBOARD & PROFILE
    // ==========================================
    // Only called on a genuine new personal best (see triggerGameOver), so a
    // player mashing "restart" doesn't spam writes to Firestore.
    maybeSubmitToLeaderboard() {
        if (!window.leaderboardManager) return;
        const char = CHARACTERS[this.selectedCharIndex];
        const entry = { score: this.score, characterId: char.id, characterName: char.name };

        if (window.leaderboardManager.hasNickname()) {
            const nickname = window.leaderboardManager.getNickname();
            window.leaderboardManager.submitScore({ nickname, ...entry });
        } else {
            // No profile yet -- held until the player saves a nickname (see
            // handleSaveNickname), rather than silently discarding the run.
            this.pendingLeaderboardEntry = entry;
        }
    }

    openLeaderboard() {
        this.ui.nicknameInput.value = window.leaderboardManager ? window.leaderboardManager.getNickname() : '';
        this.ui.nicknameFeedback.classList.add('hidden');
        this.ui.screenLeaderboard.classList.add('active');
        this.loadLeaderboardScores();
    }

    closeLeaderboard() {
        this.ui.screenLeaderboard.classList.remove('active');
    }

    handleSaveNickname() {
        if (!window.leaderboardManager) return;
        const result = window.leaderboardManager.setNickname(this.ui.nicknameInput.value);

        this.ui.nicknameFeedback.classList.remove('hidden', 'success');
        if (!result.ok) {
            this.ui.nicknameFeedback.textContent = result.error;
            return;
        }

        this.ui.nicknameInput.value = result.value;
        this.ui.nicknameFeedback.textContent = 'Kaydedildi!';
        this.ui.nicknameFeedback.classList.add('success');
        this.audio.playSelect();

        // A run finished before the player had a nickname -- send it now.
        if (this.pendingLeaderboardEntry) {
            window.leaderboardManager.submitScore({ nickname: result.value, ...this.pendingLeaderboardEntry });
            this.pendingLeaderboardEntry = null;
            this.loadLeaderboardScores();
        }
    }

    async loadLeaderboardScores() {
        const status = this.ui.leaderboardStatus;
        const list = this.ui.leaderboardList;
        list.innerHTML = '';
        status.classList.remove('hidden');

        if (!window.leaderboardManager || !window.leaderboardManager.isEnabled()) {
            status.textContent = 'Liderlik tablosu henüz yapılandırılmadı. (Firebase kurulumu için README.md dosyasına bakın.)';
            return;
        }

        status.textContent = 'Yükleniyor...';
        const result = await window.leaderboardManager.fetchTop(20);

        if (!result.ok) {
            status.textContent = 'Skorlar yüklenemedi. Bağlantını kontrol edip tekrar dene.';
            return;
        }

        if (result.scores.length === 0) {
            status.textContent = 'Henüz skor yok. İlk sen ol!';
            return;
        }

        status.classList.add('hidden');
        this.renderLeaderboardRows(result.scores);
    }

    // Built with DOM nodes + textContent (never innerHTML) since nicknames
    // are arbitrary text written by other players -- innerHTML here would be
    // a stored-XSS hole letting one player's "name" run script in everyone
    // else's browser.
    renderLeaderboardRows(scores) {
        const list = this.ui.leaderboardList;
        scores.forEach((entry, idx) => {
            const rank = idx + 1;
            const row = document.createElement('li');
            row.className = `leaderboard-row rank-${rank}`;

            const rankEl = document.createElement('span');
            rankEl.className = 'leaderboard-rank';
            rankEl.textContent = `#${rank}`;

            const nameEl = document.createElement('span');
            nameEl.className = 'leaderboard-name';
            nameEl.textContent = entry.nickname;

            const scoreEl = document.createElement('span');
            scoreEl.className = 'leaderboard-score';
            scoreEl.textContent = String(entry.score);

            row.appendChild(rankEl);
            row.appendChild(nameEl);
            row.appendChild(scoreEl);
            list.appendChild(row);
        });
    }

    initUI() {
        this.ui.menuHighScore.textContent = this.highScore;
        // Wired once: fires for whichever character is selected at the time
        // the browser resolves/fails the request, via closure over `this`.
        this.ui.charPreviewImg.onerror = () => this.handlePreviewImgError();
        this.ui.charPreviewImg.onload = () => this.handlePreviewImgLoad();
        this.buildDots();
        this.updateCharacterCard();
    }

    // DOM-side sprite fallback for the select-screen preview: if the image
    // 404s/fails to decode, hide the broken-image icon and tint the box with
    // the character's theme color instead of leaving a blank/broken box.
    handlePreviewImgError() {
        const char = CHARACTERS[this.selectedCharIndex];
        this.ui.charPreviewImg.style.visibility = 'hidden';
        this.ui.charPreviewBox.style.background = `radial-gradient(circle, ${char.themeColor} 0%, transparent 72%)`;
    }

    handlePreviewImgLoad() {
        this.ui.charPreviewImg.style.visibility = 'visible';
        this.ui.charPreviewBox.style.background = 'none';
    }

    buildDots() {
        this.ui.dotsContainer.innerHTML = '';
        CHARACTERS.forEach((char, idx) => {
            const dot = document.createElement('span');
            dot.className = 'dot';
            dot.dataset.index = String(idx);
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectedCharIndex = idx;
                this.updateCharacterCard();
                this.audio.playSelect();
            });
            this.ui.dotsContainer.appendChild(dot);
        });
        this.ui.dots = this.ui.dotsContainer.querySelectorAll('.dot');
    }

    updateCharacterCard() {
        const char = CHARACTERS[this.selectedCharIndex];
        const locked = !this.unlockedIds.has(char.id);

        // Reset any fallback styling from a previous broken sprite before
        // swapping src; handlePreviewImgError() re-applies it if this one
        // also fails to load.
        this.ui.charPreviewImg.style.visibility = 'visible';
        this.ui.charPreviewBox.style.background = 'none';
        this.ui.charPreviewImg.src = char.spriteUrl;
        this.ui.charName.textContent = char.name;
        this.ui.charBadge.textContent = char.badge;
        this.ui.charBadge.className = `char-badge ${char.badgeClass}`;
        this.ui.charDesc.textContent = char.desc;

        this.ui.charPreviewBox.classList.toggle('locked', locked);
        this.ui.lockBadge.classList.toggle('hidden', !locked);
        this.ui.lockReq.textContent = char.unlockCondition.type === 'score' ? char.unlockCondition.value : 0;
        this.ui.characterCard.classList.toggle('locked', locked);
        this.ui.startBtnLabel.textContent = locked ? 'KİLİTLİ 🔒' : 'OYUNA BAŞLA';
        this.ui.startBtn.classList.toggle('locked-btn', locked);

        this.ui.dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === this.selectedCharIndex);
            dot.classList.toggle('locked', !this.unlockedIds.has(CHARACTERS[idx].id));
        });

        this.saveSelected(char.id);

        // Bounce animation on card change
        this.ui.charPreviewImg.style.transform = 'scale(0.85)';
        setTimeout(() => {
            this.ui.charPreviewImg.style.transform = 'scale(1)';
        }, 80);
    }

    setCharIndex(delta) {
        this.selectedCharIndex = (this.selectedCharIndex + delta + CHARACTERS.length) % CHARACTERS.length;
        this.updateCharacterCard();
        this.audio.playSelect();
    }

    denySelection() {
        this.audio.playDenied();
        this.ui.startBtn.classList.remove('shake');
        void this.ui.startBtn.offsetWidth;
        this.ui.startBtn.classList.add('shake');
    }

    bindEvents() {
        // UI Navigation
        this.ui.prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.setCharIndex(-1); });
        this.ui.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.setCharIndex(1); });

        this.ui.startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.prepareGame();
        });

        this.ui.restartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.audio.playSelect();
            this.prepareGame();
        });

        this.ui.changeCharBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.audio.playSelect();
            // Clear the finished run's pipes/particles/effects so they don't
            // render as stale, frozen artifacts behind the select screen.
            this.resetGame();
            this.showScreen(STATE.SELECT);
        });

        this.ui.soundBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const muted = this.audio.toggleMute();
            this.ui.soundBtn.textContent = muted ? '🔇' : '🔊';
        });

        // Leaderboard modal
        const openLeaderboard = (e) => {
            e.stopPropagation();
            this.audio.playSelect();
            this.openLeaderboard();
        };
        this.ui.openLeaderboardBtn.addEventListener('click', openLeaderboard);
        this.ui.viewLeaderboardBtn.addEventListener('click', openLeaderboard);

        this.ui.closeLeaderboardBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeLeaderboard();
        });

        this.ui.refreshLeaderboardBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.loadLeaderboardScores();
        });

        this.ui.saveNicknameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleSaveNickname();
        });

        this.ui.nicknameInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') this.handleSaveNickname();
        });

        // Modal backdrop blocks canvas taps from leaking into handleAction().
        this.ui.screenLeaderboard.addEventListener('pointerdown', (e) => e.stopPropagation());

        // Global Tap / Click / Spacebar
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                this.handleAction();
            } else if (this.state === STATE.SELECT) {
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
                    this.setCharIndex(-1);
                } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
                    this.setCharIndex(1);
                } else if (e.code === 'Enter') {
                    this.prepareGame();
                }
            }
        });

        // Click / Touch on Canvas (Pointer Events unify mouse, touch & pen)
        const handleScreenTouch = (e) => {
            // Ignore if clicking UI buttons
            if (e.target.closest('button') || e.target.closest('.dot')) return;
            this.handleAction();
        };

        this.canvas.addEventListener('pointerdown', handleScreenTouch);
        document.getElementById('ui-layer').addEventListener('pointerdown', handleScreenTouch);
    }

    handleAction() {
        if (this.state === STATE.READY) {
            this.startGame();
        } else if (this.state === STATE.PLAYING) {
            this.flap();
        }
    }

    showScreen(state) {
        this.state = state;
        this.ui.screenSelect.classList.toggle('active', state === STATE.SELECT);
        this.ui.screenReady.classList.toggle('active', state === STATE.READY);
        this.ui.screenGameOver.classList.toggle('active', state === STATE.GAMEOVER);

        if (state === STATE.SELECT) {
            this.ui.menuHighScore.textContent = this.highScore;
            this.updateCharacterCard();
        }
    }

    prepareGame() {
        const char = CHARACTERS[this.selectedCharIndex];
        if (!this.unlockedIds.has(char.id)) {
            this.denySelection();
            return;
        }
        this.audio.playSelect();
        this.resetGame();
        this.showScreen(STATE.READY);
    }

    startGame() {
        this.showScreen(STATE.PLAYING);
        this.flap();
    }

    flap() {
        this.bird.velocity = this.bird.jump;
        this.audio.playJump();

        // Emit Character Particles
        const char = CHARACTERS[this.selectedCharIndex];
        this.particles.emit(this.bird.x - 10, this.bird.y + 5, char.particleType, 3);
    }

    resetGame() {
        // Re-bind physics every run so switching characters between games
        // (or unlocking a new one) takes effect immediately.
        this.applyCharacterPhysics(CHARACTERS[this.selectedCharIndex]);
        this.bird.x = 110;
        this.bird.y = 280;
        this.bird.velocity = 0;
        this.bird.rotation = 0;
        this.bird.hoverTimer = 0;
        this.pipes = [];
        this.pipeSpawnTimer = -35;
        this.score = 0;
        this.screenShake = 0;
        this.flashAlpha = 0;
        this.particles.reset();
    }

    triggerGameOver() {
        this.state = STATE.GAMEOVER;
        this.screenShake = 14;
        this.flashAlpha = 0.7;
        this.audio.playHit();
        this.particles.emitHitBurst(this.bird.x, this.bird.y, 16);

        const isNewRecord = this.score > this.highScore;
        if (isNewRecord) {
            this.highScore = this.score;
            localStorage.setItem(STORAGE_KEYS.highScore, this.highScore.toString());
            this.maybeSubmitToLeaderboard();
        }

        // Update Game Over UI
        this.ui.finalScore.textContent = this.score;
        this.ui.finalHighScore.textContent = this.highScore;
        this.ui.newRecordBadge.classList.toggle('hidden', !isNewRecord || this.score === 0);

        // Medals
        let medal = '—';
        if (this.score >= 40) medal = '💎';
        else if (this.score >= 25) medal = '🥇';
        else if (this.score >= 15) medal = '🥈';
        else if (this.score >= 5) medal = '🥉';
        this.ui.medalDisplay.textContent = medal;

        setTimeout(() => {
            this.showScreen(STATE.GAMEOVER);
        }, 400);
    }

    // ==========================================
    // 4. UPDATE & LOGIC
    // ==========================================
    update(dt) {
        // Background & Ground scrolling
        if (this.state === STATE.SELECT || this.state === STATE.READY || this.state === STATE.PLAYING) {
            this.bgX = (this.bgX - 0.4) % 915;
            this.groundX = (this.groundX - this.pipeSpeed) % 1024;
        }

        // Particle update
        this.particles.update();

        // Screen effects decay
        if (this.screenShake > 0) this.screenShake *= 0.86;
        if (this.screenShake < 0.2) this.screenShake = 0;
        if (this.flashAlpha > 0) this.flashAlpha -= 0.05;

        // Day/Night: every 100 passed pipes flips the theme (0-99 day,
        // 100-199 night, ...). dayNightT eases toward the target each frame
        // so the crossfade is smooth instead of an instant cut.
        const nightTarget = (Math.floor(this.score / 100) % 2 === 1) ? 1 : 0;
        this.dayNightT += (nightTarget - this.dayNightT) * 0.015;
        if (Math.abs(nightTarget - this.dayNightT) < 0.001) this.dayNightT = nightTarget;

        // State specific logic
        if (this.state === STATE.READY || this.state === STATE.SELECT) {
            this.bird.hoverTimer += 0.06;
            this.bird.y = 280 + Math.sin(this.bird.hoverTimer) * 8;
            this.bird.rotation = Math.sin(this.bird.hoverTimer * 0.8) * 0.08;
        }
        else if (this.state === STATE.PLAYING) {
            // Physics
            this.bird.velocity += this.bird.gravity;
            if (this.bird.velocity > this.bird.maxFallSpeed) {
                this.bird.velocity = this.bird.maxFallSpeed;
            }
            this.bird.y += this.bird.velocity;

            // Rotation
            if (this.bird.velocity < 0) {
                this.bird.targetRotation = -24 * (Math.PI / 180);
            } else {
                this.bird.targetRotation = Math.min(Math.PI / 2, (this.bird.velocity - 2) * 0.14);
            }
            this.bird.rotation += (this.bird.targetRotation - this.bird.rotation) * 0.22;

            // Pipes Update
            this.pipeSpawnTimer++;
            if (this.pipeSpawnTimer >= this.pipeSpawnInterval) {
                this.spawnPipe();
                this.pipeSpawnTimer = 0;
            }

            const groundLimitY = CANVAS_HEIGHT - this.groundHeight - this.bird.radius;

            // Ground Collision
            if (this.bird.y >= groundLimitY) {
                this.bird.y = groundLimitY;
                this.triggerGameOver();
                return;
            }

            // Ceiling Clamp
            if (this.bird.y - this.bird.radius <= 0) {
                this.bird.y = this.bird.radius;
                this.bird.velocity = 0;
            }

            // Pipe collisions & scoring
            for (let i = this.pipes.length - 1; i >= 0; i--) {
                const p = this.pipes[i];
                p.x -= this.pipeSpeed;

                // Score check
                if (!p.passed && p.x + this.pipeCapWidth / 2 < this.bird.x) {
                    p.passed = true;
                    this.score++;
                    this.audio.playScore();
                    this.checkUnlocks();
                }

                // Check collision (AABB + Circle approximation)
                if (this.checkPipeCollision(p)) {
                    this.triggerGameOver();
                    return;
                }

                // Remove off-screen pipes
                if (p.x < -this.pipeCapWidth - 20) {
                    this.pipes.splice(i, 1);
                }
            }
        }
        else if (this.state === STATE.GAMEOVER) {
            // Fall to ground
            const groundLimitY = CANVAS_HEIGHT - this.groundHeight - this.bird.radius;
            if (this.bird.y < groundLimitY) {
                this.bird.velocity += this.bird.gravity * 1.4;
                this.bird.y += this.bird.velocity;
                this.bird.rotation = Math.min(Math.PI / 2, this.bird.rotation + 0.15);
                if (this.bird.y >= groundLimitY) {
                    this.bird.y = groundLimitY;
                }
            }
        }
    }

    spawnPipe() {
        const minTop = 60;
        const maxTop = CANVAS_HEIGHT - this.groundHeight - this.pipeGap - 60;
        const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;

        this.pipes.push({
            x: CANVAS_WIDTH + 20,
            top: topHeight,
            bottom: topHeight + this.pipeGap,
            passed: false
        });
    }

    checkPipeCollision(p) {
        const bx = this.bird.x;
        const by = this.bird.y;
        const br = this.bird.radius - 6; // Extra fair inner padding

        const pipeLeft = p.x + (this.pipeCapWidth - this.pipeWidth) / 2;
        const pipeRight = pipeLeft + this.pipeWidth;
        const capLeft = p.x;
        const capRight = p.x + this.pipeCapWidth;

        // Horizontal alignment check
        if (bx + br > capLeft && bx - br < capRight) {
            // Check top pipe cap (bottom 35px of top pipe)
            const topCapBottom = p.top;
            const topCapTop = p.top - 35;

            // Check bottom pipe cap (top 35px of bottom pipe)
            const botCapTop = p.bottom;
            const botCapBottom = p.bottom + 35;

            // Top Pipe Collision
            if (by - br < p.top) {
                // Inside shaft or cap
                if (by - br < topCapTop) {
                    if (bx + br > pipeLeft && bx - br < pipeRight) return true;
                }
                return true;
            }

            // Bottom Pipe Collision
            if (by + br > p.bottom) {
                if (by + br > botCapBottom) {
                    if (bx + br > pipeLeft && bx - br < pipeRight) return true;
                }
                return true;
            }
        }

        return false;
    }

    // ==========================================
    // 5. RENDERING PIPELINE
    // ==========================================
    draw() {
        this.ctx.save();

        // Screen Shake
        if (this.screenShake > 0) {
            const shakeX = (Math.random() - 0.5) * this.screenShake;
            const shakeY = (Math.random() - 0.5) * this.screenShake;
            this.ctx.translate(shakeX, shakeY);
        }

        // 1. Parallax Background + night tint (pipes/ground/bird are drawn
        //    on top afterwards, so this only ever darkens the sky layer)
        this.drawBackground();
        this.drawNightOverlay(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, true);

        // 2. Pipes (kept at full brightness for gameplay readability at night)
        this.drawPipes();

        // 3. Particles (under ground, around bird)
        this.particles.draw(this.ctx);

        // 4. Bird
        this.drawBird();

        // 5. Ground + matching night tint
        this.drawGround();
        const gY = CANVAS_HEIGHT - this.groundHeight;
        this.drawNightOverlay(0, gY, CANVAS_WIDTH, this.groundHeight, false);

        // 6. HUD & Scores
        this.drawHUD();

        // 7. Hit Flash Overlay
        if (this.flashAlpha > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
            this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        this.ctx.restore();
    }

    // Generic infinite horizontal scroller shared by the background and the
    // ground layer. Draws just enough copies of `img` to cover the canvas
    // width with no seam and no redundant off-screen draws.
    drawTiledLayer(img, scrollX, nativeW, nativeH, destY, destH) {
        if (!img.complete || !img.naturalWidth) return;

        const scale = destH / nativeH;
        const renderW = nativeW * scale;

        let startX = (scrollX * scale) % renderW;
        if (startX > 0) startX -= renderW;

        for (let x = startX; x < CANVAS_WIDTH; x += renderW) {
            this.ctx.drawImage(img, x, destY, renderW, destH);
        }
    }

    drawBackground() {
        this.drawTiledLayer(this.images.bg, this.bgX, 915, 750, 0, CANVAS_HEIGHT);
    }

    drawGround() {
        const gY = CANVAS_HEIGHT - this.groundHeight;
        this.drawTiledLayer(this.images.ground, this.groundX, 1024, 124, gY, this.groundHeight);
    }

    // Darkens the given rect toward a night-blue tint as dayNightT -> 1, and
    // (for the sky rect) fades in stars + a sun/moon disc. Drawing this right
    // after each scrolling layer confines the tint to that layer only, since
    // whatever is drawn next (pipes, ground, HUD) paints over it at full
    // brightness.
    drawNightOverlay(x, y, w, h, withCelestial) {
        if (this.dayNightT <= 0.001) return;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, w, h);
        this.ctx.clip();

        this.ctx.globalCompositeOperation = 'multiply';
        this.ctx.globalAlpha = 1;
        const shade = Math.round(255 - this.dayNightT * 165);
        this.ctx.fillStyle = `rgb(${shade}, ${shade}, ${Math.min(255, shade + 45)})`;
        this.ctx.fillRect(x, y, w, h);
        this.ctx.globalCompositeOperation = 'source-over';

        if (withCelestial) {
            // Stars
            this.ctx.fillStyle = '#ffffff';
            for (const s of this.stars) {
                this.ctx.globalAlpha = this.dayNightT * s.twinkle;
                this.ctx.fillRect(s.x, s.y, s.size, s.size);
            }

            // Sun fades out / Moon fades in
            const cx = CANVAS_WIDTH - 60, cy = 70, r = 24;
            this.ctx.globalAlpha = 1 - this.dayNightT;
            this.ctx.fillStyle = '#ffe066';
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.globalAlpha = this.dayNightT;
            this.ctx.fillStyle = '#f4f1de';
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = `rgba(11, 16, 48, ${0.55 * this.dayNightT})`;
            this.ctx.beginPath();
            this.ctx.arc(cx + r * 0.4, cy - r * 0.2, r * 0.72, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    drawPipes() {
        for (const p of this.pipes) {
            const capW = this.pipeCapWidth;

            // 1. Top Pipe
            // Image pipeTop has cap at bottom of sprite
            if (this.images.pipeTop.complete) {
                const topPipeH = p.top;
                // Draw top pipe clipped at p.top
                this.ctx.drawImage(
                    this.images.pipeTop,
                    0, this.images.pipeTop.height - topPipeH, this.images.pipeTop.width, topPipeH,
                    p.x, 0, capW, topPipeH
                );
            }

            // 2. Bottom Pipe
            // Image pipeBottom has cap at top of sprite
            if (this.images.pipeBottom.complete) {
                const botPipeH = CANVAS_HEIGHT - this.groundHeight - p.bottom;
                this.ctx.drawImage(
                    this.images.pipeBottom,
                    0, 0, this.images.pipeBottom.width, botPipeH,
                    p.x, p.bottom, capW, botPipeH
                );
            }
        }
    }

    drawBird() {
        const char = CHARACTERS[this.selectedCharIndex];
        const img = this.images.birds[this.selectedCharIndex];
        // naturalWidth stays 0 if the request 404s/decodes to nothing, even
        // though `complete` is already true -- checking both is what makes
        // a broken sprite fall back instead of silently drawing nothing.
        const spriteReady = img.complete && img.naturalWidth > 0;

        this.ctx.save();
        this.ctx.translate(this.bird.x, this.bird.y);
        this.ctx.rotate(this.bird.rotation);

        const w = this.bird.drawWidth;
        const h = this.bird.drawHeight;

        // Shadow under bird in ready state
        if (this.state === STATE.READY) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 24, 18, 6, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        if (spriteReady) {
            this.ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            this.drawBirdFallback(char, w, h);
        }
        this.ctx.restore();
    }

    // Procedural placeholder used whenever a character's sprite hasn't
    // loaded yet or failed outright, so a missing asset never renders as an
    // invisible bird: a themeColor-tinted body silhouette with beak/eye.
    drawBirdFallback(char, w, h) {
        const r = w / 2;

        this.ctx.fillStyle = char.themeColor;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Beak
        this.ctx.fillStyle = '#f1a208';
        this.ctx.beginPath();
        this.ctx.moveTo(r * 0.7, -r * 0.15);
        this.ctx.lineTo(r * 1.25, 0);
        this.ctx.lineTo(r * 0.7, r * 0.15);
        this.ctx.closePath();
        this.ctx.fill();

        // Eye
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(r * 0.15, -r * 0.35, r * 0.22, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#000';
        this.ctx.beginPath();
        this.ctx.arc(r * 0.2, -r * 0.35, r * 0.1, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawHUD() {
        if (this.state === STATE.PLAYING) {
            // Main Top Score (Reference Pixel Style)
            this.ctx.save();
            this.ctx.font = '36px "Press Start 2P", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';

            const scoreStr = this.score.toString();
            const textX = CANVAS_WIDTH / 2;
            const textY = 40;

            // Bold black outline (matching reference screenshot)
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 10;
            this.ctx.lineJoin = 'miter';
            this.ctx.strokeText(scoreStr, textX, textY);

            // Crisp white fill
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(scoreStr, textX, textY);
            this.ctx.restore();

            // Bottom Left FPS & Score (matching reference layout)
            this.ctx.save();
            this.ctx.font = '12px "Press Start 2P", monospace';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'bottom';

            const hudX = 14;
            const hudY = CANVAS_HEIGHT - this.groundHeight - 12;

            // Outline & Text
            const lines = [`FPS: ${this.fps}`, `SCORE: ${this.score}`];
            lines.forEach((line, idx) => {
                const y = hudY - (1 - idx) * 18;
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 4;
                this.ctx.strokeText(line, hudX, y);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillText(line, hudX, y);
            });
            this.ctx.restore();
        }
    }

    gameLoop(timestamp) {
        // Calculate Delta Time & FPS
        const dt = (timestamp - this.lastFrameTime) / 1000;
        this.lastFrameTime = timestamp;

        this.frameCount++;
        this.fpsTimer += dt;
        if (this.fpsTimer >= 0.5) {
            this.fps = Math.round((this.frameCount / this.fpsTimer));
            this.frameCount = 0;
            this.fpsTimer = 0;
        }

        // Logic & Render
        this.update(dt);
        this.draw();

        requestAnimationFrame((t) => this.gameLoop(t));
    }
}

// Start game on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});

// Register the offline-caching service worker (PWA installability).
// Registered on 'load' so it never competes with the initial page render.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
    });
}
