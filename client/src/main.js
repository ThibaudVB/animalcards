import { io } from 'socket.io-client';
const API = 'http://localhost:3000';

// ─── STATE ─────────────────────────────────────────────────────────────────
let myDeck = [], inventory = [], playerLevel = 1, coins = 0;
let socket = null, opponent = '';
let boosterAvailability = { freeBoostersLeft: 0, winsBoostersAvailable: 0, winsTotal: 0 };

// ─── UTILS ─────────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('token');
const ah = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

async function api(url, opts = {}) {
    try {
        const r = await fetch(API + url, { ...opts, headers: { ...ah(), ...(opts.headers || {}) } });
        if (r.status === 401 || r.status === 403) {
            showToast('Session expirée', 'error');
            setTimeout(() => { localStorage.clear(); location.reload(); }, 1400);
            return null;
        }
        return r;
    } catch { showToast('Erreur réseau 🔌', 'error'); return null; }
}

let _toastT;
function showToast(msg, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'show ' + type;
    clearTimeout(_toastT); _toastT = setTimeout(() => el.className = '', 3200);
}

const EMOJI = { 'Girafe': '🦒', 'Requin-marteau': '🦈', 'Tigre': '🐯' };
const RCOL = { commun: '#9e9e9e', rare: '#42a5f5', épique: '#ab47bc', légendaire: '#f5c518' };
const RCL = { commun: 'rc', rare: 'rr', épique: 're', légendaire: 'rl' };
function em(name) { return EMOJI[name] || '🐾'; }
function rcol(r) { return RCOL[r] || '#9e9e9e'; }
function rcl(r) { return RCL[r] || 'rc'; }

// ─── NAVIGATION + SWIPE ────────────────────────────────────────────────────
const slider = document.getElementById('slider');
const viewport = document.getElementById('viewport');
const navBtns = document.querySelectorAll('.nb');
let currentTab = 0;
let touchStartX = 0, touchStartY = 0, isSwiping = false;

function goToTab(idx, smooth = true) {
    currentTab = idx;
    slider.style.transition = smooth ? 'transform .3s cubic-bezier(.4,0,.2,1)' : 'none';
    slider.style.transform = `translateX(-${idx * 20}%)`;
    navBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
    if (idx === 0) refreshHome();
    if (idx === 1) renderDeckView();
    if (idx === 2) renderBoutiqueState();
    if (idx === 3) loadFriends();
    if (idx === 4) loadScoreboard();
}
window.goToTab = goToTab;

navBtns.forEach((btn, i) => btn.addEventListener('click', () => goToTab(i)));

viewport.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
}, { passive: true });

viewport.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (!isSwiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) isSwiping = true;
    if (isSwiping) {
        const offset = -(currentTab * 20) + (dx / window.innerWidth) * 100 / 5;
        slider.style.transition = 'none';
        slider.style.transform = `translateX(${offset}%)`;
    }
}, { passive: true });

viewport.addEventListener('touchend', e => {
    if (!isSwiping) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -50 && currentTab < 4) goToTab(currentTab + 1);
    else if (dx > 50 && currentTab > 0) goToTab(currentTab - 1);
    else goToTab(currentTab);
    isSwiping = false;
}, { passive: true });

// ─── AUTH ───────────────────────────────────────────────────────────────────
let isLogin = true;
const authScreen = document.getElementById('auth-screen');
const gameScreen = document.getElementById('game-screen');

function setAuthMode(login) {
    isLogin = login;
    document.getElementById('form-title').innerText = login ? 'Connexion' : 'Inscription';
    document.getElementById('submit-btn').innerText = login ? 'Se connecter' : "S'inscrire";
    document.getElementById('toggle-link').innerHTML = login
        ? "Pas de compte ? <span>S'inscrire</span>"
        : "Déjà un compte ? <span>Se connecter</span>";
    document.getElementById('toggle-link').querySelector('span').onclick = () => setAuthMode(!isLogin);
    document.getElementById('error-msg').innerText = '';
}
setAuthMode(true);

