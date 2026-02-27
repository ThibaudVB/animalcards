/**
 * STATE.JS — Gestion de l'état global de l'application
 * Pattern simple de store réactif sans dépendances externes.
 * À l'étape suivante, on pourra brancher Socket.IO ici.
 */

// État central de l'application
const state = {
  currentUser: null,     // Objet user renvoyé par l'API
  currentView: "auth",  // "auth" | "dashboard" | "booster" | "inventory"
  lastDrawnCard: null,  // Carte obtenue lors du dernier booster
  isLoading: false,
  errorMessage: null,
};

// Liste des listeners par clé
const listeners = {};

/**
 * Met à jour l'état et notifie les listeners concernés.
 * @param {Partial<typeof state>} updates
 */
export function setState(updates) {
  Object.assign(state, updates);

  // Notifie les listeners pour chaque clé modifiée
  for (const key of Object.keys(updates)) {
    if (listeners[key]) {
      listeners[key].forEach((cb) => cb(state[key], state));
    }
  }

  // Listener "global" — pratique pour le re-render complet
  if (listeners["*"]) {
    listeners["*"].forEach((cb) => cb(state));
  }
}

/**
 * Lit l'état courant.
 * @returns {typeof state}
 */
export function getState() {
  return { ...state }; // Copie pour éviter les mutations directes
}

/**
 * Abonne une fonction à un changement d'état.
 * @param {string} key - Clé de l'état ou "*" pour tout écouter
 * @param {Function} callback
 */
export function subscribe(key, callback) {
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(callback);

  // Retourne une fonction de désinscription
  return () => {
    listeners[key] = listeners[key].filter((cb) => cb !== callback);
  };
}
