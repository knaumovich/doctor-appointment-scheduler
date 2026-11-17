import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/useAuth";
import { can } from "../lib/roles";
import type { DoctorComment } from "../lib/types";
import {
  createDoctorComment,
  deleteComment,
  fetchDoctorComments,
  replyToComment,
} from "../lib/authzClient";

type CommentsSectionProps = {
  doctorId: string;
  doctorProfileId?: string | null;
};

export function CommentsSection({ doctorId, doctorProfileId }: CommentsSectionProps) {
  const { role, banned } = useAuth();
  const [comments, setComments] = useState<DoctorComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const [replyForId, setReplyForId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const canComment = can(role, "comment") && !banned;
  const canReply = can(role, "reply") && doctorProfileId === doctorId && !banned;
  const canDelete = can(role, "deleteComment");

  const averageRating = useMemo(() => {
    if (comments.length === 0) return null;
    const total = comments.reduce((sum, c) => sum + c.rating, 0);
    return Math.round((total / comments.length) * 10) / 10;
  }, [comments]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchDoctorComments(doctorId);
      setComments(list);
    } catch (err) {
      console.error(err);
      setError("Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (banned) {
      setError("Your account is restricted from posting reviews and ratings.");
      return;
    }
    if (!text.trim()) {
      setError("Enter your review.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const created = await createDoctorComment(doctorId, { rating, text: text.trim() });
      setComments((prev) => [created, ...prev]);
      setText("");
      setRating(5);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error && err.message.includes("already_commented")
          ? "You can leave only one review per doctor."
          : "Unable to post your review. You must have completed an appointment with this doctor.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const onReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await replyToComment(doctorId, commentId, { text: replyText.trim() });
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setReplyForId(null);
      setReplyText("");
    } catch (err) {
      console.error(err);
      setError("Unable to post your reply.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (commentId: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteComment(doctorId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error(err);
      setError("Unable to delete the review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 16, padding: 12, border: "1px solid #e2e2e2", borderRadius: 12, background: "white" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800 }}>Doctor Reviews</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {averageRating ? `Average Rating: ${averageRating} / 5` : "No ratings yet"}
          </div>
        </div>
        <button type="button" onClick={load} disabled={loading || busy}>
          Refresh
        </button>
      </div>

      {error && <div style={{ marginTop: 8, color: "#b00020", fontSize: 13 }}>{error}</div>}

      {canComment && (
        <form onSubmit={onSubmit} style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#555" }}>Rating</span>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#555" }}>Review</span>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Share your experience of the appointment…"
            />
          </label>
          <button type="submit" disabled={busy} style={{ fontWeight: 700, justifySelf: "start" }}>
            {busy ? "Sending…" : "Post Review"}
          </button>
        </form>
      )}

      {banned && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>
          Your account is restricted from posting reviews and ratings.
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {loading ? (
          <div>Loading reviews…</div>
        ) : comments.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>No reviews yet.</div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} style={{ borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{comment.authorName || comment.authorEmail}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{comment.rating} / 5</div>
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>{new Date(comment.createdAt).toLocaleString("en-GB")}</div>
              <div style={{ marginTop: 6 }}>{comment.text}</div>

              {comment.reply && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    background: "#f7f7f7",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Doctor’s Reply ({new Date(comment.reply.createdAt).toLocaleString("en-GB")})
                  </div>
                  <div>{comment.reply.text}</div>
                </div>
              )}

              {canReply && !comment.reply && (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {replyForId !== comment.id ? (
                    <button type="button" onClick={() => setReplyForId(comment.id)}>
                      Reply
                    </button>
                  ) : (
                    <>
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Your reply…"
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" disabled={busy} onClick={() => onReply(comment.id)}>
                          {busy ? "Sending…" : "Post Reply"}
                        </button>
                        <button type="button" onClick={() => setReplyForId(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {canDelete && (
                <button type="button" disabled={busy} onClick={() => onDelete(comment.id)} style={{ marginTop: 6 }}>
                  Delete Review
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
