// -- Éléments du DOM --
const authCard = document.getElementById('auth-card');
const gameContainer = document.getElementById('game-container');
const formTitle = document.getElementById('form-title');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const toggleLink = document.getElementById('toggle-link');
const logoutBtn = document.getElementById('logout-btn');
const inventoryContainer = document.getElementById('inventory');
const openBoosterBtn = document.getElementById('open-booster-btn');

let isLogin = true;

// -- Bascule Login / Register --
toggleLink.addEventListener('click', () => {
    isLogin = !isLogin;
    formTitle.innerText = isLogin ? 'Login' : 'Register';
    submitBtn.innerText = isLogin ? 'Login' : 'Register';
    toggleLink.innerText = isLogin ? "Don't have an account? Register" : "Already have an account? Login";
    errorMsg.innerText = '';
});

// -- Gérer l'authentification --
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

// -- Déconnexion --
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    showAuthScreen();
});

// -- Affichage des écrans --
function showAuthScreen() {
    authCard.style.display = 'block';
    gameContainer.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
}

function showGameScreen() {
    authCard.style.display = 'none';
    gameContainer.style.display = 'flex';
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
            alert(`📦 WOUAH ! Tu as obtenu la carte : ${data.card.name} ! Mais attention, elle est bloquée... Réponds au quiz pour l'utiliser !`);
            loadInventory(); // On recharge les cartes
        } else {
            alert(data.error); 
        }
    } catch (err) {
        console.error("Erreur d'ouverture du booster", err);
    }
});

// -- Fonction de ton inventaire (UNE SEULE FOIS !) --
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
            
            // On gère les 3 états
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
                <h3>${card.name}</h3>
                <p style="color: gray; margin-top: -10px;"><em>${card.type}</em></p>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p><strong>HP: ${card.hp}</strong> 🗡️ Atk: ${card.attack}</p>
                <p style="font-size: 0.8em; color: #555; margin-top: 10px;">${card.description}</p>
            </div>
            `;
        }).join('');

        // Ajout des événements de clic sur les cartes
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
                            headers: { 
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ cardId: clickedCard.id })
                        });
                        alert("✅ Bonne réponse ! La carte est débloquée et prête à combattre !");
                        loadInventory(); // On met à jour l'affichage
                    }
                
                } else if (clickedCard.status === 'unlocked') {
                    console.log(`⚔️ Tu as sélectionné la carte prête au combat : ${clickedCard.name}`);
                }
            });
        });

    } catch (error) {
        console.error("Erreur de chargement de l'inventaire:", error);
        inventoryContainer.innerHTML = `<p style="color: red;">Erreur : ${error.message}</p>`;
    }
}

// --- SYSTÈME D'AMIS ---
const friendInput = document.getElementById('friend-input');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendsList = document.getElementById('friends-list');
const friendRequestsList = document.getElementById('friend-requests-list');

// 1. Envoyer une demande
addFriendBtn.addEventListener('click', async () => {
    const targetUsername = friendInput.value.trim();
    if (!targetUsername) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/friends/request', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetUsername })
        });
        
        const data = await response.json();
        alert(data.message || data.error);
        friendInput.value = '';
    } catch (err) {
        console.error(err);
    }
});

// 2. Charger les amis et les requêtes
async function loadFriends() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/friends', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        const data = await response.json();

        // Afficher les amis
        if (data.friends.length === 0) {
            friendsList.innerHTML = "Aucun ami pour le moment.";
        } else {
            friendsList.innerHTML = data.friends.map(f => 
                `<div style="padding: 5px; border-bottom: 1px solid #eee;">🟢 ${f}</div>`
            ).join('');
        }

        // Afficher les demandes en attente
        if (data.requests.length === 0) {
            friendRequestsList.innerHTML = "Aucune demande.";
        } else {
            friendRequestsList.innerHTML = data.requests.map(req => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #eee;">
                    <span>${req}</span>
                    <button onclick="acceptFriend('${req}')" style="background: #3498db; color: white; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Accepter</button>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error("Erreur chargement amis", err);
    }
}

// 3. Accepter un ami (Attaché à window comme pour les alertes)
window.acceptFriend = async function(senderUsername) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/friends/accept', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ senderUsername })
        });
        
        const data = await response.json();
        alert(data.message || data.error);
        loadFriends(); // On rafraîchit la liste
    } catch (err) {
        console.error(err);
    }
};

// -- Vérification auto au chargement de la page --
if (localStorage.getItem('token')) {
    showGameScreen();
} else {
    showAuthScreen();
}
