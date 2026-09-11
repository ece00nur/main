// ==========================================
// LEADERBOARD & PROFILE (Firebase Firestore)
// ==========================================
// No-login design: a player picks a local nickname (localStorage) that is
// attached to score submissions. There is no auth, so this cannot fully stop
// a determined player from editing localStorage/devtools to spoof a score --
// firestore.rules constrains shape/range (see that file's comments) but a
// real anti-cheat guarantee would need server-side run validation
// (Cloud Functions / App Check), which is out of scope for a static site.
// The manager degrades to a harmless no-op ("not configured") when
// firebase-config.js still holds its placeholder values, or when the
// Firebase SDK / network isn't available, so the rest of the game never
// breaks because of this feature.

const LEADERBOARD_STORAGE_KEYS = {
    nickname: 'flying_bird_nickname',
    pendingSubmission: 'flying_bird_pending_score'
};

const LEADERBOARD_COLLECTION = 'leaderboard';
const MAX_NICKNAME_LENGTH = 16;
const MAX_FETCH_LIMIT = 20;

class LeaderboardManager {
    constructor(config) {
        this.config = config;
        this.db = null;
        this.enabled = this.tryInit();
    }

    tryInit() {
        const isPlaceholder = !this.config
            || !this.config.apiKey
            || this.config.apiKey === 'YOUR_API_KEY_HERE'
            || !this.config.projectId
            || this.config.projectId === 'YOUR_PROJECT_ID';

        if (isPlaceholder) return false;
        if (typeof firebase === 'undefined' || !firebase.firestore) return false;

        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(this.config);
            }
            this.db = firebase.firestore();
            // Firestore's default streaming transport can hang for a long
            // time negotiating on restrictive networks (school/corporate
            // Wi-Fi, some proxies/VPNs, sandboxed environments) before
            // falling back. Auto-detecting long-polling up front avoids
            // that stall so score submissions don't appear to freeze.
            this.db.settings({ experimentalAutoDetectLongPolling: true, merge: true });
            return true;
        } catch (err) {
            console.warn('Leaderboard: Firebase init failed, disabling.', err);
            return false;
        }
    }

    isEnabled() {
        return this.enabled;
    }

    // ---------- Local nickname (lightweight "profile") ----------
    getNickname() {
        return localStorage.getItem(LEADERBOARD_STORAGE_KEYS.nickname) || '';
    }

    hasNickname() {
        return this.getNickname().trim().length > 0;
    }

    // Returns { ok, value, error } instead of throwing, so callers can show
    // a friendly inline message without try/catch boilerplate everywhere.
    setNickname(raw) {
        const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
        if (cleaned.length === 0) {
            return { ok: false, error: 'İsim boş olamaz.' };
        }
        if (cleaned.length > MAX_NICKNAME_LENGTH) {
            return { ok: false, error: `İsim en fazla ${MAX_NICKNAME_LENGTH} karakter olabilir.` };
        }
        localStorage.setItem(LEADERBOARD_STORAGE_KEYS.nickname, cleaned);
        return { ok: true, value: cleaned };
    }

    // ---------- Submission ----------
    // Only ever called with a run's final score; game.js decides *when*
    // (new personal best) so we don't spam writes on every single game over.
    async submitScore({ nickname, score, characterId, characterName }) {
        const entry = {
            nickname: String(nickname).slice(0, MAX_NICKNAME_LENGTH),
            score: Math.max(0, Math.floor(Number(score) || 0)),
            characterId: Math.floor(Number(characterId) || 0),
            characterName: String(characterName || '').slice(0, 40)
        };

        if (!this.enabled) {
            this.queuePending(entry);
            return { ok: false, queued: true };
        }

        try {
            await this.db.collection(LEADERBOARD_COLLECTION).add({
                ...entry,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            this.clearPending();
            return { ok: true };
        } catch (err) {
            console.warn('Leaderboard: submit failed, queuing for retry.', err);
            this.queuePending(entry);
            return { ok: false, queued: true, error: err };
        }
    }

    queuePending(entry) {
        try {
            localStorage.setItem(LEADERBOARD_STORAGE_KEYS.pendingSubmission, JSON.stringify(entry));
        } catch (err) {
            // localStorage full/unavailable -- nothing more we can do locally.
        }
    }

    clearPending() {
        localStorage.removeItem(LEADERBOARD_STORAGE_KEYS.pendingSubmission);
    }

    // Retries a previously-queued submission (e.g. the player was offline
    // when they set a new record). Safe to call often -- it's a no-op when
    // there's nothing queued or the manager isn't enabled.
    async flushPending() {
        if (!this.enabled) return;
        const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEYS.pendingSubmission);
        if (!raw) return;

        let entry;
        try {
            entry = JSON.parse(raw);
        } catch (err) {
            this.clearPending();
            return;
        }

        await this.submitScore(entry);
    }

    // ---------- Fetching ----------
    async fetchTop(limit = MAX_FETCH_LIMIT) {
        if (!this.enabled) {
            return { ok: false, reason: 'not-configured', scores: [] };
        }

        try {
            const capped = Math.min(Math.max(1, limit), MAX_FETCH_LIMIT);
            const snap = await this.db.collection(LEADERBOARD_COLLECTION)
                .orderBy('score', 'desc')
                .limit(capped)
                .get();

            const scores = snap.docs.map((doc) => {
                const d = doc.data();
                return {
                    nickname: String(d.nickname || '???').slice(0, MAX_NICKNAME_LENGTH),
                    score: Number(d.score) || 0,
                    characterId: Number(d.characterId) || 0,
                    characterName: String(d.characterName || '')
                };
            });
            return { ok: true, scores };
        } catch (err) {
            console.warn('Leaderboard: fetch failed.', err);
            return { ok: false, reason: 'network-error', scores: [] };
        }
    }
}

window.leaderboardManager = new LeaderboardManager(typeof FIREBASE_CONFIG !== 'undefined' ? FIREBASE_CONFIG : null);
