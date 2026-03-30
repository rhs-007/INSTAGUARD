import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Post from "../components/Post";

export default function Feed() {
  const navigate = useNavigate();

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearSessionAndRedirect = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setPosts([]);
    setLoading(false);
    setSessionExpired(true);
  };

  const fetchPosts = async () => {
    try {
      const token = localStorage.getItem("accessToken");

      if (!token) {
        clearSessionAndRedirect();
        return;
      }

      const res = await fetch("/api/posts", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        clearSessionAndRedirect();
        return;
      }

      if (!res.ok) {
        console.error("Failed to fetch posts:", res.status, data);
        setPosts([]);
        return;
      }

      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch posts error:", err);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleLike = async (postId: string) => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      clearSessionAndRedirect();
      throw new Error("Session expired");
    }

    const res = await fetch(`/api/posts/${postId}/like`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || res.status === 403) {
      clearSessionAndRedirect();
      throw new Error("Session expired");
    }

    if (!res.ok) {
      console.error("Like failed:", res.status, data);
      throw new Error(data?.error || "Like failed");
    }

    setPosts((prevPosts) =>
      prevPosts.map((p) => (p.id === postId ? data.post : p))
    );

    return data;
  };

  const handleCommentAdded = (postId: string, newComment: any) => {
    setPosts((prevPosts) =>
      prevPosts.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: [
                ...(Array.isArray(p.comments) ? p.comments : []),
                newComment,
              ],
            }
          : p
      )
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-gray-800">Loading feed...</p>
          <p className="mt-2 text-sm text-gray-500">
            Please wait while posts are loading.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {sessionExpired && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h2 className="mb-3 text-2xl font-bold text-red-500">
              Session Expired
            </h2>
            <p className="mb-6 text-gray-600">
              For your privacy, your session has expired. Please log in again to
              continue.
            </p>

            <button
              onClick={() => navigate("/login")}
              className="w-full rounded-xl bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600"
              type="button"
            >
              Go to Login
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-8">
        {posts.length === 0 && !sessionExpired ? (
          <div className="mt-20 rounded-3xl border border-dashed border-gray-300 bg-white/70 px-6 py-12 text-center shadow-sm backdrop-blur-sm">
            <p className="text-xl font-semibold text-gray-700">No posts yet</p>
            <p className="mt-2 text-sm text-gray-500">
              Create a post to see content here.
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <Post
              key={post.id}
              post={post}
              onLike={handleLike}
              onCommentAdded={handleCommentAdded}
            />
          ))
        )}
      </div>
    </>
  );
}