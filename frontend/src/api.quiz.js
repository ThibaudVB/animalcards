/**
 * API/QUIZ.JS — Appels HTTP pour le système de Quiz
 * Ajout dans api.js existant (à importer dans main.js)
 */

const BASE_URL = "http://localhost:3000/api";

import { Auth } from "./api.js";

async function apiCall(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}

// Récupère les questions du quiz (sans les réponses)
export async function fetchQuiz(cardId) {
  return apiCall(`/quiz/${cardId}`);
}

// Soumet une réponse
export async function submitAnswer(cardId, questionId, answerIndex, isLastQuestion) {
  return apiCall(`/quiz/${cardId}/answer`, {
    method: "POST",
    body: JSON.stringify({ questionId, answerIndex, isLastQuestion }),
  });
}

// Achète un indice
export async function buyHint(cardId, questionId, hintLevel) {
  return apiCall(`/quiz/${cardId}/hint`, {
    method: "POST",
    body: JSON.stringify({ questionId, hintLevel }),
  });
}