document.getElementById('submit-btn').addEventListener('click', async () => {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    const err = document.getElementById('error-msg');
    if (!u || !p) { err.innerText = 'Remplis tous les champs.'; return; }
    err.innerText = '';
    const r = await fetch(`${API}${isLogin ? '/login' : '/register'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p })
    });
    const d = await r.json();
    if (r.ok) {
        localStorage.setItem('token', d.token);
        localStorage.setItem('username', d.username);
        launchGame();
    } else err.innerText = d.error;
});
document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('submit-btn').click(); });
document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Se déconnecter ?')) { if (socket) socket.disconnect(); localStorage.clear(); location.reload(); }
});

function launchGame() {
    authScreen.style.display = 'none';
    gameScreen.style.display = 'flex';
    document.getElementById('tb-username').innerText = localStorage.getItem('username') || '?';
    initSocket();
    loadInventory().then(() => goToTab(0));
}
if (getToken()) launchGame();

function updateTopBar(data) {
    document.getElementById('tb-level').innerText = data.level;
    document.getElementById('tb-xp-fill').style.width = `${Math.min(100, (data.xp / data.xpNeeded) * 100)}%`;
    document.getElementById('tb-coins').innerText = data.coins ?? 0;
}

async function loadInventory() {
    const r = await api('/api/inventory');
    if (!r || !r.ok) return;
    const d = await r.json();
    inventory = d.inventory;
    myDeck = d.deck;
    playerLevel = d.level;
    coins = d.coins ?? 0;
    updateTopBar(d);

    boosterAvailability = {
        freeBoostersLeft: d.freeBoostersLeft ?? 0,
        winsBoostersAvailable: d.winsBoostersAvailable ?? 0,
        winsTotal: d.stats?.wins || 0
    };

    renderDeckView();
    refreshHome();
    renderBoutiqueState();
}

// ─── HOME ───────────────────────────────────────────────────────────────────
function refreshHome() {
    // Welcome banner — visible only while free boosters remain
    const banner = document.getElementById('welcome-banner');
    if (banner) {
        const n = boosterAvailability.freeBoostersLeft;
        if (n > 0) {
            banner.style.display = 'flex';
            banner.innerHTML = `
                <div class="wb-left">
                    <div class="wb-icon">🎁</div>
                    <div class="wb-text">
                        <div class="wb-title">Boosters offerts !</div>
                        <div class="wb-sub">Tu as <b>${n}</b> booster${n > 1 ? 's' : ''} gratuit${n > 1 ? 's' : ''} qui t'attend${n > 1 ? 'ent' : ''} en boutique</div>
                    </div>
                </div>
                <button class="wb-btn" onclick="goToTab(2)">Ouvrir →</button>
            `;
        } else {
            banner.style.display = 'none';
        }
    }

    // Lock / deck warn
    const lock = document.getElementById('home-lock');
    const warn = document.getElementById('home-deck-warn');
    const btn = document.getElementById('battle-btn');
    if (playerLevel < 2) {
        lock.style.display = 'block'; warn.style.display = 'none';
        btn.classList.add('disabled');
    } else {
        lock.style.display = 'none';
        if (myDeck.length < 3) { warn.style.display = 'block'; btn.classList.add('disabled'); }
        else { warn.style.display = 'none'; btn.classList.remove('disabled'); }
    }

    // Deck strip
    const dsc = document.getElementById('ds-cards');
    if (myDeck.length === 0) { dsc.innerHTML = '<span class="ds-empty">Aucune carte</span>'; return; }
    dsc.innerHTML = myDeck.map(id => {
        const c = inventory.find(x => x.id === id);
        return c ? `<div class="ds-mini">${em(c.name)} ${c.name}</div>` : '';
    }).join('');
}

// ─── INVENTORY / DECK VIEW ──────────────────────────────────────────────────
function renderDeckView() {
    const grid = document.getElementById('deck-grid');
    const countLbl = document.getElementById('deck-count-lbl');
    if (!grid) return;
    countLbl.innerText = `${myDeck.length}/3`;
    grid.innerHTML = [0, 1, 2].map(i => {
        const id = myDeck[i];
        if (!id) return `<div class="dslot"><span class="dslot-empty-lbl">Slot ${i + 1}</span><span style="font-size:1.4em;opacity:.15">+</span></div>`;
        const c = inventory.find(x => x.id === id);
        if (!c) return '';
        return `<div class="dslot filled" onclick="openCardModal(${c.id})">
            <button class="dslot-remove" onclick="event.stopPropagation();removeDeckCard(${c.id})">✕</button>
            <div class="dslot-emoji">${em(c.name)}</div>
            <div class="dslot-name">${c.name}</div>
            <div class="dslot-stats">❤️${c.hp} ⚡${c.speed}</div>
            <div class="dslot-rbar" style="background:${rcol(c.rarity)}"></div>
        </div>`;
    }).join('');
    const ig = document.getElementById('inv-grid');
    if (ig) ig.innerHTML = buildInvCards(inventory);
}

function buildInvCards(cards) {
    return cards.map(c => {
        const inDeck = myDeck.includes(c.id);
        return `<div class="icard ${c.status === 'locked' ? 'ilocked' : ''} ${c.status === 'pending' ? 'ipending' : ''} ${inDeck ? 'ideck' : ''}"
             onclick="openCardModal(${c.id})">
            ${c.status === 'locked' ? '<div class="icard-overlay">🔒</div>' : ''}
            ${c.status === 'pending' ? '<div class="icard-overlay">❓</div>' : ''}
            ${inDeck ? '<div class="icard-deck-badge">DECK</div>' : ''}
            <div class="icard-emoji">${em(c.name)}</div>
            <div class="icard-name">${c.name}</div>
            <div class="icard-hp">❤️${c.hp}</div>
            <div class="icard-rbar ${rcl(c.rarity)}"></div>
        </div>`;
    }).join('');
}

window.switchCardTab = function (btn, tab) {
    document.querySelectorAll('.ctab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ctab-deck').style.display = tab === 'deck' ? 'block' : 'none';
    document.getElementById('ctab-collection').style.display = tab === 'collection' ? 'block' : 'none';
    if (tab === 'collection') renderCollection();
};

function renderCollection() {
    const u = inventory.filter(c => c.status === 'unlocked').length;
    const p = inventory.filter(c => c.status === 'pending').length;
    document.getElementById('coll-stats').innerHTML = `
        <div class="cstat"><div class="cstat-v">${u}</div><div class="cstat-l">Débloquées</div></div>
        <div class="cstat"><div class="cstat-v">${p}</div><div class="cstat-l">En attente</div></div>
        <div class="cstat"><div class="cstat-v">${inventory.length}</div><div class="cstat-l">Total</div></div>`;
    document.getElementById('coll-grid').innerHTML = buildInvCards(inventory);
}

window.removeDeckCard = async function (id) {
    myDeck = myDeck.filter(x => x !== id);
    await api('/api/save-deck', { method: 'POST', body: JSON.stringify({ deck: myDeck }) });
    renderDeckView(); refreshHome();
};

window.addDeckCard = async function (id) {
    if (myDeck.includes(id)) return;
    if (myDeck.length >= 3) { showToast('Deck plein !', 'error'); return; }
    myDeck.push(id);
    await api('/api/save-deck', { method: 'POST', body: JSON.stringify({ deck: myDeck }) });
    renderDeckView(); refreshHome();
};

// ─── CARD MODAL ─────────────────────────────────────────────────────────────
window.openCardModal = function (cardId) {
    const c = inventory.find(x => x.id === cardId);
    if (!c) return;
    const inDeck = myDeck.includes(c.id);
    let action = '';
    if (c.status === 'locked') action = `<div class="cmd-locked-msg">🔒 Ouvre un booster pour débloquer cette carte</div>`;
    else if (c.status === 'pending') action = `<button class="cmd-btn cmd-btn-quiz" onclick="doQuiz(${c.id})">❓ Passer le quiz (+50 XP)</button>`;
    else if (inDeck) action = `<button class="cmd-btn cmd-btn-remove" onclick="removeDeckCard(${c.id});closeCardModal()">− Retirer du deck</button>`;
    else if (myDeck.length < 3) action = `<button class="cmd-btn cmd-btn-add" onclick="addDeckCard(${c.id});closeCardModal()">+ Ajouter au deck</button>`;
    else action = `<div class="cmd-locked-msg">Deck plein (3/3) — retire une carte d'abord</div>`;

    document.getElementById('card-modal-inner').innerHTML = `
        <div class="cmd-head">
            <div class="cmd-emoji">${em(c.name)}</div>
            <div class="cmd-title">
                <div class="cmd-name">${c.name}</div>
                <div class="cmd-type">${c.type} · <span style="color:${rcol(c.rarity)};font-weight:900">${c.rarity}</span></div>
            </div>
        </div>
        <div class="cmd-stats-grid">
            <div class="cmd-stat"><div class="cmd-stat-v">❤️ ${c.hp}</div><div class="cmd-stat-l">PV</div></div>
            <div class="cmd-stat"><div class="cmd-stat-v">⚔️ ${c.attack}</div><div class="cmd-stat-l">Attaque</div></div>
            <div class="cmd-stat"><div class="cmd-stat-v">🛡️ ${c.defense}</div><div class="cmd-stat-l">Défense</div></div>
            <div class="cmd-stat"><div class="cmd-stat-v">⚡ ${c.speed}</div><div class="cmd-stat-l">Vitesse</div></div>
        </div>
        ${c.description ? `<div class="cmd-desc">${c.description}</div>` : ''}
        <div class="cmd-moves">${(c.moves || []).map(m => `
            <div class="cmd-move ${m.category}">
                <div class="cmd-move-name">${m.name}</div>
                <div class="cmd-move-info">${m.power > 0 ? `⚡ Puissance ${m.power}` : '✨ Statut'} · ${m.category}</div>
            </div>`).join('')}</div>
        ${action}
    `;
    document.getElementById('card-modal').style.display = 'flex';
};
window.closeCardModal = function () { document.getElementById('card-modal').style.display = 'none'; };

window.doQuiz = async function (cardId) {
    closeCardModal();
    await startQuiz(cardId);
};

// ─── QUIZ SYSTEM ────────────────────────────────────────────────────────────
let quizState = null;

async function startQuiz(cardId) {
    const r = await api(`/api/quiz/start?cardId=${cardId}`);
    if (!r) return;
    const d = await r.json();
    if (!r.ok) { showToast(d.error, 'error'); return; }

    const card = inventory.find(c => c.id === cardId);
    quizState = {
        cardId, cardName: card?.name || '?',
        sessionId: d.sessionId, questions: d.questions,
        total: d.total, current: 0, scores: [], answered: false
    };

    renderQuiz();
    document.getElementById('quiz-modal').style.display = 'flex';
}

function renderQuiz() {
    const { questions, current, total, scores, cardName } = quizState;
    const panel = document.getElementById('quiz-panel');
    const progressPct = (current / total) * 100;
    const letters = ['A', 'B', 'C', 'D'];

    const dotsHtml = Array.from({ length: total }, (_, i) => {
        let cls = 'pending';
        if (i < scores.length) cls = scores[i] ? 'correct' : 'wrong';
        return `<div class="qsd ${cls}"></div>`;
    }).join('');

    const q = questions[current];
    const choicesHtml = q.choices.map((c, i) =>
        `<button class="quiz-choice" data-idx="${i}" onclick="quizAnswer(${i})">
            <div class="qc-letter">${letters[i]}</div>
            <div class="qc-text">${c}</div>
            <div class="qc-icon" id="qc-icon-${i}"></div>
        </button>`
    ).join('');

    panel.innerHTML = `
        <div class="quiz-card-header">
            <div class="qch-emoji">${em(cardName)}</div>
            <div class="qch-info">
                <div class="qch-name">${cardName}</div>
                <div class="qch-sub">Quiz de déblocage · ${total} questions</div>
            </div>
            <button onclick="closeQuiz()" style="background:transparent;color:rgba(255,255,255,.4);font-size:1.3em;padding:4px 8px;">✕</button>
        </div>
        <div class="quiz-progress-wrap">
            <div class="quiz-progress-labels">
                <span>Question ${current + 1}/${total}</span>
                <span>${scores.filter(Boolean).length} ✓ correctes</span>
            </div>
            <div class="quiz-progress-track">
                <div class="quiz-progress-fill" style="width:${progressPct}%"></div>
            </div>
        </div>
        <div class="quiz-score-dots">${dotsHtml}</div>
        <div class="quiz-question-wrap">
            <div class="quiz-q-num">Question ${current + 1}</div>
            <div class="quiz-question">${q.question}</div>
        </div>
        <div class="quiz-choices" id="quiz-choices">${choicesHtml}</div>
        <div class="quiz-feedback" id="quiz-feedback"></div>
        <div class="quiz-next-wrap">
            <button class="quiz-next" id="quiz-next" onclick="quizNext()">
                ${current + 1 < total ? 'Question suivante →' : 'Voir les résultats 🏆'}
            </button>
        </div>
    `;
    quizState.answered = false;
}

window.quizAnswer = async function (choiceIdx) {
    if (quizState.answered) return;
    quizState.answered = true;

    const r = await api('/api/quiz/answer', {
        method: 'POST',
        body: JSON.stringify({ sessionId: quizState.sessionId, questionIndex: quizState.current, choiceIndex: choiceIdx })
    });
    if (!r) return;
    const d = await r.json();
    if (!r.ok) { showToast(d.error, 'error'); return; }

    const { correct, correctAnswer } = d;
    quizState.scores.push(correct);

    document.querySelectorAll('.quiz-choice').forEach(btn => btn.classList.add('locked'));
    const btns = document.querySelectorAll('.quiz-choice');
    btns[correctAnswer].classList.add('correct-ans');
    btns[correctAnswer].querySelector('.qc-icon').innerText = '✅';
    if (!correct) {
        btns[choiceIdx].classList.add('wrong-ans');
        btns[choiceIdx].querySelector('.qc-icon').innerText = '❌';
    }

    const dots = document.querySelectorAll('.qsd');
    if (dots[quizState.current]) {
        dots[quizState.current].classList.remove('pending');
        dots[quizState.current].classList.add(correct ? 'correct' : 'wrong');
    }

    const fb = document.getElementById('quiz-feedback');
    if (correct) {
        fb.className = 'quiz-feedback show ok';
        const msgs = ['Parfait ! 🎯', 'Excellent ! 🌟', 'Bravo ! 💪', 'Super ! ✨', 'Bien joué ! 🔥'];
        fb.innerText = msgs[Math.floor(Math.random() * msgs.length)];
    } else {
        fb.className = 'quiz-feedback show bad';
        fb.innerText = `Raté ! La bonne réponse était : "${quizState.questions[quizState.current].choices[correctAnswer]}"`;
    }

    document.getElementById('quiz-next').classList.add('show');
};

window.quizNext = async function () {
    quizState.current++;
    if (quizState.current >= quizState.total) { await showQuizResult(); return; }
    renderQuiz();
};

async function showQuizResult() {
    const r = await api('/api/quiz/complete', {
        method: 'POST',
        body: JSON.stringify({ sessionId: quizState.sessionId })
    });
    if (!r) return;
    const d = await r.json();
    if (!r.ok) { showToast(d.error, 'error'); return; }

    const { passed, score, total, xpGain, leveledUp, newLevel } = d;
    const stars = score >= 5 ? '⭐⭐⭐' : score >= 4 ? '⭐⭐' : score >= 3 ? '⭐' : '';
    const panel = document.getElementById('quiz-panel');

    if (passed) {
        panel.innerHTML = `
            <div class="quiz-result">
                <div class="qr-emoji">🎉</div>
                <div class="qr-title" style="color:#f5c518">CARTE DÉBLOQUÉE !</div>
                <div class="qr-stars">${stars}</div>
                <div class="qr-score"><b>${score}/${total}</b> bonnes réponses</div>
                <div class="qr-xp">+${xpGain} XP gagné !${leveledUp ? `<br>🎊 NIVEAU ${newLevel} !` : ''}</div>
                <div style="font-size:2.5em">${em(quizState.cardName)}</div>
                <div style="font-family:'Lilita One',cursive;font-size:1.1em;color:#fff">${quizState.cardName}</div>
                <div style="font-size:.78em;color:rgba(255,255,255,.4);font-weight:700">Disponible dans ton deck !</div>
                <div class="qr-btns"><button class="btn-primary" onclick="closeQuiz(true)">Retour à la collection</button></div>
            </div>`;
        await loadInventory();
    } else {
        panel.innerHTML = `
            <div class="quiz-result">
                <div class="qr-emoji">😞</div>
                <div class="qr-title" style="color:#ef5350">Pas tout à fait...</div>
                <div class="qr-score"><b>${score}/${total}</b> bonnes réponses</div>
                <div class="qr-fail-hint">Il faut au moins <b>3/5</b> bonnes réponses pour débloquer la carte.<br>Tu peux réessayer quand tu veux !</div>
                <div class="qr-btns">
                    <button class="btn-primary" onclick="retryQuiz()">Réessayer 🔄</button>
                    <button class="btn-outline" onclick="closeQuiz(false)" style="width:100%;padding:12px">Fermer</button>
                </div>
            </div>`;
    }
}

window.retryQuiz = async function () { await startQuiz(quizState.cardId); };
window.closeQuiz = function (reload = false) {
    document.getElementById('quiz-modal').style.display = 'none';
    quizState = null;
    if (reload) { loadInventory(); goToTab(1); }
};

// ─── BOUTIQUE ───────────────────────────────────────────────────────────────
function renderBoutiqueState() {
    const { freeBoostersLeft, winsBoostersAvailable, winsTotal } = boosterAvailability;
    const totalFree = freeBoostersLeft + winsBoostersAvailable;
    const canAfford = coins >= 1000;

    const freeBtn = document.getElementById('open-booster-btn');
    const freeInfo = document.getElementById('booster-free-info');
    if (freeBtn) {
        freeBtn.disabled = totalFree === 0;
        freeBtn.style.opacity = totalFree === 0 ? '0.4' : '1';
        freeBtn.style.cursor = totalFree === 0 ? 'not-allowed' : 'pointer';
    }
    if (freeInfo) {
        if (freeBoostersLeft > 0) {
            freeInfo.innerHTML = `🎁 <b>${freeBoostersLeft}</b> booster${freeBoostersLeft > 1 ? 's' : ''} offert${freeBoostersLeft > 1 ? 's' : ''} disponible${freeBoostersLeft > 1 ? 's' : ''}`;
            freeInfo.style.color = '#66bb6a';
        } else if (winsBoostersAvailable > 0) {
            freeInfo.innerHTML = `🏆 <b>${winsBoostersAvailable}</b> booster${winsBoostersAvailable > 1 ? 's' : ''} victoire disponible${winsBoostersAvailable > 1 ? 's' : ''}`;
            freeInfo.style.color = '#f5c518';
        } else {
            const winsToNext = 5 - (winsTotal % 5);
            freeInfo.innerHTML = `⏳ Prochain booster dans <b>${winsToNext} victoire${winsToNext > 1 ? 's' : ''}</b>`;
            freeInfo.style.color = 'rgba(255,255,255,.5)';
        }
    }

    const paidBtn = document.getElementById('buy-booster-btn');
    const paidInfo = document.getElementById('booster-paid-info');
    if (paidBtn) {
        paidBtn.disabled = !canAfford;
        paidBtn.style.opacity = !canAfford ? '0.4' : '1';
        paidBtn.style.cursor = !canAfford ? 'not-allowed' : 'pointer';
    }
    if (paidInfo) {
        if (canAfford) {
            paidInfo.innerHTML = `Vous avez <b>${coins} 🪙</b> — achat disponible !`;
            paidInfo.style.color = '#66bb6a';
        } else {
            paidInfo.innerHTML = `🔒 Il vous faut <b>1 000 🪙</b> (vous avez ${coins} 🪙)`;
            paidInfo.style.color = 'rgba(255,255,255,.4)';
        }
    }
}

async function openBooster(buyWithCoins = false) {
    const btn = buyWithCoins ? document.getElementById('buy-booster-btn') : document.getElementById('open-booster-btn');
    if (btn) btn.disabled = true;

    const r = await api('/api/open-booster', { method: 'POST', body: JSON.stringify({ buyWithCoins }) });
    if (btn) btn.disabled = false;
    if (!r) return;

    const d = await r.json();
    if (r.ok) {
        const c = d.card;
        const sourceLabel = d.source === 'free' ? '🎁 Booster offert utilisé !' : d.source === 'wins' ? '🏆 Booster victoire utilisé !' : '🪙 Booster acheté !';
        const resultEl = document.getElementById('booster-result');
        resultEl.style.display = 'block';
        resultEl.innerHTML = `
            <div style="font-size:.78em;font-weight:900;color:rgba(255,255,255,.45);margin-bottom:8px">${sourceLabel}</div>
            <div style="font-size:2.8em;margin-bottom:8px">${em(c.name)}</div>
            <div style="font-family:'Lilita One',cursive;font-size:1.2em">${c.name}</div>
            <div style="font-size:.8em;color:rgba(255,255,255,.5);margin:4px 0">${c.type}</div>
            <span style="background:${rcol(c.rarity)};color:#fff;padding:2px 10px;border-radius:10px;font-size:.72em;font-weight:900">${c.rarity}</span>
            <div style="margin-top:10px;font-size:.78em;color:rgba(255,255,255,.5);font-weight:700">❓ Quiz disponible dans ta collection</div>`;

        showToast(`📦 ${c.name} obtenu !`, 'success');
        boosterAvailability.freeBoostersLeft = d.freeBoostersLeft;
        boosterAvailability.winsBoostersAvailable = d.winsBoostersAvailable;
        coins = d.coins ?? coins;
        updateTopBar({ level: playerLevel, xp: 0, xpNeeded: playerLevel * 100, coins });
        renderBoutiqueState();
        await loadInventory();
    } else {
        showToast(d.error, 'error');
    }
}

document.getElementById('open-booster-btn').addEventListener('click', () => openBooster(false));
document.getElementById('buy-booster-btn')?.addEventListener('click', () => openBooster(true));

// ─── SOCIAL ─────────────────────────────────────────────────────────────────
let friendsCache = [], searchT;
document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(searchT);
    const q = e.target.value.trim();
    if (q.length < 2) { document.getElementById('search-results').innerHTML = ''; return; }
    searchT = setTimeout(() => searchPlayers(q), 350);
});

