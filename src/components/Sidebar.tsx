import {
  Home,
  Search,
  MessageCircle,
  PlusSquare,
  LogOut,
  ShieldCheck,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import logo from "../assets/logo.jpg";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  badge?: number;
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const [messageBadge] = useState(3);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [
      { icon: Home, label: "Home", path: "/feed" },
      { icon: Search, label: "Search", path: "/search" },
      {
        icon: MessageCircle,
        label: "Messages",
        path: "/direct/inbox",
        badge: messageBadge,
      },
      { icon: PlusSquare, label: "Create", path: "/create" },
    ];

    if (user?.role === "ADMIN") {
      items.push({ icon: ShieldCheck, label: "Admin", path: "/admin" });
    }

    return items;
  }, [messageBadge, user?.role]);

  const sidebarWidth = collapsed ? "w-20" : "w-64";

  const itemBase =
    "group relative flex items-center rounded-2xl transition-all duration-300";
  const itemSpacing = collapsed
    ? "justify-center px-3 py-3.5"
    : "gap-4 px-4 py-3.5";

  const isProfileActive = location.pathname.includes("/profile");

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => navigate("/create")}
        className="fixed bottom-6 right-6 z-[999] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-2xl md:hidden"
        type="button"
        title="Create Post"
      >
        <PlusSquare size={24} />
      </motion.button>

      <motion.aside
        layout
        transition={{ duration: 0.28, ease: "easeInOut" }}
        className={`fixed left-0 top-0 hidden h-screen ${sidebarWidth} flex-col border-r border-gray-200/70 bg-white/88 p-4 shadow-2xl backdrop-blur-2xl dark:border-gray-800/80 dark:bg-[#0b0f19]/92 md:flex`}
      >
        <div className="mb-6 flex items-start justify-between gap-2">
          <AnimatePresence mode="wait">
            {!collapsed ? (
              <motion.div
                key="expanded-brand"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-3 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => navigate("/feed")}
                  className="shrink-0 focus:outline-none"
                  title="Go to Feed"
                >
                  <img
                    src={logo}
                    alt="InstaGuard"
                    className="h-16 w-16 rounded-3xl object-cover shadow-md"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/feed")}
                  className="cursor-pointer bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-2xl font-black tracking-tight text-transparent focus:outline-none"
                  title="Go to Feed"
                >
                  InstaGuard
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="collapsed-brand"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                type="button"
                onClick={() => navigate("/feed")}
                className="mx-auto focus:outline-none"
                title="Go to Feed"
              >
                <img
                  src={logo}
                  alt="InstaGuard"
                  className="h-16 w-16 rounded-3xl object-cover shadow-md"
                />
              </motion.button>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <div
          className={`mb-6 flex ${
            collapsed ? "flex-col items-center gap-3" : "items-center gap-3"
          }`}
        >
          <button
            type="button"
            onClick={() => navigate("/create")}
            title="Create Post"
            className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-lg transition-all duration-300 hover:scale-[1.03] ${
              collapsed ? "h-11 w-11" : "h-11 flex-1 gap-2 px-4"
            }`}
          >
            <PlusSquare size={18} />
            {!collapsed && <span className="font-semibold">Create</span>}
          </button>
        </div>

        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;

            return (
              <motion.div
                key={item.label}
                whileHover={{ x: collapsed ? 0 : 3 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link
                  to={item.path}
                  title={collapsed ? item.label : ""}
                  className={`${itemBase} ${itemSpacing} ${
                    isActive
                      ? "scale-[1.01] bg-gradient-to-r from-indigo-50 to-pink-50 font-bold text-black shadow-md dark:from-indigo-900/40 dark:to-pink-900/30 dark:text-white"
                      : "text-gray-800 hover:bg-gray-100/90 dark:text-gray-200 dark:hover:bg-gray-800/90"
                  }`}
                >
                  <div className="relative">
                    <item.icon
                      size={24}
                      className={`transition-transform duration-300 ${
                        isActive ? "scale-110" : "group-hover:scale-110"
                      }`}
                    />
                    {item.badge && item.badge > 0 && (
                      <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-red-500 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  {!collapsed && (
                    <>
                      <span className="text-lg">{item.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="active-pill"
                          className="ml-auto h-2.5 w-2.5 rounded-full bg-gradient-to-r from-pink-500 to-indigo-500"
                        />
                      )}
                    </>
                  )}

                  {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block dark:bg-gray-100 dark:text-gray-900">
                      {item.label}
                    </span>
                  )}
                </Link>
              </motion.div>
            );
          })}

          <motion.div whileHover={{ x: collapsed ? 0 : 3 }} whileTap={{ scale: 0.98 }}>
            <button
              type="button"
              onClick={() => navigate(`/profile/${user?.username}`)}
              title={collapsed ? "Profile" : ""}
              className={`${itemBase} ${itemSpacing} w-full ${
                isProfileActive
                  ? "scale-[1.01] bg-gradient-to-r from-indigo-50 to-pink-50 font-bold text-black shadow-md dark:from-indigo-900/40 dark:to-pink-900/30 dark:text-white"
                  : "text-gray-800 hover:bg-gray-100/90 dark:text-gray-200 dark:hover:bg-gray-800/90"
              }`}
            >
              {user?.avatarUrl ? (
                <div className="rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px] shadow-sm">
                  <div className="rounded-full bg-white p-[2px] dark:bg-gray-900">
                    <img
                      src={user.avatarUrl}
                      alt="profile"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px] shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-gray-900">
                    <UserIcon
                      size={16}
                      className="transition-transform group-hover:scale-110"
                    />
                  </div>
                </div>
              )}

              {!collapsed && (
                <>
                  <span className="text-lg">Profile</span>
                  {isProfileActive && (
                    <motion.div
                      layoutId="active-pill"
                      className="ml-auto h-2.5 w-2.5 rounded-full bg-gradient-to-r from-pink-500 to-indigo-500"
                    />
                  )}
                </>
              )}

              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block dark:bg-gray-100 dark:text-gray-900">
                  Profile
                </span>
              )}
            </button>
          </motion.div>
        </nav>

        <div className="relative mt-4" ref={profileMenuRef}>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            className={`flex w-full items-center rounded-2xl border border-gray-200 bg-white/80 p-3 shadow-sm transition-all duration-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/80 dark:hover:bg-gray-900 ${
              collapsed ? "justify-center" : "gap-3"
            }`}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username || "user"}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <UserIcon size={18} />
              </div>
            )}

            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                    {user?.username || "User"}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {user?.role === "ADMIN" ? "Administrator" : "Member"}
                  </p>
                </div>

                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              </>
            )}
          </motion.button>

          <AnimatePresence>
            {profileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className={`absolute bottom-[calc(100%+12px)] z-50 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#111827] ${
                  collapsed ? "left-20 w-56" : "left-0 w-full"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/profile/${user?.username}`);
                    setProfileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <UserIcon size={17} />
                  My Profile
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigate(`/profile/${user?.username}`);
                    setProfileMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Settings size={17} />
                  Edit Profile
                </button>

                <div className="mx-3 h-px bg-gray-200 dark:bg-gray-800" />

                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <LogOut size={17} />
                  Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
}