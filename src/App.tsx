import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Feed from "./pages/Feed";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Chat from "./pages/Chat";
import AdminDashboard from "./pages/AdminDashboard";
import Sidebar from "./components/Sidebar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { SocketProvider } from "./hooks/useSocket";
import Search from "./pages/Search";
import CreatePost from "./pages/CreatePost";
import InfoPage from "./pages/Info"; // ✅ correct import

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex bg-white min-h-screen">
      {user && <Sidebar />}

      <main className={`flex-1 ${user ? "md:ml-64" : ""}`}>
        <Routes>

          {/* ✅ FIRST PAGE (IMPORTANT CHANGE) */}
          <Route
            path="/"
            element={<InfoPage />}
          />

          {/* AUTH ROUTES */}
          <Route
            path="/login"
            element={!user ? <Login /> : <Navigate to="/feed" replace />}
          />
          <Route
            path="/signup"
            element={!user ? <Signup /> : <Navigate to="/feed" replace />}
          />

          {/* PROTECTED ROUTES */}
          <Route
            path="/feed"
            element={user ? <Feed /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/search"
            element={user ? <Search /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/create"
            element={user ? <CreatePost /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/profile/:username"
            element={user ? <Profile /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/direct/inbox"
            element={user ? <Chat /> : <Navigate to="/login" replace />}
          />

          {/* ADMIN */}
          <Route
            path="/admin"
            element={
              user?.role === "ADMIN" ? (
                <AdminDashboard />
              ) : (
                <Navigate to="/feed" replace />
              )
            }
          />

          {/* ✅ FALLBACK ROUTE */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <AppRoutes />
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
}