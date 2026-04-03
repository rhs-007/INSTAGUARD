import React, { useEffect, useMemo, useState } from "react";
import {
  Search as SearchIcon,
  UserPlus,
  UserCheck,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface SearchUser {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  isFollowing: boolean;
}

interface ExplorePost {
  id: string;
  imageUrl: string;
  caption?: string | null;
  isProtected: boolean;
  user: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
}

export default function Search() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [explorePosts, setExplorePosts] = useState<ExplorePost[]>([]);

  const [loading, setLoading] = useState(false);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null);

  const token = useMemo(() => localStorage.getItem("accessToken"), []);

  /* ---------------- USER SEARCH ---------------- */

  useEffect(() => {
    if (query.trim()) {
      const delay = setTimeout(() => {
        fetchUsers(query);
      }, 350);

      return () => clearTimeout(delay);
    } else {
      setUsers([]);
      fetchExplorePosts();
    }
  }, [query]);

  const fetchUsers = async (searchText: string) => {
    try {
      setLoading(true);

      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchText)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        setUsers([]);
        return;
      }

      const data = await res.json();

      const normalized: SearchUser[] = Array.isArray(data)
        ? data.map((u: any) => ({
            id: u.id,
            username: u.username,
            bio: u.bio ?? null,
            avatarUrl: u.avatarUrl ?? null,
            isFollowing: !!u.isFollowing,
          }))
        : [];

      setUsers(normalized);
    } catch (err) {
      console.error(err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- EXPLORE POSTS ---------------- */

  const fetchExplorePosts = async () => {
    try {
      setExploreLoading(true);

      const res = await fetch("/api/explore/posts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setExplorePosts([]);
        return;
      }

      const data = await res.json();
      setExplorePosts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setExplorePosts([]);
    } finally {
      setExploreLoading(false);
    }
  };

  /* ---------------- FOLLOW / UNFOLLOW ---------------- */

  const handleFollowToggle = async (
    targetUserId: string,
    isFollowing: boolean
  ) => {
    try {
      setFollowLoadingId(targetUserId);

      const endpoint = isFollowing
        ? `/api/users/${targetUserId}/unfollow`
        : `/api/users/${targetUserId}/follow`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) return;

      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUserId ? { ...u, isFollowing: !isFollowing } : u
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setFollowLoadingId(null);
    }
  };

  const getDisplayBio = (bio: string | null) => {
    if (!bio) return "No bio available";
    const trimmed = bio.trim();
    return trimmed.length > 0 ? trimmed : "No bio available";
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="page-enter min-h-screen md:ml-64 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* SEARCH CARD */}
        <div className="flex justify-center">
        <div className="soft-card p-6">

          <h1 className="text-2xl font-bold mb-6">Search</h1>

          {/* SEARCH INPUT */}
          <div className="relative mb-6">
            

            <input
              type="text"
              placeholder="Search users...🔍"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-modern pl-12"
            />
            
          </div>

          {/* ---------------- USER SEARCH RESULTS ---------------- */}

          {query.trim() ? (
            <>
              {loading && (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Loader2 className="animate-spin mr-2" size={20} />
                  Searching users...
                </div>
              )}

              {!loading && users.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                  No users found
                </div>
              )}

              <div className="space-y-3">
                {!loading &&
                  users.map((u) => {
                    const isOwnProfile = u.id === user?.id;
                    const isFollowLoading = followLoadingId === u.id;

                    return (
                      <div
                        key={u.id}
                        className="soft-card hover-lift flex items-center justify-between gap-4 p-4"
                      >
                        {/* USER INFO */}
                        <div
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                          onClick={() => navigate(`/profile/${u.username}`)}
                        >
                          <img
                            src={
                              u.avatarUrl ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                u.username
                              )}&background=random`
                            }
                            alt={u.username}
                            className="w-12 h-12 rounded-full object-cover border"
                          />

                          <div className="min-w-0">
                            <p className="font-semibold truncate">
                              {u.username}
                            </p>

                            <p className="text-sm text-gray-500 truncate">
                              {getDisplayBio(u.bio)}
                            </p>
                          </div>
                        </div>

                        {/* FOLLOW BUTTON */}
                        {!isOwnProfile && (
                          <button
                            onClick={() =>
                              handleFollowToggle(u.id, u.isFollowing)
                            }
                            disabled={isFollowLoading}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                              u.isFollowing
                                ? "secondary-btn"
                                : "primary-btn"
                            }`}
                          >
                            {isFollowLoading ? (
                              <Loader2
                                className="animate-spin"
                                size={16}
                              />
                            ) : u.isFollowing ? (
                              <>
                                <UserCheck size={16} />
                                Following
                              </>
                            ) : (
                              <>
                                <UserPlus size={16} />
                                Follow
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </>
          ) : (
            <>
              {/* ---------------- EXPLORE POSTS ---------------- */}

              <div className="mb-5">
                <h2 className="text-lg font-semibold">Explore</h2>
                <p className="text-sm text-gray-500">
                  Public posts from users
                </p>
              </div>

              {exploreLoading && (
                <div className="flex items-center justify-center py-10 text-gray-500">
                  <Loader2 className="animate-spin mr-2" size={20} />
                  Loading posts...
                </div>
              )}

              {!exploreLoading && explorePosts.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {explorePosts.map((post) => (
                    <div
                      key={post.id}
                      className="group relative aspect-square overflow-hidden rounded-xl cursor-pointer hover-lift"
                      onClick={() =>
                        navigate(`/profile/${post.user.username}`)
                      }
                    >
                      <img
                        src={post.imageUrl}
                        alt={post.caption || "Post"}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />

                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-end">
                        <div className="w-full p-3 text-white opacity-0 group-hover:opacity-100 transition">
                          <p className="font-semibold text-sm truncate">
                            @{post.user.username}
                          </p>

                          <p className="text-xs truncate">
                            {post.caption || "View profile"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!exploreLoading && explorePosts.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                  No public posts available
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}