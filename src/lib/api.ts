import axios from "axios";

const api = axios.create({
  baseURL: "https://skilio-customer-test.onrender.com/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: false, // tokens handled via js-cookie
});

export default api;
