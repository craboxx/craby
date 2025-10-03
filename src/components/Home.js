"use client"

import { useState, useEffect } from "react"
import {
  listenToOnlineUsers,
  getUserProfile,
  sendChatRequest,
  listenToChatRequests,
  getBlockedUsers,
  unblockUser,
  getFriends,
  listenToPresence,
  isUserBlocked,
} from "../firebase/firestore"

export default function Home({ user, userProfile, onEnterChat, onViewFriends, onLogout, onStartDirectChat }) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [onlineUserProfiles, setOnlineUserProfiles] = useState([])
  const [chatRequests, setChatRequests] = useState([])
  const [blockedUsers, setBlockedUsers] = useState([])
  const [friends, setFriends] = useState([])
  const [friendStatuses, setFriendStatuses] = useState({})
  const [activeTab, setActiveTab] = useState("online") // "online", "friends", "blocked"

  const handleUnblockUser = async (blockedUid) => {
    try {
      await unblockUser(user.uid, blockedUid)
      setBlockedUsers((prev) => prev.filter((blocked) => blocked.uid !== blockedUid))
      alert("User unblocked successfully!")
    } catch (error) {
      console.error("Error unblocking user:", error)
      alert("Failed to unblock user")
    }
  }

  useEffect(() => {
    // Listen to online users
    const unsubscribeOnline = listenToOnlineUsers(async (users) => {
      const otherUsers = users.filter((u) => u.uid !== user.uid)
      setOnlineUsers(otherUsers)

      const profiles = await Promise.all(
        otherUsers.map(async (u) => {
          const profile = await getUserProfile(u.uid)
          return profile ? { ...profile, status: u.status } : null
        }),
      )
      setOnlineUserProfiles(profiles.filter((p) => p !== null))
    })

    // Listen to chat requests
    const unsubscribeRequests = listenToChatRequests(user.uid, setChatRequests)

    // Load blocked users
    loadBlockedUsers()

    // Load friends
    loadFriends()

    return () => {
      unsubscribeOnline()
      unsubscribeRequests()
    }
  }, [user.uid])

  const loadBlockedUsers = async () => {
    const blocked = await getBlockedUsers(user.uid)
    setBlockedUsers(blocked)
  }

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

  const handleSendChatRequest = async (toUid, toUsername) => {
    try {
      const blocked = await isUserBlocked(user.uid, toUid)
      if (blocked) {
        alert("You have blocked this user")
        return
      }

      await sendChatRequest(user.uid, userProfile.username, toUid, toUsername)
      alert(`Chat request sent to ${toUsername}! They will be notified.`)
    } catch (error) {
      console.error("Error sending chat request:", error)
      alert("Failed to send chat request")
    }
  }

  const handleChatWithFriend = async (friend) => {
    try {
      await sendChatRequest(user.uid, userProfile.username, friend.id, friend.username)
      alert(`Chat request sent to ${friend.username}! They will be notified.`)
    } catch (error) {
      console.error("Error sending chat request to friend:", error)
      alert("Failed to send chat request")
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
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>CRABY</h1>
          <p style={styles.username}>Welcome, {userProfile.username}</p>
        </div>
        <div style={styles.headerButtons}>
          <button onClick={onViewFriends} style={styles.friendsButton}>
            Friends
          </button>
          <button onClick={onLogout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.mainSection}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Start Random Chat</h2>
            <p style={styles.cardDescription}>Connect with random people around the world</p>
            <button onClick={onEnterChat} style={styles.enterButton}>
              Enter to Chat
            </button>
          </div>

          <div style={styles.statsCard}>
            <div style={styles.statItem}>
              <div style={styles.statNumber}>{onlineUsers.length}</div>
              <div style={styles.statLabel}>Users Online</div>
            </div>
          </div>
        </div>

        <div style={styles.sidebar}>
          <div style={styles.tabs}>
            <button
              onClick={() => setActiveTab("online")}
              style={{
                ...styles.tab,
                ...(activeTab === "online" ? styles.activeTab : {}),
              }}
            >
              Online
            </button>
            <button
              onClick={() => setActiveTab("friends")}
              style={{
                ...styles.tab,
                ...(activeTab === "friends" ? styles.activeTab : {}),
              }}
            >
              Friends
            </button>
            <button
              onClick={() => setActiveTab("blocked")}
              style={{
                ...styles.tab,
                ...(activeTab === "blocked" ? styles.activeTab : {}),
              }}
            >
              Blocked
            </button>
          </div>

          {activeTab === "online" && (
            <div style={styles.tabContent}>
              <h3 style={styles.sidebarTitle}>Online Users</h3>
              <div style={styles.userList}>
                {onlineUserProfiles.length === 0 ? (
                  <p style={styles.emptyText}>No other users online</p>
                ) : (
                  onlineUserProfiles.map((profile) => (
                    <div key={profile.uid} style={styles.userItem}>
                      <div style={styles.userInfo}>
                        <div style={{ ...styles.statusDot, background: getStatusColor(profile.status) }} />
                        <span style={styles.userUsername}>{profile.username}</span>
                      </div>
                      <button
                        onClick={() => handleSendChatRequest(profile.uid, profile.username)}
                        style={styles.chatButton}
                      >
                        Chat
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "friends" && (
            <div style={styles.tabContent}>
              <h3 style={styles.sidebarTitle}>Friends</h3>
              <div style={styles.userList}>
                {friends.length === 0 ? (
                  <p style={styles.emptyText}>No friends yet</p>
                ) : (
                  friends.map((friend) => (
                    <div key={friend.id} style={styles.userItem}>
                      <div style={styles.userInfo}>
                        <div
                          style={{
                            ...styles.statusDot,
                            background: getStatusColor(friendStatuses[friend.id]),
                          }}
                        />
                        <div>
                          <div style={styles.userUsername}>{friend.username}</div>
                          <div style={styles.statusTextSmall}>{getStatusText(friendStatuses[friend.id])}</div>
                        </div>
                      </div>
                      <button onClick={() => handleChatWithFriend(friend)} style={styles.chatButton}>
                        Chat
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "blocked" && (
            <div style={styles.tabContent}>
              <h3 style={styles.sidebarTitle}>Blocked Users</h3>
              <div style={styles.userList}>
                {blockedUsers.length === 0 ? (
                  <p style={styles.emptyText}>No blocked users</p>
                ) : (
                  blockedUsers.map((blocked) => (
                    <div key={blocked.uid} style={styles.userItem}>
                      <span style={styles.userUsername}>{blocked.username}</span>
                      <button onClick={() => handleUnblockUser(blocked.uid)} style={styles.unblockButton}>
                        Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
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
  },
  header: {
    background: "rgba(255, 255, 255, 0.95)",
    padding: "20px 40px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
  },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#667eea",
    margin: "0",
  },
  username: {
    color: "#666",
    margin: "4px 0 0 0",
  },
  headerButtons: {
    display: "flex",
    gap: "12px",
  },
  friendsButton: {
    padding: "10px 24px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  logoutButton: {
    padding: "10px 24px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  content: {
    display: "flex",
    gap: "24px",
    padding: "40px",
    maxWidth: "1400px",
    margin: "0 auto",
  },
  mainSection: {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "48px",
    textAlign: "center",
    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
  },
  cardTitle: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "12px",
  },
  cardDescription: {
    color: "#666",
    fontSize: "16px",
    marginBottom: "32px",
  },
  enterButton: {
    padding: "16px 48px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "18px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "transform 0.2s",
  },
  statsCard: {
    background: "white",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
  },
  statItem: {
    textAlign: "center",
  },
  statNumber: {
    fontSize: "48px",
    fontWeight: "bold",
    color: "#667eea",
  },
  statLabel: {
    color: "#666",
    fontSize: "16px",
    marginTop: "8px",
  },
  sidebar: {
    width: "360px",
    background: "white",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
    maxHeight: "calc(100vh - 160px)",
    display: "flex",
    flexDirection: "column",
  },
  tabs: {
    display: "flex",
    gap: "8px",
    marginBottom: "20px",
  },
  tab: {
    flex: "1",
    padding: "10px",
    background: "#f0f0f0",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    color: "#666",
  },
  activeTab: {
    background: "#667eea",
    color: "white",
  },
  tabContent: {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  sidebarTitle: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "20px",
  },
  userList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    overflowY: "auto",
    flex: "1",
  },
  emptyText: {
    color: "#999",
    textAlign: "center",
    padding: "20px",
  },
  userItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    background: "#f8f9fa",
    borderRadius: "8px",
    transition: "background 0.2s",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  statusDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  userUsername: {
    fontWeight: "600",
    color: "#333",
  },
  statusTextSmall: {
    fontSize: "11px",
    color: "#666",
    marginTop: "2px",
  },
  chatButton: {
    padding: "6px 16px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  unblockButton: {
    padding: "6px 16px",
    background: "#2ecc71",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
}
