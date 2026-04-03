import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { FiEye, FiEyeOff } from "react-icons/fi";

import securityGif from "../assets/security.gif";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        login(data.user, data.accessToken, data.refreshToken);
        navigate("/");
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Something went wrong");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f172a] p-6">
      <div className="w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl flex">

        {/* LEFT SIDE */}
        <div className="w-1/2 bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f172a] text-white p-10 flex flex-col justify-center">

          <h1 className="text-4xl font-bold mb-2">Sign in</h1>

          <p className="text-sm text-gray-300 mb-6">
            Don’t have an account?{" "}
            <Link to="/signup" className="underline text-blue-300">
              Create now
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* EMAIL */}
            <div>
              <label className="text-sm text-gray-300">Email</label>
              <input
                type="email"
                placeholder="example@gmail.com"
                className="w-full mt-1 p-3 rounded-lg bg-white text-black focus:outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* PASSWORD (FIXED STRUCTURE) */}
            <div>
              <label className="text-sm text-gray-300">Password</label>

              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••"
                  className="w-full p-3 pr-10 rounded-lg bg-white text-black focus:outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                {/* PERFECT ICON POSITION */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-500 transition duration-200"
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
            </div>

            {/* LOGIN BUTTON */}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 transition py-3 rounded-lg font-semibold shadow-lg"
            >
              Sign in
            </button>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

          </form>
        </div>

        {/* RIGHT SIDE */}
        <div className="w-1/2 bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f172a] flex items-center justify-center p-6 overflow-hidden relative">

          {/* Glow Effect */}
          <div className="absolute w-80 h-80 bg-blue-500/20 blur-3xl rounded-full"></div>

          {/* GIF CONTAINER */}
          <div className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center">
            <img
              src={securityGif}
              alt="secure animation"
              className="w-full h-full object-cover 
                         opacity-90 
                         mix-blend-lighten 
                         rounded-xl
                         transition duration-500 hover:scale-105"
            />
          </div>
        </div>

      </div>
    </div>
  );
}