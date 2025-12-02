import React, { useState } from "react";
import Cookies from "js-cookie";
import api from "../lib/api";

const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({
    credential: "",
    pin: "",
  });

  const [errors, setErrors] = useState({
    credential: "",
    pin: "",
    api: "",
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = {
      credential: formData.credential ? "" : "Credential is required",
      pin: /^\d{4}$/.test(formData.pin) ? "" : "PIN must be 4 digits",
      api: "",
    };

    setErrors(newErrors);

    if (newErrors.credential || newErrors.pin) return;

    try {
      setLoading(true);

      const res = await api.post("/profile/login", {
        credential: formData.credential,
        pin: formData.pin,
      });

      const { accessToken, refreshToken, profile } = res.data.data;

      // ✅ Store tokens securely
      Cookies.set("accessToken", accessToken, {
        expires: 1, // 1 day
        sameSite: "strict",
        secure: true,
      });

      Cookies.set("refreshToken", refreshToken, {
        expires: 30, // 30 days
        sameSite: "strict",
        secure: true,
      });

      // Optional (non-sensitive) data
      Cookies.set("profileId", profile.id);
      Cookies.set("nickName", profile.nickName);

      // ✅ Redirect after login
      window.location.href = "/call";

    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        api:
          err?.response?.data?.message ||
          "Login failed. Please try again.",
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username / ID
            </label>
            <input
              name="credential"
              value={formData.credential}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username or ID"
            />
            {errors.credential && (
              <p className="mt-1 text-sm text-red-600">
                {errors.credential}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PIN
            </label>
            <input
              type="password"
              name="pin"
              value={formData.pin}
              onChange={handleChange}
              maxLength={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500"
              placeholder="4-digit PIN"
            />
            {errors.pin && (
              <p className="mt-1 text-sm text-red-600">{errors.pin}</p>
            )}
          </div>

          {errors.api && (
            <p className="text-sm text-red-600 text-center">
              {errors.api}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
