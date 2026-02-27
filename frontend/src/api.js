/**
 * API.JS — Client HTTP vers le backend
 * Centralise tous les appels fetch.
 * Gère automatiquement le token JWT dans les headers.
 */

const BASE_URL = "http://localhost:3000/api";

// --- Gestion du token JWT ---
export const Auth = {
  getToken: () => localStorage.getItem("ac_token"),
  setToken: (token) => localStorage.setItem("ac_token", token),
  removeToken: () => localStorage.removeItem("ac_token"),
  isLoggedIn: () => !!localStorage.getItem("ac_token"),
};

// --- Helper fetch avec auth automatique ---
async function apiCall(endpoint, options = {}) {
  const token = Auth.getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    // On propage l'erreur avec le message serveur
    throw new Error(data.error || `Erreur HTTP ${response.status}`);
  }

  return data;
}

// --- Endpoints Auth ---
export async function register(username, password) {
  const data = await apiCall("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  Auth.setToken(data.token);
  return data;
}

export async function login(username, password) {
  const data = await apiCall("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  Auth.setToken(data.token);
  return data;
}

export function logout() {
  Auth.removeToken();
}

// --- Endpoints Booster ---
export async function openBooster() {
  return apiCall("/booster/open", { method: "POST" });
}

export async function getInventory() {
  return apiCall("/booster/inventory");
}
