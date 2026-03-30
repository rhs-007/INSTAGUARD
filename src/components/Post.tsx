import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  MessageCircle,
  Send,
  MoreHorizontal,
  Shield,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "motion/react";

interface PostProps {
  post: any;
  onLike: (id: string) => Promise<any>;
  onCommentAdded?: (postId: string, comment: any) => void;
}

type SuspiciousType =
  | "TAB_SWITCH"
  | "WINDOW_BLUR"
  | "SCREENSHOT_ATTEMPT"
  | "DEVTOOLS_SHORTCUT"
  | "RIGHT_CLICK"
  | "COPY";

export default function Post({ post, onLike, onCommentAdded }: PostProps) {
  const { user } = useAuth();

  const initialLiked = useMemo(() => {
    const likes = Array.isArray(post?.likes) ? post.likes : [];
    return likes.some((l: any) => l?.userId === user?.id);
  }, [post?.likes, user?.id]);

  const [isLiked, setIsLiked] = useState<boolean>(initialLiked);
  const [likesCount, setLikesCount] = useState<number>(
    Array.isArray(post?.likes) ? post.likes.length : 0
  );

  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [comments, setComments] = useState<any[]>(
    Array.isArray(post?.comments) ? post.comments : []
  );

  const [toast, setToast] = useState<null | { title: string; desc?: string }>(
    null
  );

  const [blurNow, setBlurNow] = useState(false);

  // New states for private-post advanced viewing
  const [holdTimeMs, setHoldTimeMs] = useState(3000);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [riskLevel, setRiskLevel] = useState<string>("NORMAL");

  const postRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);
  const blurTimer = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    setIsLiked(initialLiked);
  }, [initialLiked]);

  useEffect(() => {
    setLikesCount(Array.isArray(post?.likes) ? post.likes.length : 0);
  }, [post?.likes]);

  useEffect(() => {
    setComments(Array.isArray(post?.comments) ? post.comments : []);
  }, [post?.comments]);

  const token = localStorage.getItem("accessToken") || "";

  const showToast = (title: string, desc?: string) => {
    setToast({ title, desc });

    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }

    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, 2200);
  };

  const clearHoldInterval = () => {
    if (holdIntervalRef.current) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  const resetHoldState = () => {
    clearHoldInterval();
    holdStartRef.current = null;
    setIsHolding(false);
    setHoldProgress(0);
    setIsRevealed(false);
  };

  const blurFor = (ms = 3000) => {
    setBlurNow(true);
    resetHoldState();

    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
    }

    blurTimer.current = window.setTimeout(() => {
      setBlurNow(false);
      blurTimer.current = null;
    }, ms);
  };

  const logSuspicious = async (type: SuspiciousType, meta: any = {}) => {
    if (!post?.isProtected) return;

    try {
      await fetch(`/api/posts/${post.id}/suspicious`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type,
          meta: {
            ...meta,
            timestamp: new Date().toISOString(),
          },
        }),
      });
    } catch (err) {
      console.error("Failed to log suspicious event", err);
    }
  };

  const fetchAdaptiveHoldTime = async () => {
    if (!post?.isProtected) return;

    try {
      const res = await fetch(`/api/posts/${post.id}/hold-time`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) return;

      const data = await res.json();

      const nextHoldTime =
        typeof data?.holdTime === "number" && data.holdTime > 0
          ? data.holdTime * 1000
          : 3000;

      setHoldTimeMs(nextHoldTime);
      setRiskLevel(data?.riskLevel || "NORMAL");
    } catch (err) {
      console.error("Failed to fetch hold time", err);
    }
  };

  const logViewTrace = async (viewMs: number, completed: boolean) => {
    if (!post?.isProtected || !user?.id || viewMs <= 0) return;

    try {
      await fetch(`/api/posts/${post.id}/view-trace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          viewMs: Math.max(0, Math.floor(viewMs)),
          completed,
        }),
      });
    } catch (err) {
      console.error("Failed to log view trace", err);
    }
  };

  useEffect(() => {
    fetchAdaptiveHoldTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, post?.isProtected]);

  useEffect(() => {
    if (!post?.isProtected) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        logSuspicious("TAB_SWITCH", {
          visibilityState: document.visibilityState,
        });
        blurFor(5000);
        showToast(
          "Protected mode is ON",
          "Tab switch detected. Content blurred temporarily."
        );
      }
    };

    const handleWindowBlur = () => {
      logSuspicious("WINDOW_BLUR");
      blurFor(4000);
      showToast(
        "Protected mode is ON",
        "Window lost focus. Content blurred temporarily."
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase?.() || "";

      const isPrintScreen =
        e.key === "PrintScreen" ||
        key === "printscreen" ||
        key === "printscrn" ||
        key === "prtsc";

      const isMacShot =
        e.metaKey &&
        e.shiftKey &&
        (key === "3" || key === "4" || key === "5");

      const isDevTools =
        (e.ctrlKey &&
          e.shiftKey &&
          (key === "i" || key === "j" || key === "c")) ||
        e.key === "F12";

      if (isPrintScreen || isMacShot) {
        logSuspicious("SCREENSHOT_ATTEMPT", {
          key: e.key,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        });

        blurFor(30000);

        showToast(
          "Protected mode is ON",
          "Screenshot shortcut detected. Content blurred for 30 seconds."
        );

        e.preventDefault();
        return;
      }

      if (isDevTools) {
        logSuspicious("DEVTOOLS_SHORTCUT", {
          key: e.key,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        });

        blurFor(5000);

        showToast(
          "Protected mode is ON",
          "Inspect shortcut detected. Content blurred temporarily."
        );

        e.preventDefault();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logSuspicious("RIGHT_CLICK");
      blurFor(2000);
      showToast("Protected mode is ON", "Right-click disabled for this post.");
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logSuspicious("COPY");
      blurFor(2000);
      showToast("Protected mode is ON", "Copy disabled for this post.");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("copy", handleCopy);

    const el = postRef.current;
    if (el) {
      el.addEventListener("contextmenu", handleContextMenu);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("copy", handleCopy);

      if (el) {
        el.removeEventListener("contextmenu", handleContextMenu);
      }

      clearHoldInterval();

      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }

      if (blurTimer.current) {
        window.clearTimeout(blurTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, post?.isProtected, token]);

  const startHold = () => {
    if (!post?.isProtected || blurNow) return;

    setIsHolding(true);
    setIsRevealed(false);
    setHoldProgress(0);
    holdStartRef.current = Date.now();

    clearHoldInterval();

    holdIntervalRef.current = window.setInterval(() => {
      if (!holdStartRef.current) return;

      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min((elapsed / holdTimeMs) * 100, 100);

      setHoldProgress(progress);

      if (elapsed >= holdTimeMs) {
        setIsRevealed(true);
      }
    }, 40);
  };

  const stopHold = async () => {
    if (!post?.isProtected) return;

    const startedAt = holdStartRef.current;
    const elapsed = startedAt ? Date.now() - startedAt : 0;
    const completed = elapsed >= holdTimeMs;

    await logViewTrace(elapsed, completed);

    resetHoldState();
  };

  const handleLikeClick = async () => {
    const prevLiked = isLiked;
    const prevCount = likesCount;

    const nextLiked = !prevLiked;
    setIsLiked(nextLiked);
    setLikesCount((c) => (nextLiked ? c + 1 : Math.max(0, c - 1)));

    try {
      await onLike(post.id);
    } catch (err) {
      setIsLiked(prevLiked);
      setLikesCount(prevCount);
      console.error("Like failed:", err);
      showToast("Like failed", "Please try again.");
    }
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text || commentLoading) return;

    setCommentLoading(true);

    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Comment failed");
      }

      setComments((prev) => [...prev, data]);
      onCommentAdded?.(post.id, data);
      setCommentText("");
      setShowComments(true);
    } catch (err) {
      console.error("Comment failed:", err);
      showToast("Comment failed", "Check your backend comment API.");
    } finally {
      setCommentLoading(false);
    }
  };

  const partialBlur =
    holdProgress >= 100
      ? 0
      : holdProgress >= 75
      ? 2
      : holdProgress >= 50
      ? 6
      : holdProgress >= 25
      ? 12
      : 20;

  const partialScale =
    holdProgress >= 100
      ? 1
      : holdProgress >= 50
      ? 1.04
      : 1.08;

  const showRealImage = !post?.isProtected || (isRevealed && !blurNow);

  return (
    <motion.div
      ref={postRef}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28 }}
      className="mx-auto mb-8 max-w-md select-none overflow-hidden rounded-3xl border border-white/20 bg-white/80 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)] backdrop-blur-xl"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.95 }}
            className="fixed left-1/2 top-5 z-[9999] w-[92%] max-w-sm -translate-x-1/2 rounded-2xl border border-white/10 bg-black/90 px-4 py-3 text-white shadow-2xl backdrop-blur-md"
          >
            <div className="font-semibold tracking-wide">{toast.title}</div>
            {toast.desc && (
              <div className="mt-0.5 text-xs leading-5 text-white/75">
                {toast.desc}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 p-[2px] shadow-md">
            <div className="h-full w-full overflow-hidden rounded-full bg-white">
              {post?.user?.avatarUrl ? (
                <img
                  src={post.user.avatarUrl}
                  alt={post?.user?.username || "user"}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm font-bold text-gray-600">
                  {post?.user?.username?.[0]?.toUpperCase() || "U"}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-gray-900">
              {post?.user?.username}
            </span>

            {post?.isProtected ? (
              <div className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                <Shield size={12} />
                Protected Post
              </div>
            ) : (
              <span className="text-[11px] text-gray-400">Public post</span>
            )}
          </div>
        </div>

        <button className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800">
          <MoreHorizontal size={20} />
        </button>
      </div>

      <div className="group relative aspect-square overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        {showRealImage ? (
          <img
            src={post?.imageUrl}
            alt="post"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <div className="relative h-full w-full">
            <img
              src={post?.imageUrl}
              alt="protected post"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="h-full w-full object-cover transition-all duration-150"
              style={{
                filter: `blur(${partialBlur}px) brightness(0.78)`,
                transform: `scale(${partialScale})`,
              }}
            />

            <div
              className="absolute inset-0 transition-opacity duration-150"
              style={{
                backgroundColor: `rgba(0,0,0,${Math.max(
                  0.12,
                  0.35 - holdProgress / 420
                )})`,
              }}
            />

            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-6 py-5 text-center text-white shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-center gap-2 text-base font-bold">
                  <Shield size={18} />
                  Protected content
                </div>
                <p className="mt-2 text-xs text-white/80">
                  Hold the button below to reveal this image securely.
                </p>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
                    <span>Reveal progress</span>
                    <span>{Math.round(holdProgress)}%</span>
                  </div>
                  <div className="h-2 w-56 max-w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-white/90 transition-all duration-100"
                      style={{ width: `${holdProgress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-white/70">
                    Hold for {(holdTimeMs / 1000).toFixed(1)} sec • {riskLevel}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {post?.isProtected && (
          <div className="absolute left-0 right-0 top-0 bg-black/55 py-1.5 text-center text-[10px] font-medium tracking-wide text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
            Protected Content • Screenshot / Share Restricted
          </div>
        )}

        {post?.isProtected && showRealImage && (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/45 px-3 py-1.5 text-[10px] font-medium text-white shadow-md backdrop-blur-sm">
            @{user?.username || "viewer"} • {new Date().toLocaleTimeString()}
          </div>
        )}

        {post?.isProtected && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
            <button
              onMouseDown={startHold}
              onMouseUp={stopHold}
              onMouseLeave={stopHold}
              onTouchStart={startHold}
              onTouchEnd={stopHold}
              className="rounded-full border border-white/30 bg-white/90 px-5 py-2.5 text-xs font-semibold text-gray-900 shadow-lg backdrop-blur-md transition hover:scale-[1.03] active:scale-95"
            >
              {isHolding
                ? `Holding... ${Math.round(holdProgress)}%`
                : "Press & hold to view"}
            </button>
          </div>
        )}

        <AnimatePresence>
          {post?.isProtected && blurNow && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <div className="absolute inset-0 bg-black/45 backdrop-blur-2xl" />
              <div className="absolute inset-0 flex items-center justify-center px-6">
                <div className="rounded-2xl border border-white/15 bg-white/10 px-6 py-5 text-center text-white shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-center gap-2 text-base font-bold">
                    <Shield size={18} />
                    Protected mode is ON
                  </div>
                  <div className="mt-1 text-xs text-white/80">
                    Suspicious activity detected. Content is blurred temporarily.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 1.18 }}
              onClick={handleLikeClick}
              className={`rounded-full p-2 transition ${
                isLiked
                  ? "bg-red-50 text-red-500 shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Heart size={22} fill={isLiked ? "currentColor" : "none"} />
            </motion.button>

            <motion.button
              whileTap={{ scale: 1.12 }}
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-gray-700 transition hover:bg-gray-100"
            >
              <MessageCircle size={21} />
              <span className="text-sm font-semibold">{comments.length}</span>
            </motion.button>

            {!post?.isProtected && (
              <motion.button
                whileTap={{ scale: 1.12 }}
                className="rounded-full p-2 text-gray-700 transition hover:bg-gray-100"
              >
                <Send size={21} />
              </motion.button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold tracking-tight text-gray-900">
            {likesCount} {likesCount === 1 ? "like" : "likes"}
          </p>

          <p className="text-sm leading-6 text-gray-800">
            <span className="mr-2 font-bold">{post?.user?.username}</span>
            <span className="text-gray-700">{post?.caption}</span>
          </p>

          <button
            onClick={() => setShowComments((v) => !v)}
            className="text-sm font-medium text-gray-500 transition hover:text-gray-800"
          >
            {comments.length > 0
              ? `View comments (${comments.length})`
              : "Add a comment"}
          </button>

          <p className="pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-gray-400">
            {post?.createdAt
              ? new Date(post.createdAt).toLocaleDateString()
              : ""}
          </p>
        </div>

        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="overflow-hidden border-t border-gray-200/80 pt-4"
            >
              <div className="mb-4 max-h-48 space-y-3 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    No comments yet.
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-800 shadow-sm"
                    >
                      <span className="mr-2 font-semibold text-gray-900">
                        {comment?.user?.username || "user"}
                      </span>
                      <span className="leading-6 text-gray-700">
                        {comment?.text}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
                <input
                  type="text"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddComment();
                  }}
                  className="flex-1 rounded-full bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:bg-white"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || commentLoading}
                  className="rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {commentLoading ? "Posting..." : "Post"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}