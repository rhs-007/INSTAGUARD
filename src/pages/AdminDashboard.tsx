import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Filter,
  Ban,
  TimerReset,
  Gavel,
  UserX,
  Image as ImageIcon,
  Eye,
  EyeOff,
} from "lucide-react";

type QueueStatus = "PENDING" | "RESOLVED";

type QueueItem = {
  id: string;
  kind: "TEXT" | "IMAGE" | string;
  status: QueueStatus;
  messageId: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  textSnapshot?: string | null;
  imageSnapshot?: string | null;
  reason?: string | null;
  matched?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedById?: string | null;
  resolutionNote?: string | null;

  sender?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
    isBanned?: boolean;
    bannedAt?: string | null;
    banReason?: string | null;
    suspendedUntil?: string | null;
    suspendReason?: string | null;
  };

  recipient?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
};

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`,
});

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
}

function isStillSuspended(until?: string | null) {
  if (!until) return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > Date.now();
}

export default function AdminDashboard() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<QueueStatus>("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchQueue(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const fetchQueue = async (s: QueueStatus) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/moderation/queue?status=${encodeURIComponent(s)}`,
        { headers: authHeader() }
      );

      if (!res.ok) {
        setError(`Failed to load queue (${res.status})`);
        setQueue([]);
        return;
      }

      const data = await res.json();
      setQueue(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError("Failed to load moderation queue.");
      setQueue([]);
    } finally {
      setLoading(false);
    }
  };

  const approveItem = async (id: string) => {
    try {
      const note = prompt("Approval note (optional)", "Approved by admin");
      const res = await fetch(`/api/admin/moderation/queue/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ resolutionNote: note ?? "" }),
      });

      if (!res.ok) {
        alert(`Approve failed (${res.status})`);
        return;
      }

      await fetchQueue(status);
    } catch (err) {
      console.error(err);
      alert("Approve failed.");
    }
  };

  const rejectItem = async (id: string) => {
    try {
      const note = prompt("Rejection note (optional)", "Rejected by admin");
      const res = await fetch(`/api/admin/moderation/queue/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ resolutionNote: note ?? "" }),
      });

      if (!res.ok) {
        alert(`Reject failed (${res.status})`);
        return;
      }

      await fetchQueue(status);
    } catch (err) {
      console.error(err);
      alert("Reject failed.");
    }
  };

  const suspendUser = async (userId: string, username: string) => {
    const daysInput = prompt(`Suspend ${username} for how many days?`, "3");
    if (daysInput === null) return;

    const days = Number(daysInput);
    if (!Number.isFinite(days) || days <= 0) {
      alert("Enter a valid number of days.");
      return;
    }

    const reason = prompt("Suspension reason (optional)", "Policy violation in moderation queue");
    setBusyId(userId);

    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          days,
          reason: reason?.trim() || "",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || `Suspend failed (${res.status})`);
        return;
      }

      await fetchQueue(status);
      alert(`${username} suspended for ${days} day(s).`);
    } catch (err) {
      console.error(err);
      alert("Suspend failed.");
    } finally {
      setBusyId(null);
    }
  };

  const banUser = async (userId: string, username: string) => {
    const ok = window.confirm(`Are you sure you want to ban ${username}?`);
    if (!ok) return;

    const reason = prompt("Ban reason (optional)", "Severe policy violation");
    setBusyId(userId);

    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          reason: reason?.trim() || "",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || `Ban failed (${res.status})`);
        return;
      }

      await fetchQueue(status);
      alert(`${username} has been banned.`);
    } catch (err) {
      console.error(err);
      alert("Ban failed.");
    } finally {
      setBusyId(null);
    }
  };

  const unbanUser = async (userId: string, username: string) => {
    const ok = window.confirm(`Unban ${username}?`);
    if (!ok) return;

    setBusyId(userId);

    try {
      const res = await fetch(`/api/admin/users/${userId}/unban`, {
        method: "PATCH",
        headers: authHeader(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || `Unban failed (${res.status})`);
        return;
      }

      await fetchQueue(status);
      alert(`${username} has been unbanned.`);
    } catch (err) {
      console.error(err);
      alert("Unban failed.");
    } finally {
      setBusyId(null);
    }
  };

  const unsuspendUser = async (userId: string, username: string) => {
    const ok = window.confirm(`Remove suspension for ${username}?`);
    if (!ok) return;

    setBusyId(userId);

    try {
      const res = await fetch(`/api/admin/users/${userId}/unsuspend`, {
        method: "PATCH",
        headers: authHeader(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || `Unsuspend failed (${res.status})`);
        return;
      }

      await fetchQueue(status);
      alert(`${username} suspension removed.`);
    } catch (err) {
      console.error(err);
      alert("Unsuspend failed.");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return queue;

    return queue.filter((item) => {
      const text = [
        item.sender?.username,
        item.recipient?.username,
        item.textSnapshot,
        item.imageSnapshot,
        item.reason,
        item.matched,
        item.chatId,
        item.messageId,
        item.sender?.banReason,
        item.sender?.suspendReason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(s);
    });
  }, [queue, q]);

  const pendingCount = useMemo(
    () => (status === "PENDING" ? filtered.length : queue.length),
    [filtered.length, queue.length, status]
  );

  if (loading) return <div className="p-10">Loading admin panel...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Shield size={32} className="text-blue-500" />
          <div>
            <h1 className="text-3xl font-bold">Admin Moderation Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              Restricted and review-pending text or image messages are logged here.
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchQueue(status)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
          type="button"
          title="Refresh"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={18} className="text-gray-500" />

          <button
            type="button"
            onClick={() => setStatus("PENDING")}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
              status === "PENDING"
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Pending
          </button>

          <button
            type="button"
            onClick={() => setStatus("RESOLVED")}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
              status === "RESOLVED"
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Resolved
          </button>

          {status === "PENDING" && (
            <span className="ml-2 text-xs text-gray-500">
              Showing <span className="font-semibold">{pendingCount}</span> item(s)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by username, message, reason..."
            className="w-full md:w-80 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {filtered.map((item) => {
          const senderSuspended = isStillSuspended(item.sender?.suspendedUntil);
          const senderBanned = !!item.sender?.isBanned;
          const isBusy = busyId === item.sender?.id;

          return (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        item.status === "PENDING"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {item.status}
                    </span>

                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                      {item.kind || "TEXT"}
                    </span>

                    <span className="text-xs text-gray-500">{fmtTime(item.createdAt)}</span>

                    {item.matched && (
                      <span className="text-xs font-mono px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                        matched: {item.matched}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="font-semibold">
                      {item.sender?.username || item.senderId}
                    </span>
                    <span className="text-gray-500">→</span>
                    <span className="font-semibold">
                      {item.recipient?.username || item.recipientId}
                    </span>

                    {senderBanned && (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">
                        BANNED
                      </span>
                    )}

                    {senderSuspended && (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                        SUSPENDED
                      </span>
                    )}
                  </div>

                  {(senderBanned || senderSuspended) && (
                    <div className="mt-2 flex flex-col gap-1 text-xs text-gray-600">
                      {senderBanned && (
                        <div>
                          Ban info:{" "}
                          <span className="font-semibold">
                            {item.sender?.banReason || "No reason provided"}
                          </span>
                          {item.sender?.bannedAt ? (
                            <> • {fmtTime(item.sender.bannedAt)}</>
                          ) : null}
                        </div>
                      )}

                      {senderSuspended && (
                        <div>
                          Suspension until:{" "}
                          <span className="font-semibold">
                            {fmtTime(item.sender?.suspendedUntil)}
                          </span>
                          {item.sender?.suspendReason ? (
                            <>
                              {" "}
                              • Reason:{" "}
                              <span className="font-semibold">{item.sender.suspendReason}</span>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}

                  {item.kind === "IMAGE" ? (
                    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                        <ImageIcon size={14} />
                        Flagged image
                      </div>

                      {item.imageSnapshot ? (
                        <img
                          src={item.imageSnapshot}
                          alt="restricted-content"
                          className="max-h-80 rounded-xl border border-gray-200 object-contain bg-white"
                        />
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-500">
                          No stored image preview.
                        </div>
                      )}

                      {(item.reason || item.matched) && (
                        <div className="mt-3 text-xs text-gray-500">
                          Reason: <span className="font-semibold">{item.reason || "—"}</span>
                          {item.matched ? (
                            <>
                              {" "}
                              • Matched: <span className="font-mono">{item.matched}</span>
                            </>
                          ) : null}
                        </div>
                      )}

                      <div className="mt-2 text-[11px] text-gray-400 break-all">
                        chatId: {item.chatId} • messageId: {item.messageId}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="text-xs text-gray-500 mb-1">Restricted message</div>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {item.textSnapshot || "—"}
                      </div>

                      {(item.reason || item.matched) && (
                        <div className="mt-2 text-xs text-gray-500">
                          Reason: <span className="font-semibold">{item.reason || "—"}</span>
                          {item.matched ? (
                            <>
                              {" "}
                              • Matched: <span className="font-mono">{item.matched}</span>
                            </>
                          ) : null}
                        </div>
                      )}

                      <div className="mt-2 text-[11px] text-gray-400 break-all">
                        chatId: {item.chatId} • messageId: {item.messageId}
                      </div>
                    </div>
                  )}

                  {item.status === "RESOLVED" && (
                    <div className="mt-3 text-xs text-gray-500">
                      Resolved at{" "}
                      <span className="font-semibold">
                        {fmtTime(item.resolvedAt || "")}
                      </span>
                      {item.resolutionNote ? (
                        <>
                          {" "}
                          • Note:{" "}
                          <span className="font-semibold">{item.resolutionNote}</span>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 md:flex-col md:items-stretch md:w-56">
                  {item.status === "PENDING" ? (
                    <>
                      <button
                        onClick={() => approveItem(item.id)}
                        className="flex-1 bg-green-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-green-600 transition-colors"
                        type="button"
                      >
                        <Eye size={18} />
                        Approve
                      </button>

                      <button
                        onClick={() => rejectItem(item.id)}
                        className="flex-1 bg-red-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-red-600 transition-colors"
                        type="button"
                      >
                        <EyeOff size={18} />
                        Reject
                      </button>
                    </>
                  ) : (
                    <button
                      className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg flex items-center justify-center gap-2 cursor-not-allowed"
                      type="button"
                      disabled
                    >
                      <Check size={18} />
                      Resolved
                    </button>
                  )}

                  {item.sender?.id && (
                    <>
                      {!senderSuspended ? (
                        <button
                          onClick={() =>
                            suspendUser(item.sender!.id, item.sender!.username || item.senderId)
                          }
                          className="flex-1 bg-orange-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors disabled:opacity-60"
                          type="button"
                          disabled={isBusy}
                        >
                          <TimerReset size={18} />
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            unsuspendUser(item.sender!.id, item.sender!.username || item.senderId)
                          }
                          className="flex-1 bg-orange-100 text-orange-700 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-orange-200 transition-colors disabled:opacity-60"
                          type="button"
                          disabled={isBusy}
                        >
                          <UserX size={18} />
                          Unsuspend
                        </button>
                      )}

                      {!senderBanned ? (
                        <button
                          onClick={() =>
                            banUser(item.sender!.id, item.sender!.username || item.senderId)
                          }
                          className="flex-1 bg-red-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-red-600 transition-colors disabled:opacity-60"
                          type="button"
                          disabled={isBusy}
                        >
                          <Ban size={18} />
                          Ban User
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            unbanUser(item.sender!.id, item.sender!.username || item.senderId)
                          }
                          className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-red-200 transition-colors disabled:opacity-60"
                          type="button"
                          disabled={isBusy}
                        >
                          <Gavel size={18} />
                          Unban User
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 mt-6">
          <p className="text-gray-500">
            {status === "PENDING" ? "No content pending review" : "No resolved items"}
          </p>
        </div>
      )}
    </div>
  );
}