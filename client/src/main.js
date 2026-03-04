// -- Éléments du DOM --
const authContainer = document.getElementById('auth-container');
const gameContainer = document.getElementById('game-container');
const formTitle = document.getElementById('form-title');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const toggleLink = document.getElementById('toggle-link');
const logoutBtn = document.getElementById('logout-btn');
const displayUsername = document.getElementById('display-username');

const inventoryContainer = document.getElementById('inventory');
const openBoosterBtn = document.getElementById('open-booster-btn');

// --- LOGIQUE DE NAVIGATION (SLIDER) ---
const navBtns = document.querySelectorAll('.nav-btn');
const slider = document.getElementById('slider');

// Fonction pour faire glisser vers un panel (0 = Boutique, 1 = Cartes, 2 = Combat, 3 = Social)
function goToTab(index) {
    slider.style.transform = `translateX(-${index * 100}vw)`;
    navBtns.forEach(btn => btn.classList.remove('active'));
    navBtns[index].classList.add('active');
}

navBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => goToTab(index));
});

// -- Gérer l'authentification --
let isLogin = true;

toggleLink.addEventListener('click', () => {
    isLogin = !isLogin;
    formTitle.innerText = isLogin ? 'Login' : 'Register';
    submitBtn.innerText = isLogin ? 'Connexion' : 'S\'inscrire';
    toggleLink.innerText = isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Connexion";
    errorMsg.innerText = '';
});

submitBtn.addEventListener('click', async () => {
    const username = usernameInput.value;
    const password = passwordInput.value;
    const endpoint = isLogin ? '/login' : '/register';

    try {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            showGameScreen();
        } else {
            errorMsg.innerText = data.error;
        }
    } catch (err) {
        errorMsg.innerText = "Erreur de connexion au serveur.";
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    showAuthScreen();
});

// -- Affichage des écrans --
function showAuthScreen() {
    authContainer.style.display = 'flex';
    gameContainer.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
}

function showGameScreen() {
    authContainer.style.display = 'none';
    gameContainer.style.display = 'flex';
    displayUsername.innerText = localStorage.getItem('username'); // Affiche le pseudo en haut
    
    // On centre la vue sur l'onglet 2 (Combat) par défaut !
    goToTab(2); 
    
    // On charge les données
    loadInventory(); 
    loadFriends();
}

// --- OUVRIR UN BOOSTER ---
openBoosterBtn.addEventListener('click', async () => {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/open-booster', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (response.ok) {
            alert(`📦 WOUAH ! Tu as obtenu : ${data.card.name} ! \nVa dans l'onglet Cartes pour la débloquer.`);
            loadInventory(); 
        } else {
            alert(data.error); 
        }
    } catch (err) {
        console.error("Erreur d'ouverture du booster", err);
    }
});

// -- INVENTAIRE --
async function loadInventory() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/inventory', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        const cards = await response.json();

        inventoryContainer.innerHTML = cards.map((card, index) => {
            const rarityClass = card.rarity ? card.rarity.toLowerCase() : 'commun';
            let statusClass = '';
            let centerIcon = '';
            
            if (card.status === 'locked') {
                statusClass = 'locked';
                centerIcon = '<div class="lock-icon">🔒</div>';
            } else if (card.status === 'pending') {
                statusClass = 'pending';
                centerIcon = '<div class="quiz-icon">❓</div>';
            }

            return `
            <div class="card ${rarityClass} ${statusClass}" data-index="${index}">
                ${centerIcon}
                <h3 style="color: #2d3436;">${card.name}</h3>
                <p style="color: #636e72; margin-top: -10px; font-size: 0.9em;"><em>${card.type}</em></p>
                <hr style="border: 0; border-top: 1px solid #b2bec3;">
                <p style="color: #2d3436; font-size: 0.9em;"><strong>HP: ${card.hp}</strong> Atk: ${card.attack}</p>
            </div>
            `;
        }).join('');

        const htmlCards = inventoryContainer.querySelectorAll('.card');
        htmlCards.forEach((htmlCard) => {
            htmlCard.addEventListener('click', async () => {
                const index = htmlCard.getAttribute('data-index');
                const clickedCard = cards[index];

                if (clickedCard.status === 'locked') {
                    alert(`🔒 Tu dois trouver la carte ${clickedCard.name} dans un booster d'abord !`);
                } else if (clickedCard.status === 'pending') {
                    const confirmQuiz = confirm(`❓ LANCEMENT DU QUIZ ! \n\nEs-tu sûr que la Terre est ronde pour débloquer ${clickedCard.name} ?`);
                    if (confirmQuiz) {
                        await fetch('http://localhost:3000/api/win-quiz', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cardId: clickedCard.id })
                        });
                        alert("✅ Bonne réponse ! Carte prête au combat.");
                        loadInventory();
                    }
                }
            });
        });
    } catch (error) {
        inventoryContainer.innerHTML = `<p style="color: #ff7675;">Erreur : ${error.message}</p>`;
    }
}

// --- SYSTÈME D'AMIS ---
const friendInput = document.getElementById('friend-input');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendsList = document.getElementById('friends-list');
const friendRequestsList = document.getElementById('friend-requests-list');

addFriendBtn.addEventListener('click', async () => {
    const targetUsername = friendInput.value.trim();
    if (!targetUsername) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/friends/request', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername })
        });
        const data = await response.json();
        alert(data.message || data.error);
        friendInput.value = '';
    } catch (err) {
        console.error(err);
    }
});

async function loadFriends() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/friends', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const data = await response.json();

        if (data.friends.length === 0) {
            friendsList.innerHTML = "Aucun ami pour le moment.";
        } else {
            friendsList.innerHTML = data.friends.map(f => `<div class="friend-row"><span>🟢 ${f}</span></div>`).join('');
        }

        if (data.requests.length === 0) {
            friendRequestsList.innerHTML = "Aucune demande.";
        } else {
            friendRequestsList.innerHTML = data.requests.map(req => `
                <div class="friend-row">
                    <span>${req}</span>
                    <button onclick="acceptFriend('${req}')">Accepter</button>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error("Erreur chargement amis", err);
    }
}

window.acceptFriend = async function(senderUsername) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/friends/accept', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderUsername })
        });
        const data = await response.json();
        alert(data.message || data.error);
        loadFriends(); 
    } catch (err) {
        console.error(err);
    }
};

// -- Démarrage --
if (localStorage.getItem('token')) { showGameScreen(); } 
else { showAuthScreen(); }