async function searchPlayers(q) {
    const r = await api(`/api/search-player?q=${encodeURIComponent(q)}`);
    if (!r || !r.ok) return;
    const { results } = await r.json();
    const myF = friendsCache.map(f => f.username);
    document.getElementById('search-results').innerHTML = results.length === 0
        ? '<span class="empty-hint">Aucun résultat</span>'
        : results.map(p => `<div class="pr-row">
            <div class="pr-info"><span class="pr-name"><span class="${p.isOnline ? 'dot-on' : 'dot-off'}"></span>${p.username}</span><span class="pr-meta">Nv.${p.level} · ${p.wins}V</span></div>
            <div class="pr-actions">${myF.includes(p.username) ? '<span style="color:#66bb6a;font-size:.8em;font-weight:800">✓ Ami</span>' : `<button class="btn-sm btn-green" onclick="sendFReq('${p.username}')">+ Ajouter</button>`}</div>
        </div>`).join('');
}

async function loadFriends() {
    const r = await api('/api/friends');
    if (!r || !r.ok) return;
    const d = await r.json();
    friendsCache = d.friends || [];
    const reqBox = document.getElementById('requests-box');
    if (d.requests?.length > 0) {
        reqBox.style.display = 'block';
        document.getElementById('req-count').innerText = d.requests.length;
        document.getElementById('friend-requests-list').innerHTML = d.requests.map(req => `
            <div class="pr-row"><div class="pr-info"><span class="pr-name">${req}</span><span class="pr-meta">Demande d'ami</span></div>
            <div class="pr-actions"><button class="btn-sm btn-green" onclick="acceptFReq('${req}')">✓</button><button class="btn-sm btn-red" onclick="rejectFReq('${req}')">✕</button></div></div>`).join('');
    } else reqBox.style.display = 'none';
    document.getElementById('friends-list').innerHTML = d.friends.length === 0
        ? '<span class="empty-hint">Aucun ami. Recherche des joueurs !</span>'
        : d.friends.map(f => `<div class="pr-row">
            <div class="pr-info"><span class="pr-name"><span class="${f.isOnline ? 'dot-on' : 'dot-off'}"></span>${f.username}</span><span class="pr-meta">Nv.${f.level} · ${f.wins}V</span></div>
            <button class="btn-sm btn-grey" onclick="removeFriend('${f.username}')">Retirer</button></div>`).join('');
}

