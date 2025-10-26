"use client"

import { useState, useEffect } from "react"
import {
  listenToChatRequests,
  acceptChatRequest,
  rejectChatRequest,
  cleanupExpiredChatRequests,
} from "../firebase/firestore"

export default function ChatRequestModal({ user, userProfile, onChatAccepted }) {
  const [pendingRequest, setPendingRequest] = useState(null)
  const [lastRequestTime, setLastRequestTime] = useState({})
  const [cooldownActive, setCooldownActive] = useState({})

  useEffect(() => {
    let cleanupInterval = null

    const unsubscribe = listenToChatRequests(user.uid, async (requests) => {
      if (requests.length > 0) {
        setPendingRequest(requests[0])
      } else {
        setPendingRequest(null)
      }
    })

    cleanupInterval = setInterval(async () => {
      try {
        await cleanupExpiredChatRequests(user.uid)
      } catch (error) {
        console.error("[v0] Error cleaning up expired requests:", error)
      }
    }, 10000)

    return () => {
      unsubscribe()
      if (cleanupInterval) {
        clearInterval(cleanupInterval)
      }
    }
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
    <div style={styles.topRightContainer}>
      <div style={styles.notificationCard}>
        <div style={styles.icon}>💬</div>
        <div style={styles.content}>
          <h3 style={styles.title}>Chat Request</h3>
          <p style={styles.message}>
            <strong>{pendingRequest.fromUsername}</strong> wants to chat
          </p>
        </div>
        <div style={styles.buttonGroup}>
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
  topRightContainer: {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: 1000,
    animation: "slideInRight 0.3s ease-out",
  },
  notificationCard: {
    background: "white",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    maxWidth: "380px",
    minWidth: "300px",
  },
  icon: {
    fontSize: "32px",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#333",
    margin: "0 0 4px 0",
  },
  message: {
    fontSize: "13px",
    color: "#666",
    margin: 0,
    lineHeight: "1.3",
  },
  buttonGroup: {
    display: "flex",
    gap: "8px",
    flexShrink: 0,
  },
  acceptButton: {
    padding: "8px 12px",
    background: "#2ecc71",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "transform 0.2s",
  },
  rejectButton: {
    padding: "8px 12px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "transform 0.2s",
  },
}

if (typeof document !== "undefined") {
  const style = document.createElement("style")
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `
  document.head.appendChild(style)
}
