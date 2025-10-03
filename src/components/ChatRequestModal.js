"use client"

import { useState, useEffect } from "react"
import { listenToChatRequests, acceptChatRequest, rejectChatRequest } from "../firebase/firestore"

export default function ChatRequestModal({ user, userProfile, onChatAccepted }) {
  const [pendingRequest, setPendingRequest] = useState(null)

  useEffect(() => {
    const unsubscribe = listenToChatRequests(user.uid, (requests) => {
      if (requests.length > 0) {
        setPendingRequest(requests[0])
      } else {
        setPendingRequest(null)
      }
    })

    return () => unsubscribe()
  }, [user.uid])

  const handleAccept = async () => {
    if (!pendingRequest) return

    try {
      const chatRoomId = await acceptChatRequest(
        pendingRequest.id,
        pendingRequest.fromUid,
        user.uid,
        pendingRequest.fromUsername,
        userProfile.username,
      )
      setPendingRequest(null)
      onChatAccepted(chatRoomId)
    } catch (error) {
      console.error("Error accepting chat request:", error)
      alert("Failed to accept chat request")
    }
  }

  const handleReject = async () => {
    if (!pendingRequest) return

    try {
      await rejectChatRequest(pendingRequest.id)
      setPendingRequest(null)
    } catch (error) {
      console.error("Error rejecting chat request:", error)
    }
  }

  if (!pendingRequest) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.icon}>💬</div>
        <h2 style={styles.title}>Chat Request</h2>
        <p style={styles.message}>
          <strong>{pendingRequest.fromUsername}</strong> wants to chat with you
        </p>
        <div style={styles.buttons}>
          <button onClick={handleAccept} style={styles.acceptButton}>
            Accept
          </button>
          <button onClick={handleReject} style={styles.rejectButton}>
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    background: "white",
    borderRadius: "16px",
    padding: "40px",
    maxWidth: "400px",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  icon: {
    fontSize: "64px",
    marginBottom: "20px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "16px",
  },
  message: {
    fontSize: "16px",
    color: "#666",
    marginBottom: "32px",
    lineHeight: "1.5",
  },
  buttons: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
  },
  acceptButton: {
    padding: "14px 32px",
    background: "#2ecc71",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "transform 0.2s",
  },
  rejectButton: {
    padding: "14px 32px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "transform 0.2s",
  },
}
