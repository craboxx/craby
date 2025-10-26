"use client"

import { useState } from "react"
import { updateGroupSettings, deleteGroup } from "../firebase/firestore"

export default function GroupSettingsModal({ group, user, onClose, onGroupDeleted, onSettingsUpdated }) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || "")
  const [isPublic, setIsPublic] = useState(group.isPublic)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const isCreator = group.createdBy === user.uid
  const isAdmin = group.admins?.includes(user.uid)

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Group name is required")
      return
    }

    setLoading(true)
    setError("")

    try {
      await updateGroupSettings(group.id, {
        name: name.trim(),
        description: description.trim(),
        isPublic,
      })
      alert("Group settings updated!")
      onSettingsUpdated()
      onClose()
    } catch (err) {
      console.error("Error updating group settings:", err)
      setError("Failed to update settings")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteGroup = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${group.name}"? This action cannot be undone and will remove all messages and members.`,
    )
    if (!confirmed) return

    setLoading(true)
    try {
      await deleteGroup(group.id)
      alert("Group deleted successfully")
      onGroupDeleted()
    } catch (err) {
      console.error("Error deleting group:", err)
      alert("Failed to delete group")
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2 style={styles.title}>Group Settings</h2>
          <p style={styles.noPermission}>Only admins can modify group settings</p>
          <button onClick={onClose} style={styles.closeButton}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Group Settings</h2>
        <form onSubmit={handleSaveSettings} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Group Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={styles.input} />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={styles.textarea}
              placeholder="Optional group description"
            />
          </div>

          <div style={styles.checkboxRow}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.checkboxText}>Public Group (visible in trending)</span>
            </label>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.buttons}>
            <button type="submit" disabled={loading} style={styles.saveButton}>
              {loading ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </form>

        {isCreator && (
          <div style={styles.dangerZone}>
            <h3 style={styles.dangerTitle}>Danger Zone</h3>
            <p style={styles.dangerText}>
              Deleting the group will permanently remove all messages, members, and settings.
            </p>
            <button onClick={handleDeleteGroup} disabled={loading} style={styles.deleteButton}>
              Delete Group
            </button>
          </div>
        )}
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
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#333",
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
  saveButton: {
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
  closeButton: {
    width: "100%",
    padding: "12px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "16px",
  },
  noPermission: {
    textAlign: "center",
    color: "#666",
    fontSize: "16px",
    margin: "24px 0",
  },
  dangerZone: {
    marginTop: "32px",
    padding: "20px",
    border: "2px solid #e74c3c",
    borderRadius: "8px",
    background: "#fff5f5",
  },
  dangerTitle: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#e74c3c",
    marginBottom: "8px",
  },
  dangerText: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "16px",
  },
  deleteButton: {
    width: "100%",
    padding: "12px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
}