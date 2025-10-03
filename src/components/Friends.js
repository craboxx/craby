"use client"

import { useState, useEffect } from "react"
import {
  getFriends,
  getFriendRequests,
  acceptFriendRequest,
  listenToPresence,
  removeFriend,
} from "../firebase/firestore"

export default function Friends({ user, userProfile, onBack }) {
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [friendStatuses, setFriendStatuses] = useState({})
  const [activeTab, setActiveTab] = useState("friends") // "friends" or "requests"

  useEffect(() => {
    loadFriends()
    loadFriendRequests()
  }, [user.uid])

  const loadFriends = async () => {
    const friendsList = await getFriends(user.uid)
    setFriends(friendsList)

    // Listen to each friend's presence
    friendsList.forEach((friend) => {
      listenToPresence(friend.id, (status) => {
        setFriendStatuses((prev) => ({
          ...prev,
          [friend.id]: status,
        }))
      })
    })
  }

  const loadFriendRequests = async () => {
    const requests = await getFriendRequests(user.uid)
    setFriendRequests(requests)
  }

  const handleAcceptRequest = async (requestId, fromUid) => {
    try {
      await acceptFriendRequest(requestId, fromUid, user.uid)
      alert("Friend request accepted!")
      loadFriendRequests()
      loadFriends()
    } catch (error) {
      console.error("Error accepting friend request:", error)
      alert("Failed to accept friend request")
    }
  }

  const handleRemoveFriend = async (friendId, friendUsername) => {
    const confirmed = window.confirm(`Are you sure you want to remove ${friendUsername} from your friends list?`)
    if (!confirmed) return

    try {
      await removeFriend(user.uid, friendId)
      alert(`${friendUsername} has been removed from your friends list`)
      loadFriends()
    } catch (error) {
      console.error("Error removing friend:", error)
      alert("Failed to remove friend")
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "online":
        return "#2ecc71"
      case "in-chat":
        return "#f39c12"
      default:
        return "#95a5a6"
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case "online":
        return "Online"
      case "in-chat":
        return "In Chat"
      default:
        return "Offline"
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.header}>
          <h1 style={styles.title}>Friends</h1>
          <button onClick={onBack} style={styles.backButton}>
            Back to Home
          </button>
        </div>

        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab("friends")}
            style={{
              ...styles.tab,
              ...(activeTab === "friends" ? styles.activeTab : {}),
            }}
          >
            My Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            style={{
              ...styles.tab,
              ...(activeTab === "requests" ? styles.activeTab : {}),
            }}
          >
            Friend Requests ({friendRequests.length})
          </button>
        </div>

        <div style={styles.listContainer}>
          {activeTab === "friends" && (
            <div style={styles.list}>
              {friends.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No friends yet. Start chatting and add some friends!</p>
                </div>
              ) : (
                friends.map((friend) => (
                  <div key={friend.id} style={styles.friendItem}>
                    <div style={styles.friendInfo}>
                      <div style={{ ...styles.statusDot, background: getStatusColor(friendStatuses[friend.id]) }} />
                      <div>
                        <div style={styles.friendName}>{friend.username}</div>
                        <div style={styles.friendStatus}>{getStatusText(friendStatuses[friend.id])}</div>
                      </div>
                    </div>
                    <button onClick={() => handleRemoveFriend(friend.id, friend.username)} style={styles.removeButton}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "requests" && (
            <div style={styles.list}>
              {friendRequests.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No pending friend requests</p>
                </div>
              ) : (
                friendRequests.map((request) => (
                  <div key={request.id} style={styles.requestItem}>
                    <div style={styles.requestInfo}>
                      <div style={styles.requestName}>{request.fromUsername}</div>
                      <div style={styles.requestText}>wants to be your friend</div>
                    </div>
                    <button
                      onClick={() => handleAcceptRequest(request.id, request.fromUid)}
                      style={styles.acceptButton}
                    >
                      Accept
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "40px 20px",
  },
  content: {
    maxWidth: "800px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "32px",
  },
  title: {
    fontSize: "36px",
    fontWeight: "bold",
    color: "white",
    margin: "0",
  },
  backButton: {
    padding: "12px 24px",
    background: "white",
    color: "#667eea",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  tabs: {
    display: "flex",
    gap: "8px",
    marginBottom: "24px",
  },
  tab: {
    flex: "1",
    padding: "16px",
    background: "rgba(255, 255, 255, 0.2)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.3s",
  },
  activeTab: {
    background: "white",
    color: "#667eea",
  },
  listContainer: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    minHeight: "400px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  emptyState: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "300px",
    color: "#999",
    textAlign: "center",
  },
  friendItem: {
    padding: "16px",
    background: "#f8f9fa",
    borderRadius: "8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  friendInfo: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  statusDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
  },
  friendName: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#333",
  },
  friendStatus: {
    fontSize: "14px",
    color: "#666",
    marginTop: "4px",
  },
  requestItem: {
    padding: "16px",
    background: "#f8f9fa",
    borderRadius: "8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  requestInfo: {
    flex: "1",
  },
  requestName: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#333",
  },
  requestText: {
    fontSize: "14px",
    color: "#666",
    marginTop: "4px",
  },
  acceptButton: {
    padding: "10px 24px",
    background: "#2ecc71",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  removeButton: {
    padding: "10px 24px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
}
