"use client"

import { useState, useEffect } from "react"
import { searchUsers, inviteUserToGroup, getGroupMembers } from "../firebase/firestore"

export default function InviteMemberModal({ group, user, onClose }) {
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState([])

  useEffect(() => {
    loadMembers()
  }, [group.id])

  const loadMembers = async () => {
    const membersList = await getGroupMembers(group.id)
    setMembers(membersList)
  }

  const handleSearch = async (term) => {
    setSearchTerm(term)
    if (!term.trim()) {
      setSearchResults([])
      return
    }

    setLoading(true)
    try {
      const memberIds = members.map((m) => m.id)
      const results = await searchUsers(term, [...memberIds, user.uid])
      setSearchResults(results)
    } catch (error) {
      console.error("Error searching users:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async (invitedUser) => {
    try {
      await inviteUserToGroup(
        group.id,
        invitedUser.uid || invitedUser.id,
        invitedUser.username || invitedUser.nickname,
        user.uid,
        user.nickname,
      )
      alert(`Invitation sent to ${invitedUser.username || invitedUser.nickname}!`)
      setSearchTerm("")
      setSearchResults([])
    } catch (error) {
      console.error("Error inviting user:", error)
      alert("Failed to send invitation")
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Invite Members</h2>
        <p style={styles.subtitle}>Search for users to invite to {group.name}</p>

        <div style={styles.searchContainer}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by username..."
            style={styles.searchInput}
            autoFocus
          />
        </div>

        <div style={styles.resultsContainer}>
          {loading && <p style={styles.loadingText}>Searching...</p>}

          {!loading && searchTerm && searchResults.length === 0 && <p style={styles.noResults}>No users found</p>}

          {searchResults.map((result) => (
            <div key={result.id} style={styles.resultItem}>
              <div style={styles.resultInfo}>
                <span style={styles.resultUsername}>{result.username || result.nickname}</span>
                {result.gender && <span style={styles.resultGender}>({result.gender})</span>}
              </div>
              <button onClick={() => handleInvite(result)} style={styles.inviteButton}>
                Invite
              </button>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={styles.closeButton}>
          Close
        </button>
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
    marginBottom: "8px",
    textAlign: "center",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "24px",
    textAlign: "center",
  },
  searchContainer: {
    marginBottom: "16px",
  },
  searchInput: {
    width: "100%",
    padding: "12px 16px",
    border: "2px solid #e0e0e0",
    borderRadius: "8px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  },
  resultsContainer: {
    minHeight: "200px",
    maxHeight: "400px",
    overflowY: "auto",
    marginBottom: "16px",
  },
  loadingText: {
    textAlign: "center",
    color: "#666",
    fontSize: "14px",
  },
  noResults: {
    textAlign: "center",
    color: "#999",
    fontSize: "14px",
    marginTop: "40px",
  },
  resultItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    marginBottom: "8px",
  },
  resultInfo: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  resultUsername: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#333",
  },
  resultGender: {
    fontSize: "14px",
    color: "#999",
  },
  inviteButton: {
    padding: "8px 16px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  closeButton: {
    width: "100%",
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
