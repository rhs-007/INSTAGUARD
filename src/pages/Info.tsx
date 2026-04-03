import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import logo from "../assets/logo2.png"; // ✅ import your logo

export default function Info() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f172a] text-white overflow-hidden">

      {/* HERO SECTION */}
      <div className="flex flex-col items-center justify-center text-center py-20 px-6">

        {/* ✅ LOGO + TITLE */}
        <motion.h1
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex items-center justify-center gap-3 text-5xl font-bold mb-6"
        >
          <img
            src={logo}
            alt="INSTAGUARD Logo"
            className="w-12 h-12 object-contain drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]"
          />
          INSTAGUARD
        </motion.h1>

        {/* SUBTEXT */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-lg text-gray-300 max-w-xl"
        >
          Protect your digital presence with AI-powered security.
          Detect threats, monitor activities, and stay safe in real-time.
        </motion.p>

        {/* BUTTONS */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex gap-4 mt-8"
        >
          <button
            onClick={() => navigate("/login")}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold shadow-lg"
          >
            Get Started
          </button>

          <button
            onClick={() => navigate("/signup")}
            className="border border-gray-400 px-6 py-3 rounded-lg hover:bg-white hover:text-black transition"
          >
            Create Account
          </button>
        </motion.div>
      </div>

      {/* FEATURES SECTION */}
      <div className="grid md:grid-cols-3 gap-8 px-10 py-16">

        {[
          {
            icon: "📸",
            title: "Screenshot Deterrence",
            desc: "Prevents unauthorized screenshots of sensitive content and alerts users instantly.",
          },
          {
            icon: "⏳",
            title: "Hold & Wait Protection",
            desc: "Users must hold to view protected images, preventing quick captures and misuse.",
          },
          {
            icon: "🚫",
            title: "Nudity Detection in DMs",
            desc: "AI filters and blocks inappropriate or explicit content in direct messages.",
          },
          {
            icon: "🛡️",
            title: "Admin Monitoring",
            desc: "Admins actively monitor illegal or suspicious activities in real-time.",
          },
          {
            icon: "🚷",
            title: "User Ban Control",
            desc: "Admins have full authority to block or ban users violating platform policies.",
          },
          {
            icon: "⚡",
            title: "Real-time Threat Alerts",
            desc: "Instant alerts notify users about suspicious actions and security risks.",
          },
        ].map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.05 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white/10 backdrop-blur-lg p-6 rounded-xl shadow-lg text-center hover:shadow-blue-500/20"
          >
            <div className="text-4xl mb-4">{item.icon}</div>
            <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
            <p className="text-gray-300 text-sm">{item.desc}</p>
          </motion.div>
        ))}

      </div>

      {/* BENEFITS SECTION */}
      <div className="text-center py-16 px-6">

        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="text-3xl font-bold mb-10"
        >
          Why Choose INSTAGUARD?
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-6">

          {[
            "⚡ Fast threat detection",
            "🔐 Strong data protection",
            "📊 Smart analytics",
            "🌐 Works on all devices",
            "🧠 AI-powered insights",
            "🚀 Easy to use interface",
          ].map((text, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className="bg-white/10 p-4 rounded-lg"
            >
              {text}
            </motion.div>
          ))}

        </div>
      </div>

      {/* CTA SECTION */}
      <div className="text-center pb-20">

        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="text-2xl mb-6"
        >
          Ready to secure your account?
        </motion.h2>

        <button
          onClick={() => navigate("/login")}
          className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-semibold shadow-lg"
        >
          Go to Login
        </button>

      </div>

    </div>
  );
}