window.sendFReq = async u => { const r = await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ targetUsername: u }) }); if (r) { const d = await r.json(); showToast(r.ok ? d.message : d.error, r.ok ? 'success' : 'error'); } };
window.acceptFReq = async u => { const r = await api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ senderUsername: u }) }); if (r && r.ok) { showToast('Ami ajouté 🎉', 'success'); loadFriends(); } };
window.rejectFReq = async u => { await api('/api/friends/reject', { method: 'POST', body: JSON.stringify({ senderUsername: u }) }); loadFriends(); };
window.removeFriend = async u => { if (!confirm(`Retirer ${u} ?`)) return; await api('/api/friends/remove', { method: 'POST', body: JSON.stringify({ friendUsername: u }) }); loadFriends(); };

// ─── SCOREBOARD ─────────────────────────────────────────────────────────────
let sbData = [], sbSort = 'level';
document.querySelectorAll('.rpill').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.rpill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); sbSort = btn.dataset.sort; renderScoreboard();
    });
});
async function loadScoreboard() {
    document.getElementById('scoreboard').innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);font-weight:800">Chargement...</div>';
    const r = await api('/api/scoreboard');
    if (!r || !r.ok) return;
    const d = await r.json();
    sbData = d.scoreboard; window._me = d.currentUser; renderScoreboard();
}
function renderScoreboard() {
    const sorted = [...sbData].sort((a, b) => sbSort === 'level' ? b.level - a.level || b.wins - a.wins : sbSort === 'wins' ? b.wins - a.wins : sbSort === 'winRate' ? b.winRate - a.winRate : b.totalCards - a.totalCards);
    const M = ['🥇', '🥈', '🥉'];
    document.getElementById('scoreboard').innerHTML = sorted.map((p, i) => {
        const me = p.username === window._me;
        const cl = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        return `<div class="sc-row ${cl} ${me ? 'me' : ''}">
            ${i < 3 ? `<div class="sc-medal">${M[i]}</div>` : `<div class="sc-num">#${i + 1}</div>`}
            <div class="sc-info"><div class="sc-name">${p.username}${me ? ' <span style="color:#42a5f5;font-size:.72em">(toi)</span>' : ''}</div>
            <div class="sc-sub">Nv.${p.level} · ${p.totalCards} cartes · ${p.winRate}% WR</div></div>
            <div class="sc-wl"><div class="sc-w">${p.wins}V</div><div class="sc-l">${p.losses}D</div></div>
        </div>`;
    }).join('');
}

// ─── SOCKET / COMBAT ────────────────────────────────────────────────────────
function initSocket() {
    if (socket) return;
    socket = io(API, { auth: { token: getToken() } });
    socket.on('connect_error', err => { if (err.message.includes('Token')) { localStorage.clear(); location.reload(); } });
    socket.on('matchmaking_error', d => { document.getElementById('mm-overlay').style.display = 'none'; showToast(d.message, 'error'); });
    socket.on('match_state', d => {
        opponent = d.opponent;
        document.getElementById('mm-overlay').style.display = 'none';
        gameScreen.style.display = 'none';
        const cs = document.getElementById('combat-screen');
        cs.style.display = 'flex';
        document.getElementById('enemy-name').innerText = '⚔️ ' + d.opponent;
        document.getElementById('cbt-log').innerHTML = `Duel vs <b>${d.opponent}</b> ! Choisis ton attaque !`;
        updateBoard(d);
    });
    socket.on('turn_result', d => {
        document.getElementById('cbt-log').innerHTML = d.logs.join('<br>');
        updateBoard(d.state);
        if (!d.isOver) setTimeout(() => { document.getElementById('cbt-log').innerHTML += '<br><em style="color:rgba(0,0,0,.4)">Attaque !</em>'; }, 750);
    });
    socket.on('match_end', d => showEndModal(d));
    socket.on('friend_request', d => { showToast(`📨 ${d.from} t'a envoyé une demande !`, 'info'); });
    socket.on('friend_accepted', d => { showToast(`✅ ${d.by} a accepté ta demande !`, 'success'); });
}

// ─── COMBAT BOARD ───────────────────────────────────────────────────────────
const TYPE_COLOR = { Mammifère: '#8d6e63', Poisson: '#29b6f6', Reptile: '#66bb6a', Oiseau: '#ffca28' };
function tc(card) { return TYPE_COLOR[card.type] || '#9e9e9e'; }
function hpClass(cur, max) { const p = cur / max; return p > .5 ? '' : p > .25 ? 'mid' : 'low'; }

function bigCard(card, isActive) {
    if (!card) return '';
    const ko = card.currentHp <= 0;
    const pct = Math.max(0, (card.currentHp / card.hp) * 100);
    return `<div class="cbt-card ${isActive ? 'active-card' : ''} ${ko ? 'ko-card' : ''}">
        <div class="cbt-card-type-stripe" style="background:${tc(card)}"></div>
        <div class="cbt-card-emoji">${em(card.name)}</div>
        <div class="cbt-card-name">${card.name}</div>
        <div class="cbt-hp-wrap">
            <div class="cbt-hp-bar"><div class="cbt-hp-fill ${hpClass(card.currentHp, card.hp)}" style="width:${pct}%"></div></div>
            <div class="cbt-hp-txt">${card.currentHp}/${card.hp}</div>
        </div>
    </div>`;
}

function benchCard(card) {
    if (!card) return '';
    const ko = card.currentHp <= 0;
    const pct = Math.max(0, (card.currentHp / card.hp) * 100);
    return `<div class="cbt-bench-card ${ko ? 'ko-card' : ''}">
        <div class="cbt-card-type-stripe" style="background:${tc(card)}"></div>
        <div class="cbt-card-emoji">${em(card.name)}</div>
        <div class="cbt-card-name">${card.name}</div>
        <div class="cbt-hp-wrap">
            <div class="cbt-hp-bar"><div class="cbt-hp-fill ${hpClass(card.currentHp, card.hp)}" style="width:${pct}%"></div></div>
            <div class="cbt-hp-txt">${card.currentHp}/${card.hp}</div>
        </div>
    </div>`;
}

function updateBoard(state) {
    const pts = n => '🔴'.repeat(Math.max(0, n)) + '⚪'.repeat(Math.max(0, 3 - n));
    document.getElementById('player-pts').innerText = pts(state.myPoints);
    document.getElementById('enemy-pts').innerText = pts(state.enemyPoints);
    document.getElementById('enemy-active').innerHTML = bigCard(state.enemyCards[state.enemyActiveIndex], true);
    document.getElementById('enemy-bench').innerHTML = state.enemyCards.map((c, i) => i !== state.enemyActiveIndex ? benchCard(c) : '').join('');
    document.getElementById('player-active').innerHTML = bigCard(state.myCards[state.myActiveIndex], true);
    document.getElementById('player-bench').innerHTML = state.myCards.map((c, i) => i !== state.myActiveIndex ? benchCard(c) : '').join('');

    const acts = document.getElementById('cbt-actions');
    const myActive = state.myCards[state.myActiveIndex];
    if (myActive && myActive.currentHp > 0) {
        acts.style.display = 'grid';
        acts.innerHTML = myActive.moves.map((m, i) => `
            <button class="cbt-atk-btn ${m.category}" data-move="${i}">
                <div class="atk-name">${m.name}</div>
                <div class="atk-info">${m.power > 0 ? `⚡ ${m.power}` : '✨ Statut'} · ${m.category}</div>
            </button>`).join('');
        acts.querySelectorAll('.cbt-atk-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                socket.emit('play_turn', { moveIndex: btn.dataset.move });
                acts.style.display = 'none';
                document.getElementById('cbt-log').innerHTML = '⏳ En attente...';
            });
        });
    } else acts.style.display = 'none';
}

