"use client"

import { useState, useEffect } from "react"
import {
  listenToOnlineUsers,
  getUserProfile,
  sendChatRequest,
  listenToChatRequests,
  getBlockedUsers,
  getBlockedByUsers,
  unblockUser,
  getFriends,
  listenToPresence,
  isUserBlocked,
  isUserBlockedBy,
} from "../firebase/firestore"

export default function Home({
  user,
  userProfile,
  onEnterChat,
  onViewFriends,
  onLogout,
  onStartDirectChat,
  onViewGroups,
}) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [onlineUserProfiles, setOnlineUserProfiles] = useState([])
  const [chatRequests, setChatRequests] = useState([])
  const [blockedUsers, setBlockedUsers] = useState([])
  const [blockedByUsers, setBlockedByUsers] = useState([])
  const [friends, setFriends] = useState([])
  const [friendStatuses, setFriendStatuses] = useState({})
  const [activeTab, setActiveTab] = useState("online")
  const [showMobileMenu, setShowMobileMenu] = useState(false)

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
    let isMounted = true
    const unsubscribers = []

    // Listen to online users
    const unsubscribeOnline = listenToOnlineUsers(async (users) => {
      if (!isMounted) return
      const otherUsers = users.filter((u) => u.uid !== user.uid)
      setOnlineUsers(otherUsers)

      const profiles = await Promise.all(
        otherUsers.map(async (u) => {
          const profile = await getUserProfile(u.uid)
          return profile ? { ...profile, status: u.status } : null
        }),
      )
      if (isMounted) {
        setOnlineUserProfiles(profiles.filter((p) => p !== null))
      }
    })
    unsubscribers.push(unsubscribeOnline)

    // Listen to chat requests
    const unsubscribeRequests = listenToChatRequests(user.uid, (requests) => {
      if (isMounted) {
        setChatRequests(requests)
      }
    })
    unsubscribers.push(unsubscribeRequests)

    // Load blocked users and blocked by users
    const loadBlockingData = async () => {
      const blocked = await getBlockedUsers(user.uid)
      const blockedBy = await getBlockedByUsers(user.uid)
      if (isMounted) {
        setBlockedUsers(blocked)
        setBlockedByUsers(blockedBy)
      }
    }
    loadBlockingData()

    // Load friends and their presence
    const loadFriendsWithPresence = async () => {
      const friendsList = await getFriends(user.uid)
      if (isMounted) {
        setFriends(friendsList)

        const friendUnsubscribers = []
        friendsList.forEach((friend) => {
          const unsubPresence = listenToPresence(friend.id, (status) => {
            if (isMounted) {
              setFriendStatuses((prev) => ({
                ...prev,
                [friend.id]: status,
              }))
            }
          })
          friendUnsubscribers.push(unsubPresence)
        })
        unsubscribers.push(...friendUnsubscribers)
      }
    }

    loadFriendsWithPresence()

    return () => {
      isMounted = false
      unsubscribers.forEach((unsub) => {
        if (typeof unsub === "function") {
          unsub()
        }
      })
    }
  }, [user.uid])

  const handleSendChatRequest = async (toUid, toUsername) => {
    try {
      const iBlockedThem = await isUserBlocked(user.uid, toUid)
      const theyBlockedMe = await isUserBlockedBy(user.uid, toUid)

      if (iBlockedThem) {
        alert("You have blocked this user")
        return
      }

      if (theyBlockedMe) {
        alert("This user has blocked you")
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
      const iBlockedThem = await isUserBlocked(user.uid, friend.id)
      const theyBlockedMe = await isUserBlockedBy(user.uid, friend.id)

      if (iBlockedThem || theyBlockedMe) {
        alert("Cannot chat with this user due to blocking")
        return
      }

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
    <div className="home-container">
      <div className="home-mobile-nav">
        <h1 className="home-mobile-title">CRABY</h1>
        <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="home-mobile-menu-btn">
          ☰
        </button>
      </div>

      {showMobileMenu && (
        <div className="home-mobile-menu">
          <button onClick={onViewFriends} className="home-mobile-menu-item">
            Friends
          </button>
          <button onClick={onViewGroups} className="home-mobile-menu-item">
            Groups
          </button>
          <button onClick={onLogout} className="home-mobile-menu-item">
            Logout
          </button>
        </div>
      )}

      <div className="home-header">
        <div>
          <h1 className="home-title">CRABY</h1>
          <p className="home-username">Welcome, {userProfile.username}</p>
        </div>
        <div className="home-header-buttons">
          <button onClick={onViewFriends} className="home-friends-btn">
            Friends
          </button>
          <button onClick={onViewGroups} className="home-groups-btn">
            Groups
          </button>
          <button onClick={onLogout} className="home-logout-btn">
            Logout
          </button>
        </div>
      </div>

      <div className="home-content">
        <div className="home-main-section">
          <div className="home-card">
            <h2 className="home-card-title">Start Random Chat</h2>
            <p className="home-card-description">Connect with random people around the world</p>
            <button onClick={onEnterChat} className="home-enter-btn">
              Enter to Chat
            </button>
          </div>

          <div className="home-stats-card">
            <div className="home-stat-item">
              <div className="home-stat-number">{onlineUsers.length}</div>
              <div className="home-stat-label">Users Online</div>
            </div>
          </div>
        </div>

        <div className="home-sidebar">
          <div className="home-tabs">
            <button
              onClick={() => setActiveTab("online")}
              className={`home-tab ${activeTab === "online" ? "home-tab-active" : ""}`}
            >
              Online
            </button>
            <button
              onClick={() => setActiveTab("friends")}
              className={`home-tab ${activeTab === "friends" ? "home-tab-active" : ""}`}
            >
              Friends
            </button>
            <button
              onClick={() => setActiveTab("blocked")}
              className={`home-tab ${activeTab === "blocked" ? "home-tab-active" : ""}`}
            >
              Blocked
            </button>
          </div>

          {activeTab === "online" && (
            <div className="home-tab-content">
              <h3 className="home-sidebar-title">Online Users</h3>
              <div className="home-user-list">
                {onlineUserProfiles.length === 0 ? (
                  <p className="home-empty-text">No other users online</p>
                ) : (
                  onlineUserProfiles.map((profile) => {
                    const iBlockedThem = blockedUsers.some((b) => b.uid === profile.uid)
                    const theyBlockedMe = blockedByUsers.some((b) => b.uid === profile.uid)
                    const isBlocked = iBlockedThem || theyBlockedMe

                    return (
                      <div key={profile.uid} className="home-user-item">
                        <div className="home-user-info">
                          <div className="home-status-dot" style={{ background: getStatusColor(profile.status) }} />
                          <span className="home-user-username">{profile.username}</span>
                        </div>
                        <button
                          onClick={() => (!isBlocked ? handleSendChatRequest(profile.uid, profile.username) : null)}
                          className={`home-chat-btn ${isBlocked ? "home-chat-btn-disabled" : ""}`}
                          disabled={isBlocked}
                          title={
                            iBlockedThem
                              ? "You have blocked this user"
                              : theyBlockedMe
                                ? "This user has blocked you"
                                : "Chat"
                          }
                        >
                          Chat
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === "friends" && (
            <div className="home-tab-content">
              <h3 className="home-sidebar-title">Friends</h3>
              <div className="home-user-list">
                {friends.length === 0 ? (
                  <p className="home-empty-text">No friends yet</p>
                ) : (
                  friends.map((friend) => {
                    const iBlockedThem = blockedUsers.some((b) => b.uid === friend.id)
                    const theyBlockedMe = blockedByUsers.some((b) => b.uid === friend.id)
                    const isBlocked = iBlockedThem || theyBlockedMe

                    return (
                      <div key={friend.id} className="home-user-item">
                        <div className="home-user-info">
                          <div
                            className="home-status-dot"
                            style={{ background: getStatusColor(friendStatuses[friend.id]) }}
                          />
                          <div>
                            <div className="home-user-username">{friend.username}</div>
                            <div className="home-status-text-small">{getStatusText(friendStatuses[friend.id])}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => (!isBlocked ? handleChatWithFriend(friend) : null)}
                          className={`home-chat-btn ${isBlocked ? "home-chat-btn-disabled" : ""}`}
                          disabled={isBlocked}
                          title={
                            iBlockedThem
                              ? "You have blocked this user"
                              : theyBlockedMe
                                ? "This user has blocked you"
                                : "Chat"
                          }
                        >
                          Chat
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === "blocked" && (
            <div className="home-tab-content">
              <h3 className="home-sidebar-title">Blocked Users</h3>
              <div className="home-user-list">
                {blockedUsers.length === 0 ? (
                  <p className="home-empty-text">No blocked users</p>
                ) : (
                  blockedUsers.map((blocked) => (
                    <div key={blocked.uid} className="home-user-item">
                      <span className="home-user-username">{blocked.username}</span>
                      <button onClick={() => handleUnblockUser(blocked.uid)} className="home-unblock-btn">
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
