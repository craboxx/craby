"use client"

import { useState } from "react"
import { createGroup, requestJoinGroup } from "../firebase/firestore"

export default function GroupModal({ user, onClose, onGroupCreated, joinGroup = null }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Group name is required")
      return
    }

    setLoading(true)
    setError("")

    try {
      const groupId = await createGroup(user.uid, name.trim(), description.trim(), "", isPublic)
      alert("Group created successfully!")
      onGroupCreated(groupId)
      onClose()
    } catch (err) {
      console.error("Error creating group:", err)
      setError("Failed to create group")
    } finally {
      setLoading(false)
    }
  }

  const handleJoinGroup = async () => {
    if (!joinGroup) return

    setLoading(true)
    setError("")

    try {
      await requestJoinGroup(joinGroup.id, user.uid, user.nickname)
      alert(`Join request sent to ${joinGroup.name}!`)
      onClose()
    } catch (err) {
      console.error("Error requesting to join group:", err)
      setError("Failed to send join request")
    } finally {
      setLoading(false)
    }
  }

  if (joinGroup) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2 style={styles.title}>Join Group</h2>
          <div style={styles.groupInfo}>
            <h3 style={styles.groupName}>{joinGroup.name}</h3>
            {joinGroup.description && <p style={styles.groupDescription}>{joinGroup.description}</p>}
            <p style={styles.memberCount}>{joinGroup.members?.length || 0} members</p>
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.buttons}>
            <button onClick={handleJoinGroup} disabled={loading} style={styles.submitButton}>
              {loading ? "Sending..." : "Request to Join"}
            </button>
            <button onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Create New Group</h2>
        <form onSubmit={handleCreateGroup} style={styles.form}>
          <input
            type="text"
            placeholder="Group Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={styles.input}
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={styles.textarea}
          />
          <div style={styles.checkboxRow}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.checkboxText}>Public Group (anyone can request to join)</span>
            </label>
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.buttons}>
            <button type="submit" disabled={loading} style={styles.submitButton}>
              {loading ? "Creating..." : "Create Group"}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </form>
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
    padding: "32px",
    maxWidth: "500px",
    width: "90%",
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "24px",
    textAlign: "center",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  input: {
    padding: "12px 16px",
    border: "2px solid #e0e0e0",
    borderRadius: "8px",
    fontSize: "16px",
    outline: "none",
  },
  textarea: {
    padding: "12px 16px",
    border: "2px solid #e0e0e0",
    borderRadius: "8px",
    fontSize: "16px",
    outline: "none",
    fontFamily: "inherit",
    resize: "vertical",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
  },
  checkbox: {
    width: "18px",
    height: "18px",
    cursor: "pointer",
  },
  checkboxText: {
    fontSize: "14px",
    color: "#333",
  },
  groupInfo: {
    marginBottom: "24px",
  },
  groupName: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "8px",
  },
  groupDescription: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "12px",
  },
  memberCount: {
    fontSize: "14px",
    color: "#667eea",
    fontWeight: "600",
  },
  error: {
    color: "#e74c3c",
    fontSize: "14px",
    margin: "0",
  },
  buttons: {
    display: "flex",
    gap: "12px",
    marginTop: "8px",
  },
  submitButton: {
    flex: 1,
    padding: "12px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  cancelButton: {
    flex: 1,
    padding: "12px",
    background: "#e0e0e0",
    color: "#333",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
}