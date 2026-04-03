import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff } from "react-icons/fi";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        navigate("/login");
      } else {
        setError(data.error || "Signup failed");
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

          <h1 className="text-4xl font-bold mb-2">Sign up</h1>

          <p className="text-sm text-gray-300 mb-6">
            Already have an account?{" "}
            <Link to="/login" className="underline text-blue-300">
              Login
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

            {/* USERNAME */}
            <div>
              <label className="text-sm text-gray-300">Username</label>
              <input
                type="text"
                placeholder="yourusername"
                className="w-full mt-1 p-3 rounded-lg bg-white text-black focus:outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {/* PASSWORD (FIXED LIKE LOGIN) */}
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

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-500 transition duration-200"
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
            </div>

            {/* SIGNUP BUTTON */}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 transition py-3 rounded-lg font-semibold shadow-lg"
            >
              Sign up
            </button>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            

          </form>
        </div>

        {/* RIGHT SIDE (MATCHED WITH LOGIN) */}
        <div className="w-1/2 bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f172a] flex items-center justify-center p-6 overflow-hidden relative">

          {/* Glow Effect */}
          <div className="absolute w-80 h-80 bg-blue-500/20 blur-3xl rounded-full"></div>

          {/* GIF CONTAINER */}
          <div className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center">
            <img
              src="/security.gif"
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