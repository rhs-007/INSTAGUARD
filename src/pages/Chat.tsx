import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Info,
  Image as ImageIcon,
  AlertCircle,
  MessageCircle,
  X,
  Trash2,
  Pencil,
  Clock3,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type UserLite = {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string | null;
  role?: string;
};

type ChatParticipant = {
  userId: string;
  user?: UserLite;
};

type Message = {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  type: "TEXT" | "IMAGE";
  text?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  restrictedReason?: string | null;
  createdAt?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  seenAt?: string | null;
};

type Chat = {
  id: string;
  participants?: ChatParticipant[];
  messages?: Message[];
  chatparticipant?: ChatParticipant[];
  message?: Message[];
  updatedAt?: string;
  unreadCount?: number;
};

function normalizeChat(raw: any): Chat {
  const c: Chat = raw;
  return {
    ...c,
    participants: Array.isArray(c.participants)
      ? c.participants
      : Array.isArray(c.chatparticipant)
      ? c.chatparticipant
      : [],
    messages: Array.isArray(c.messages)
      ? c.messages
      : Array.isArray(c.message)
      ? c.message
      : [],
    unreadCount: typeof c.unreadCount === "number" ? c.unreadCount : 0,
  };
}

function normalizeMessage(raw: any): Message {
  return {
    ...raw,
    status: typeof raw?.status === "string" ? raw.status : "visible",
    text: raw?.text ?? null,
    imageUrl: raw?.imageUrl ?? null,
    restrictedReason: raw?.restrictedReason ?? null,
  };
}

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`,
});

function msgTime(m?: Message | null) {
  const t = m?.createdAt ? new Date(m.createdAt).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function getPreviewText(last: Message | null | undefined) {
  if (!last) return "No messages";
  if (last.status === "deleted") return "Message deleted";
  if (last.status === "pending_review") {
    return last.type === "IMAGE" ? "Image under review" : "Message under review";
  }
  if (last.status === "restricted") {
    return last.type === "IMAGE" ? "Restricted image" : "Restricted message";
  }
  if (last.type === "IMAGE") return "Sent an image";
  return last.text || "No messages";
}

function restrictedLabel(msg: Message, mine: boolean) {
  if (msg.type === "IMAGE") {
    return mine
      ? "⚠️ Your image was removed by InstaGuard AI moderation."
      : "⚠️ An image was removed by InstaGuard AI moderation.";
  }

  return mine
    ? "⚠️ Your message was restricted by admin policy."
    : "⚠️ This message was restricted by admin policy.";
}

function pendingReviewLabel(msg: Message, mine: boolean) {
  if (msg.type === "IMAGE") {
    return mine
      ? "⏳ Your image is under admin review."
      : "⏳ An image is under admin review.";
  }

  return mine
    ? "⏳ Your message is under admin review."
    : "⏳ This message is under admin review.";
}

export default function Chat() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [showNewMessage, setShowNewMessage] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<UserLite[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [seenChats, setSeenChats] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const registeredRef = useRef(false);
  const seenDebounceRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [toast, setToast] = useState<{ open: boolean; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!socket || !user?.id) return;
    if (registeredRef.current) return;
    registeredRef.current = true;
    socket.emit("register", user.id);
  }, [socket, user?.id]);

  useEffect(() => {
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const otherUserForChat = useMemo(
    () => (chat: Chat | null) =>
      chat?.participants?.find((p) => p.userId !== user?.id)?.user,
    [user?.id]
  );

  const getRecipientId = (chat: Chat | null) => {
    const recipient = chat?.participants?.find((p) => p.userId !== user?.id);
    return recipient?.userId || null;
  };

  const openUserProfile = (username?: string) => {
    if (!username) return;
    navigate(`/profile/${encodeURIComponent(username)}`);
  };

  const sortChats = (list: Chat[]) => {
    return [...list].sort((a, b) => {
      const aLast = a.messages?.[0] || null;
      const bLast = b.messages?.[0] || null;
      const aT =
        msgTime(aLast) || (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
      const bT =
        msgTime(bLast) || (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
      return bT - aT;
    });
  };

  const showToast = (text: string) => {
    setToast({ open: true, text });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  };

  const fetchChats = async () => {
    try {
      const res = await fetch("/api/chats", { headers: authHeader() });
      if (!res.ok) {
        console.error("fetchChats failed:", res.status);
        setChats([]);
        return;
      }
      const data = await res.json();
      const list = (Array.isArray(data) ? data : []).map(normalizeChat);
      setChats(sortChats(list));
    } catch (e) {
      console.error(e);
      setChats([]);
    } finally {
      setLoading(false);
    }
  };

  const markSeen = async (chatId: string) => {
    if (seenDebounceRef.current) window.clearTimeout(seenDebounceRef.current);
    seenDebounceRef.current = window.setTimeout(async () => {
      try {
        await fetch(`/api/chats/${chatId}/seen`, {
          method: "POST",
          headers: authHeader(),
        });
      } catch {
        //
      }
    }, 250);
  };

  const fetchMessages = async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        headers: authHeader(),
      });
      if (!res.ok) {
        console.error("fetchMessages failed:", res.status);
        setMessages([]);
        return;
      }
      const data = await res.json();
      setMessages(
        Array.isArray(data) ? data.map(normalizeMessage) : []
      );
      await markSeen(chatId);
    } catch (e) {
      console.error(e);
      setMessages([]);
    }
  };

  useEffect(() => {
    if (!selectedChat?.id) return;
    fetchMessages(selectedChat.id);
    setChats((prev) =>
      prev.map((c) => (c.id === selectedChat.id ? { ...c, unreadCount: 0 } : c))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  useEffect(() => {
    if (!socket) return;

    const onMessage = (incoming: Message) => {
      const message = normalizeMessage(incoming);

      if (selectedChat?.id && message.chatId === selectedChat.id) {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message]
        );
        markSeen(selectedChat.id);
      }

      setChats((prev) => {
        const next = prev.map((c) => {
          if (c.id !== message.chatId) return c;

          const isOpen = selectedChat?.id === message.chatId;
          const isIncoming = message.senderId !== user?.id;

          return {
            ...c,
            messages: [message],
            unreadCount: isOpen
              ? 0
              : isIncoming
              ? (c.unreadCount || 0) + 1
              : c.unreadCount || 0,
          };
        });

        return sortChats(next);
      });
    };

    const onTyping = (p: any) => {
      if (!selectedChat?.id) return;
      if (p.chatId !== selectedChat.id) return;
      setTypingUserId(p.isTyping ? p.senderId : null);
    };

    const onSeen = (p: any) => {
      setSeenChats((prev) => ({ ...prev, [p.chatId]: true }));
    };

    const onUpdated = (incoming: Message) => {
      const m = normalizeMessage(incoming);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      setChats((prev) =>
        sortChats(
          prev.map((c) => (c.id === m.chatId ? { ...c, messages: [m] } : c))
        )
      );
    };

    const onDeleted = (p: { id: string; chatId: string }) => {
      setMessages((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? { ...x, status: "deleted", text: null, imageUrl: null }
            : x
        )
      );

      setChats((prev) => {
        const next = prev.map((c) => {
          if (c.id !== p.chatId) return c;
          const last = c.messages?.[0];
          if (last?.id !== p.id) return c;
          return {
            ...c,
            messages: [
              { ...last, status: "deleted", text: null, imageUrl: null },
            ],
          };
        });
        return sortChats(next);
      });
    };

    socket.on("message", onMessage);
    socket.on("typing", onTyping);
    socket.on("seen", onSeen);
    socket.on("message_updated", onUpdated);
    socket.on("message_deleted", onDeleted);

    return () => {
      socket.off("message", onMessage);
      socket.off("typing", onTyping);
      socket.off("seen", onSeen);
      socket.off("message_updated", onUpdated);
      socket.off("message_deleted", onDeleted);
    };
  }, [socket, selectedChat?.id, user?.id]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    const recipientId = getRecipientId(selectedChat);
    if (!recipientId) return;

    const clean = newMessage.trim();

    try {
      const res = await fetch("/api/chats/message", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          chatId: selectedChat.id,
          recipientId,
          text: clean,
          type: "TEXT",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("send message failed:", res.status, errText);
        showToast("Failed to send message.");
        return;
      }

      const data = normalizeMessage(await res.json());

      if (data.status === "restricted") {
        showToast("Message restricted. Sent to Admin Moderation Queue.");
      }

      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data]
      );
      setChats((prev) =>
        sortChats(
          prev.map((c) => (c.id === data.chatId ? { ...c, messages: [data] } : c))
        )
      );

      setNewMessage("");
      setSeenChats((prev) => ({ ...prev, [selectedChat.id]: false }));
      await fetchMessages(selectedChat.id);
    } catch (err) {
      console.error(err);
      showToast("Failed to send message.");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    const recipientId = getRecipientId(selectedChat);
    if (!recipientId) return;

    const formData = new FormData();
    formData.append("image", file);
    formData.append("chatId", selectedChat.id);
    formData.append("recipientId", recipientId);
    formData.append("type", "IMAGE");

    try {
      const res = await fetch("/api/chats/message", {
        method: "POST",
        headers: authHeader(),
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("send image failed:", res.status, errText);
        showToast("Failed to send image.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const data = normalizeMessage(await res.json());

      if (data.status === "restricted") {
        showToast("Image restricted. Explicit content detected.");
      } else if (data.status === "pending_review") {
        showToast("Image sent for admin review.");
      } else {
        showToast("Image sent successfully.");
      }

      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data]
      );
      setChats((prev) =>
        sortChats(
          prev.map((c) => (c.id === data.chatId ? { ...c, messages: [data] } : c))
        )
      );

      if (fileInputRef.current) fileInputRef.current.value = "";
      setSeenChats((prev) => ({ ...prev, [selectedChat.id]: false }));

      await fetchMessages(selectedChat.id);
      await fetchChats();
    } catch (err) {
      console.error(err);
      showToast("Failed to send image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteMessage = async (id: string) => {
    if (!selectedChat) return;

    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) {
        showToast("Failed to delete message.");
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "deleted", text: null, imageUrl: null } : m
        )
      );

      await fetchMessages(selectedChat.id);
      await fetchChats();
    } catch (e) {
      console.error(e);
      showToast("Failed to delete message.");
    }
  };

  const editMessage = async (id: string, text: string) => {
    if (!selectedChat) return;

    const t = text.trim();
    if (!t) return;

    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ text: t }),
      });
      if (!res.ok) {
        showToast("Failed to edit message.");
        return;
      }

      const updated = normalizeMessage(await res.json());

      if (updated.status === "restricted") {
        showToast("Edited message restricted. Sent to Admin Moderation Queue.");
      }

      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
      await fetchMessages(selectedChat.id);
      await fetchChats();
    } catch (e) {
      console.error(e);
      showToast("Failed to edit message.");
    }
  };

  const searchUsers = async (q: string) => {
    const query = q.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: authHeader(),
      });

      if (!res.ok) {
        setSearchError(`Search failed (${res.status})`);
        setSearchResults([]);
        return;
      }

      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setSearchError("Search failed.");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!showNewMessage) return;
    const t = window.setTimeout(() => searchUsers(searchQ), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, showNewMessage]);

  const openChatWithUser = async (recipientId: string) => {
    try {
      const existing = chats.find((c) =>
        c.participants?.some((p) => p.userId === recipientId)
      );

      if (existing) {
        setSelectedChat(existing);
        setShowNewMessage(false);
        setSearchQ("");
        setSearchResults([]);
        return;
      }

      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ recipientId }),
      });

      if (!res.ok) {
        console.error("create chat failed:", res.status);
        showToast("Failed to create chat.");
        return;
      }

      const chat = normalizeChat(await res.json());
      setChats((prev) => sortChats([chat, ...prev]));
      setSelectedChat(chat);

      setShowNewMessage(false);
      setSearchQ("");
      setSearchResults([]);
    } catch (e) {
      console.error(e);
      showToast("Failed to create chat.");
    }
  };

  const selectedOther = otherUserForChat(selectedChat);
  const recipientIdForTyping = getRecipientId(selectedChat);

  const emitTyping = (isTyping: boolean) => {
    if (!socket || !selectedChat?.id || !recipientIdForTyping || !user?.id) return;
    socket.emit("typing", {
      chatId: selectedChat.id,
      recipientId: recipientIdForTyping,
      isTyping,
      senderId: user.id,
    });
  };

  const lastOutgoingId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user?.id) return messages[i].id;
    }
    return null;
  })();

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 text-gray-900">
      <AnimatePresence>
        {toast?.open && (
          <motion.div
            className="fixed bottom-5 left-1/2 z-[99999] w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-white/20 bg-black/90 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-md"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-80 shrink-0 border-r border-white/40 bg-white/70 backdrop-blur-xl">
        <div className="flex h-full flex-col">
          <div className="border-b border-gray-200/70 px-5 py-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-gray-900">
                  {user?.username}
                </h2>
                <p className="text-xs text-gray-500">Your conversations</p>
              </div>

              <button
                className="rounded-full bg-gray-100 p-2.5 text-gray-700 transition hover:scale-105 hover:bg-gray-200"
                onClick={() => setShowNewMessage(true)}
                type="button"
                aria-label="New message"
              >
                <Search size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-4 text-sm text-gray-500">Loading chats...</div>
            ) : chats.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <MessageCircle size={28} className="text-gray-500" />
                </div>
                <p className="font-semibold text-gray-800">No chats yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Start a conversation with someone.
                </p>
              </div>
            ) : (
              chats.map((chat) => {
                const otherUser = otherUserForChat(chat);
                const last = Array.isArray(chat?.messages)
                  ? normalizeMessage(chat.messages[0])
                  : null;
                const isSelected = selectedChat?.id === chat.id;

                return (
                  <motion.button
                    key={chat.id}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => setSelectedChat(chat)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                      isSelected
                        ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg"
                        : "hover:bg-white/90"
                    }`}
                    type="button"
                  >
                    <div className="relative h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 p-[2px]">
                      <div className="h-full w-full overflow-hidden rounded-full bg-white">
                        {otherUser?.avatarUrl ? (
                          <img
                            src={otherUser.avatarUrl}
                            alt={otherUser?.username || "user"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className={`flex h-full w-full items-center justify-center text-sm font-bold ${
                              isSelected ? "text-gray-800" : "text-gray-600"
                            }`}
                          >
                            {otherUser?.username?.[0]?.toUpperCase() || "U"}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`truncate font-semibold ${
                            isSelected ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {otherUser?.username}
                        </p>

                        {(chat.unreadCount || 0) > 0 && (
                          <div
                            className={`flex h-5 min-w-[22px] items-center justify-center rounded-full px-2 text-[11px] font-bold ${
                              isSelected
                                ? "bg-white text-blue-600"
                                : "bg-blue-500 text-white"
                            }`}
                          >
                            {chat.unreadCount}
                          </div>
                        )}
                      </div>

                      <p
                        className={`truncate text-sm ${
                          isSelected ? "text-white/80" : "text-gray-500"
                        }`}
                      >
                        {getPreviewText(last)}
                      </p>
                    </div>
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-white/50 backdrop-blur-sm">
        {selectedChat ? (
          <>
            <div className="border-b border-gray-200/70 bg-white/75 px-5 py-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => openUserProfile(selectedOther?.username)}
                  className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-gray-100"
                >
                  <div className="relative h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 p-[2px] shadow-md">
                    <div className="h-full w-full overflow-hidden rounded-full bg-white">
                      {selectedOther?.avatarUrl ? (
                        <img
                          src={selectedOther.avatarUrl}
                          alt={selectedOther?.username || "user"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm font-bold text-gray-600">
                          {selectedOther?.username?.[0]?.toUpperCase() || "U"}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 leading-tight text-left">
                    <div className="truncate font-semibold text-gray-900">
                      {selectedOther?.username}
                    </div>
                    <AnimatePresence mode="wait">
                      {typingUserId === selectedOther?.id ? (
                        <motion.div
                          key="typing"
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -3 }}
                          className="text-xs text-blue-500"
                        >
                          typing...
                        </motion.div>
                      ) : (
                        <motion.div
                          key="profile-link"
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -3 }}
                          className="text-xs text-gray-500"
                        >
                          Click to view profile
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </button>

                <button className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800">
                  <Info size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_35%),linear-gradient(to_bottom,_rgba(255,255,255,0.65),_rgba(248,250,252,0.9))] p-4 sm:p-6">
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                {messages.map((msg) => {
                  const mine = msg.senderId === user?.id;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[82%] sm:max-w-[70%] ${
                          mine ? "items-end" : "items-start"
                        } flex flex-col`}
                      >
                        <div
                          className={`rounded-[24px] px-4 py-3 shadow-sm ${
                            mine
                              ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white"
                              : "border border-white/60 bg-white text-gray-900 backdrop-blur-xl"
                          }`}
                        >
                          {msg.status === "deleted" ? (
                            <p className="text-sm italic opacity-75">Message deleted</p>
                          ) : msg.status === "restricted" ? (
                            <div
                              className={`flex items-start gap-2 rounded-2xl px-1 py-1 text-sm ${
                                mine ? "text-white" : "text-amber-700"
                              }`}
                            >
                              <AlertCircle size={16} className="mt-0.5 shrink-0" />
                              <div className="leading-5">
                                <span>{restrictedLabel(msg, mine)}</span>
                                {msg.restrictedReason ? (
                                  <div
                                    className={`mt-1 text-[11px] ${
                                      mine ? "text-white/80" : "text-amber-600"
                                    }`}
                                  >
                                    {msg.restrictedReason}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : msg.status === "pending_review" ? (
                            <div
                              className={`flex items-start gap-2 rounded-2xl px-1 py-1 text-sm ${
                                mine ? "text-white" : "text-blue-700"
                              }`}
                            >
                              <Clock3 size={16} className="mt-0.5 shrink-0" />
                              <div className="leading-5">
                                <span>{pendingReviewLabel(msg, mine)}</span>
                                {msg.restrictedReason ? (
                                  <div
                                    className={`mt-1 text-[11px] ${
                                      mine ? "text-white/80" : "text-blue-600"
                                    }`}
                                  >
                                    {msg.restrictedReason}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : msg.type === "TEXT" ? (
                            <p className="text-sm leading-6 break-words">
                              {msg.text}
                              {msg.editedAt ? (
                                <span className="ml-1 text-[11px] opacity-75">
                                  (edited)
                                </span>
                              ) : null}
                            </p>
                          ) : (
                            <div className="overflow-hidden rounded-2xl">
                              <img
                                src={msg.imageUrl || ""}
                                alt="chat"
                                className="max-h-72 w-full rounded-2xl object-contain"
                              />
                            </div>
                          )}

                          {mine &&
                            msg.status !== "deleted" &&
                            msg.status !== "pending_review" && (
                              <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                                {msg.type === "TEXT" && msg.status !== "restricted" && (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5 transition hover:bg-white/25"
                                    onClick={() => {
                                      const t = prompt("Edit message", msg.text || "");
                                      if (t !== null) editMessage(msg.id, t);
                                    }}
                                  >
                                    <Pencil size={13} /> Edit
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5 transition hover:bg-white/25"
                                  onClick={() => deleteMessage(msg.id)}
                                >
                                  <Trash2 size={13} /> Delete
                                </button>
                              </div>
                            )}
                        </div>

                        <div
                          className={`mt-1 px-2 text-[11px] ${
                            mine ? "text-right text-gray-500" : "text-left text-gray-400"
                          }`}
                        >
                          {msg.createdAt
                            ? new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                          {mine && lastOutgoingId === msg.id && seenChats[selectedChat.id] ? (
                            <span className="ml-2 font-medium text-blue-500">Seen</span>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-gray-200/70 bg-white/75 p-4 backdrop-blur-xl">
              <form
                onSubmit={handleSendMessage}
                className="mx-auto flex max-w-4xl items-center gap-3 rounded-[28px] border border-gray-200 bg-white px-4 py-3 shadow-lg shadow-blue-100/30"
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                >
                  <ImageIcon size={22} />
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />

                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);

                    emitTyping(true);
                    if (typingTimeoutRef.current) {
                      window.clearTimeout(typingTimeoutRef.current);
                    }
                    typingTimeoutRef.current = window.setTimeout(
                      () => emitTyping(false),
                      800
                    );
                  }}
                  onBlur={() => emitTyping(false)}
                />

                <button
                  type="submit"
                  className="rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!newMessage.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-10">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md rounded-[32px] border border-white/30 bg-white/70 p-10 text-center shadow-[0_25px_80px_-20px_rgba(0,0,0,0.2)] backdrop-blur-xl"
            >
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg">
                <MessageCircle size={46} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                Your Messages
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-500">
                Send private photos and messages to a friend.
              </p>

              <button
                className="mt-6 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3 font-semibold text-white shadow-lg transition hover:scale-[1.02]"
                onClick={() => setShowNewMessage(true)}
                type="button"
              >
                Send Message
              </button>
            </motion.div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showNewMessage && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowNewMessage(false);
            }}
          >
            <motion.div
              className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/20 bg-white/95 shadow-[0_25px_100px_-20px_rgba(0,0,0,0.45)]"
              initial={{ y: 12, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 12, opacity: 0, scale: 0.97 }}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <div className="font-semibold text-gray-900">New message</div>
                  <div className="text-xs text-gray-500">
                    Search users to start chatting
                  </div>
                </div>
                <button
                  onClick={() => setShowNewMessage(false)}
                  className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100"
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5">
                <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 shadow-sm">
                  <Search size={18} className="text-gray-400" />
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Search users by username/email"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
                    autoFocus
                  />
                </div>

                {searchLoading && (
                  <div className="mt-4 text-sm text-gray-500">Searching...</div>
                )}

                {searchError && (
                  <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-500">
                    {searchError}
                  </div>
                )}

                <div className="mt-4 max-h-72 overflow-y-auto">
                  {searchResults
                    .filter((u) => u?.id !== user?.id && u?.role !== "ADMIN")
                    .map((u) => (
                      <motion.button
                        key={u.id}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => openChatWithUser(u.id)}
                        className="mb-2 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-gray-50"
                        type="button"
                      >
                        <div className="relative h-11 w-11 rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 p-[2px]">
                          <div className="h-full w-full overflow-hidden rounded-full bg-white">
                            {u?.avatarUrl ? (
                              <img
                                src={u.avatarUrl}
                                alt={u.username}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm font-bold text-gray-600">
                                {u.username?.[0]?.toUpperCase() || "U"}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900">
                            {u.username}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {u.email}
                          </div>
                        </div>
                      </motion.button>
                    ))}

                  {!searchLoading && searchQ.trim() && searchResults.length === 0 && (
                    <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                      No users found.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}