// ─── END MODAL ──────────────────────────────────────────────────────────────
function showEndModal(data) {
    const me = localStorage.getItem('username');
    const win = data.winner === me;
    const xp = data.xpStats?.[me];
    const coinsGained = data.xpStats?.[me]?.coinGain;

    document.getElementById('end-emoji').innerText = win ? '🏆' : '💀';
    const t = document.getElementById('end-title');
    t.innerText = win ? 'VICTOIRE !' : 'DÉFAITE';
    t.style.color = win ? '#f5c518' : '#e53935';
    document.getElementById('end-reason').innerText = data.reason || '';

    let html = '';
    if (xp) html += `<div class="reward-xp">+${xp.xpGain} XP${xp.leveledUp ? `<br>🎉 NIVEAU ${xp.newLevel} !` : ''}</div>`;
    if (coinsGained) html += `<div class="reward-coins">+${coinsGained} 🪙 pièces</div>`;
    if (win && data.boosterReward) {
        html += `<div class="reward-booster"><div class="rb-label">🎴 Booster gagné !</div><div class="rb-name">${em(data.boosterReward.name)} ${data.boosterReward.name}</div><div class="rb-hint">Quiz dans ta collection</div></div>`;
    }
    document.getElementById('end-rewards').innerHTML = html;
    document.getElementById('combat-screen').style.display = 'none';
    document.getElementById('end-modal').style.display = 'flex';
}

document.getElementById('end-close').addEventListener('click', () => {
    document.getElementById('end-modal').style.display = 'none';
    gameScreen.style.display = 'flex';
    loadInventory();
    goToTab(0);
});

// ─── BATTLE BUTTONS ─────────────────────────────────────────────────────────
document.getElementById('battle-btn').addEventListener('click', () => {
    if (playerLevel < 2) return showToast('🔒 Niveau 2 requis !', 'error');
    if (!socket) return showToast('Connexion impossible', 'error');
    if (myDeck.length < 3) return showToast('3 cartes requises !', 'error');
    document.getElementById('mm-overlay').style.display = 'flex';
    document.getElementById('mm-status').innerText = "Recherche d'un adversaire...";
    socket.emit('find_match');
});
document.getElementById('mm-cancel').addEventListener('click', () => {
    if (socket) socket.emit('cancel_match');
    document.getElementById('mm-overlay').style.display = 'none';
});
document.getElementById('surrender-btn').addEventListener('click', () => {
    if (!confirm(`Abandonner ? ${opponent} gagnera.`)) return;
    if (socket) socket.emit('surrender');
});