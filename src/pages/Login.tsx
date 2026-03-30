import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/outro.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [spot, setSpot] = useState({ x: 50, y: 50 });

  const { login } = useAuth();
  const navigate = useNavigate();

  const particles = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        size: 6 + Math.random() * 16,
        left: Math.random() * 100,
        top: Math.random() * 100,
        dur: 6 + Math.random() * 10,
        delay: Math.random() * 6,
      })),
    []
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setSpot({ x, y });

      const dx = e.clientX / window.innerWidth - 0.5;
      const dy = e.clientY / window.innerHeight - 0.5;
      setTilt({ rx: -(dy * 10), ry: dx * 12 });
    };

    const onLeave = () => {
      setTilt({ rx: 0, ry: 0 });
      setSpot({ x: 50, y: 50 });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

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
    } catch (err) {
      setError("Something went wrong");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 animate-gradient" />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${spot.x}% ${spot.y}%, rgba(255,255,255,0.28), rgba(255,255,255,0) 45%)`,
        }}
      />

      <div className="absolute w-80 h-80 bg-white/20 rounded-full blur-3xl top-10 left-10 animate-float" />
      <div className="absolute w-80 h-80 bg-white/20 rounded-full blur-3xl bottom-10 right-10 animate-float-delay" />

      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full bg-white/25 blur-sm animate-particle"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: `${p.left}%`,
            top: `${p.top}%`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen">
        <div
          className="w-full max-w-sm bg-white/80 backdrop-blur-xl border border-white/30 p-8 rounded-2xl shadow-2xl mb-4 transition-transform duration-200"
          style={{
            transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          }}
        >
          <div className="flex flex-col items-center mb-6">
            <img
              src={logo}
              alt="InstaGuard logo"
              className="w-16 h-16 rounded-2xl shadow-lg mb-3 object-cover"
            />
            <h1 className="text-4xl font-serif italic text-center select-none">
              InstaGuard
            </h1>
            <p className="text-gray-600 font-semibold text-center mt-2 text-sm">
              Log in to continue your secure social experience.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              className="w-full bg-gray-50/90 border border-gray-300 rounded-sm p-2 text-xs focus:outline-none focus:border-gray-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full bg-gray-50/90 border border-gray-300 rounded-sm p-2 pr-10 text-xs focus:outline-none focus:border-gray-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 text-sm focus:outline-none hover:scale-110 transition-transform"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-semibold py-1.5 rounded-lg text-sm hover:bg-blue-700 active:scale-[0.99] transition"
            >
              Log In
            </button>
          </form>

          {error && (
            <p className="text-red-600 text-xs text-center mt-4">{error}</p>
          )}

          <div className="flex items-center my-6">
            <div className="flex-1 h-px bg-gray-300" />
            <span className="px-4 text-gray-500 text-xs font-semibold">OR</span>
            <div className="flex-1 h-px bg-gray-300" />
          </div>

          <p className="text-center text-blue-950 text-xs cursor-pointer hover:underline">
            Forgot password?
          </p>
        </div>

        <div className="w-full max-w-sm bg-white/80 backdrop-blur-xl border border-white/30 p-6 rounded-2xl shadow-2xl text-center">
          <p className="text-sm">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-blue-700 font-semibold hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 10s ease infinite;
        }

        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-24px); }
          100% { transform: translateY(0px); }
        }

        .animate-float {
          animation: float 7s ease-in-out infinite;
        }

        .animate-float-delay {
          animation: float 9s ease-in-out infinite;
        }

        @keyframes particle {
          0% { transform: translateY(0px); opacity: 0.35; }
          50% { transform: translateY(-40px); opacity: 0.15; }
          100% { transform: translateY(0px); opacity: 0.35; }
        }

        .animate-particle {
          animation-name: particle;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  );
}