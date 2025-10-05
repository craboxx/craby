"use client"

import { useState, useEffect } from "react"
import { listenToGroupInvites, acceptGroupInvite, rejectGroupInvite } from "../firebase/firestore"

export default function GroupInviteNotification({ user, onGroupJoined }) {
  const [invites, setInvites] = useState([])
  const [showNotification, setShowNotification] = useState(false)

  useEffect(() => {
    if (!user) return

    const unsubscribe = listenToGroupInvites(user.uid, (newInvites) => {
      setInvites(newInvites)
      if (newInvites.length > 0) {
        setShowNotification(true)
      }
    })

    return () => unsubscribe()
  }, [user])

  const handleAccept = async (invite) => {
    try {
      await acceptGroupInvite(invite.id, invite.groupId, user.uid)
      alert(`You've joined ${invite.group?.name}!`)
      if (onGroupJoined) {
        onGroupJoined(invite.group)
      }
    } catch (error) {
      console.error("Error accepting invite:", error)
      alert("Failed to accept invitation")
    }
  }

  const handleReject = async (invite) => {
    try {
      await rejectGroupInvite(invite.id)
    } catch (error) {
      console.error("Error rejecting invite:", error)
    }
  }

  if (invites.length === 0 || !showNotification) return null

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Group Invitations ({invites.length})</h3>
        <button onClick={() => setShowNotification(false)} style={styles.closeButton}>
          ×
        </button>
      </div>
      <div style={styles.invitesList}>
        {invites.map((invite) => (
          <div key={invite.id} style={styles.inviteItem}>
            <div style={styles.inviteInfo}>
              <p style={styles.inviteText}>
                <strong>{invite.inviterUsername}</strong> invited you to join <strong>{invite.group?.name}</strong>
              </p>
              {invite.group?.description && <p style={styles.groupDescription}>{invite.group.description}</p>}
            </div>
            <div style={styles.inviteButtons}>
              <button onClick={() => handleAccept(invite)} style={styles.acceptButton}>
                Accept
              </button>
              <button onClick={() => handleReject(invite)} style={styles.rejectButton}>
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
    padding: "16px",
    maxWidth: "400px",
    zIndex: 999,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  title: {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#333",
    margin: 0,
  },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: "24px",
    color: "#999",
    cursor: "pointer",
    padding: "0",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  invitesList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  inviteItem: {
    padding: "12px",
    background: "#f9f9f9",
    borderRadius: "8px",
    border: "1px solid #e0e0e0",
  },
  inviteInfo: {
    marginBottom: "12px",
  },
  inviteText: {
    fontSize: "14px",
    color: "#333",
    margin: "0 0 4px 0",
  },
  groupDescription: {
    fontSize: "12px",
    color: "#666",
    margin: "4px 0 0 0",
  },
  inviteButtons: {
    display: "flex",
    gap: "8px",
  },
  acceptButton: {
    flex: 1,
    padding: "8px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  rejectButton: {
    flex: 1,
    padding: "8px",
    background: "#e0e0e0",
    color: "#333",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
}
