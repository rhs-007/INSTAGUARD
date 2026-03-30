import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { User as UserIcon, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

type ProfilePost = {
  id: string;
  imageUrl: string;
  isProtected?: boolean;
  caption?: string | null;
  createdAt?: string;
};

type ProfileUser = {
  id: string;
  username: string;
  bio?: string | null;
  avatarUrl?: string | null;
  posts?: ProfilePost[];
  counts?: { posts: number };
};

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`,
});

function PostItem({
  post,
  openPost,
}: {
  post: ProfilePost;
  openPost: (post: ProfilePost) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  const handleHoldStart = () => {
    if (post.isProtected) {
      setRevealed(true);
    }
  };

  const handleHoldEnd = () => {
    if (post.isProtected) {
      setRevealed(false);
    }
  };

  return (
    <div
      className="aspect-square bg-gray-100 relative group cursor-pointer overflow-hidden"
      onMouseDown={handleHoldStart}
      onMouseUp={handleHoldEnd}
      onMouseLeave={handleHoldEnd}
      onTouchStart={handleHoldStart}
      onTouchEnd={handleHoldEnd}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (!post.isProtected) {
          openPost(post);
        }
      }}
    >
      <img
        src={post.imageUrl}
        alt=""
        draggable={false}
        className={`w-full h-full object-cover transition-all duration-300 ${
          post.isProtected && !revealed ? "blur-xl scale-105 select-none" : ""
        }`}
        style={{ userSelect: "none" }}
        onDragStart={(e) => e.preventDefault()}
      />

      {post.isProtected && !revealed && (
        <div className="absolute inset-0 flex items-center justify-center text-white font-semibold bg-black/30 text-sm">
          Hold to View
        </div>
      )}

      {post.isProtected && revealed && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white bg-black/60 px-2 py-1 rounded">
          Release to Hide
        </div>
      )}

      {!post.isProtected && (
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold">
          View Post
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();

  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editBio, setEditBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [selectedPost, setSelectedPost] = useState<ProfilePost | null>(null);
  const [showProfileImage, setShowProfileImage] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [username]);

  const fetchUser = async () => {
    if (!username) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
        headers: authHeader(),
      });

      if (!res.ok) {
        setUser(null);
        return;
      }

      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error(err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const isMe = useMemo(() => {
    return currentUser?.username === user?.username;
  }, [currentUser?.username, user?.username]);

  const openEdit = () => {
    if (!isMe || !user) return;
    setEditError(null);
    setEditBio(user.bio || "");
    setAvatarFile(null);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditError(null);
  };

  const saveProfile = async () => {
    setEditError(null);
    setSaving(true);

    try {
      let avatarBase64: string | null = null;

      if (avatarFile) {
        avatarBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(avatarFile);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
      }

      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`,
        },
        body: JSON.stringify({
          bio: editBio,
          avatarBase64,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditError(data?.error || "Failed to save profile");
        return;
      }

      setUser((prev) =>
        prev
          ? {
              ...prev,
              bio: data.bio,
              avatarUrl: data.avatarUrl,
            }
          : prev
      );

      closeEdit();
    } catch (err) {
      console.error(err);
      setEditError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const openPost = (post: ProfilePost) => {
    setSelectedPost(post);
  };

  const closePost = () => {
    setSelectedPost(null);
  };

  const openProfileImage = () => {
    if (!user?.avatarUrl) return;
    setShowProfileImage(true);
  };

  const closeProfileImage = () => {
    setShowProfileImage(false);
  };

  if (loading) return <div className="p-10 text-center">Loading profile...</div>;
  if (!user) return <div className="p-10 text-center">User not found</div>;

  const posts = user.posts ?? [];
  const postsCount = user.counts?.posts ?? posts.length;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {editOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Edit Profile</div>
              <button
                className="p-2 rounded-full hover:bg-gray-100"
                onClick={closeEdit}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden">
                  {avatarFile ? (
                    <img
                      src={URL.createObjectURL(avatarFile)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <UserIcon size={28} />
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setAvatarFile(e.target.files[0]);
                    }
                  }}
                  className="text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">Bio</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Write something about you..."
                  className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none min-h-[90px]"
                />
              </div>

              {editError && (
                <div className="text-sm text-red-500">{editError}</div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProfile}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfileImage && user.avatarUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeProfileImage();
          }}
        >
          <div className="relative max-w-3xl w-full flex items-center justify-center">
            <button
              onClick={closeProfileImage}
              className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white p-2 rounded-full shadow"
              type="button"
            >
              <X size={20} />
            </button>

            <img
              src={user.avatarUrl}
              alt={user.username}
              className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {selectedPost && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePost();
          }}
        >
          <div className="w-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <UserIcon size={20} />
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-semibold text-sm">{user.username}</p>
                  {user.bio && (
                    <p className="text-xs text-gray-500 truncate max-w-[240px]">
                      {user.bio}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={closePost}
                className="p-2 rounded-full hover:bg-gray-100"
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid md:grid-cols-[1fr_340px]">
              <div className="bg-black flex items-center justify-center max-h-[75vh]">
                <img
                  src={selectedPost.imageUrl}
                  alt={selectedPost.caption || "Post image"}
                  className="w-full h-full object-contain max-h-[75vh]"
                />
              </div>

              <div className="p-4 flex flex-col">
                <div className="flex items-center gap-3 pb-4 border-b">
                  <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <UserIcon size={20} />
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="font-semibold text-sm">{user.username}</p>
                    <p className="text-xs text-gray-500">Post preview</p>
                  </div>
                </div>

                <div className="pt-4 text-sm text-gray-700 whitespace-pre-wrap break-words flex-1">
                  {selectedPost.caption?.trim()
                    ? selectedPost.caption
                    : "No caption available."}
                </div>

                {selectedPost.isProtected && (
                  <div className="mt-4 rounded-xl bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-700">
                    This post is protected.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-20 mb-12">
        <div
          className={`w-32 h-32 md:w-40 md:h-40 rounded-full bg-gray-200 overflow-hidden border border-gray-200 ${
            user.avatarUrl ? "cursor-pointer" : ""
          }`}
          onClick={openProfileImage}
          title={user.avatarUrl ? "View profile picture" : ""}
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <UserIcon size={64} />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-6 text-center md:text-left">
          <div className="flex items-center gap-4 justify-center md:justify-start">
            <h2 className="text-xl font-light">{user.username}</h2>

            {isMe && (
              <button
                onClick={openEdit}
                className="bg-gray-100 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-200"
              >
                Edit Profile
              </button>
            )}
          </div>

          <div className="flex justify-center md:justify-start gap-10">
            <div className="text-sm">
              <span className="font-bold">{postsCount}</span> posts
            </div>
          </div>

          {user.bio && (
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {user.bio}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 md:gap-8">
        {posts.map((post) => (
          <PostItem key={post.id} post={post} openPost={openPost} />
        ))}
      </div>
    </div>
  );
}