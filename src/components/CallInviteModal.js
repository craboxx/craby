"use client"

export default function CallInviteModal({
  mode,
  partnerName,
  statusText,
  countdownSeconds = null,
  onAccept,
  onDecline,
  onCancel,
  onClose,
}) {
  const title =
    mode === "incoming"
      ? "Incoming Video Call"
      : mode === "outgoing"
        ? `Calling ${partnerName || "partner"}...`
        : "Call Update"

  const message =
    mode === "incoming"
      ? `${partnerName || "Someone"} is inviting you to a video call.`
      : mode === "outgoing"
        ? "Waiting for response."
        : statusText || "Call status changed."

  return (
    <div className="call-invite-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="call-invite-panel">
        <div className="call-invite-header">
          <h3 className="call-invite-title">{title}</h3>
          {mode === "status" && (
            <button onClick={onClose} className="call-invite-close-btn">
              Close
            </button>
          )}
        </div>

        <p className="call-invite-message">{message}</p>

        {typeof countdownSeconds === "number" && mode !== "status" && (
          <div className="call-invite-countdown">Auto timeout in {Math.max(0, countdownSeconds)}s</div>
        )}

        {mode === "incoming" && (
          <div className="call-invite-actions">
            <button onClick={onAccept} className="call-invite-accept-btn">
              Accept
            </button>
            <button onClick={onDecline} className="call-invite-decline-btn">
              Decline
            </button>
          </div>
        )}

        {mode === "outgoing" && (
          <div className="call-invite-actions">
            <button onClick={onCancel} className="call-invite-cancel-btn">
              Cancel
            </button>
          </div>
        )}

        {mode === "status" && (
          <div className="call-invite-actions">
            <button onClick={onClose} className="call-invite-cancel-btn">
              OK
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
