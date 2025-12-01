// src/api.js
import axios from "axios";

export const API_BASE = "https://skilio-customer-test.onrender.com/api/v1/call"; // change to your API base

function getAuthToken() {
  // token here
  return "";
}

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((cfg) => {
  const token = getAuthToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export default api;
