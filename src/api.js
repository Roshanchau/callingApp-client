// src/api.js
import axios from "axios";

export const API_BASE = "http://localhost:3000/api/v1/call"; // change to your API base

function getAuthToken() {
  // token here
  return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9maWxlSWQiOiI0MmExNDE1Yi0xYWIwLTRmZjgtODI2Zi1kNWQ2YzE2M2RjMzQiLCJuaWNrTmFtZSI6ImRvZTgiLCJtb2JpbGVOdW1iZXIiOiIrOTE5ODc2NTQzMTI4IiwiaWF0IjoxNzY0MjIzMzQxLCJleHAiOjE3NjQyMjY5NDF9.KhjcJNEBgMcgr6M8dFXWK-rP07qaoFNLE2ORqGG88-o";
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
