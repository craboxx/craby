"use client"

import { useState, useEffect } from "react"
import { getUserProfile, setUserPresence, listenToAcceptedChatRequests } from "../firebase/firestore"
import Auth from "./Auth"
import Home from "./Home"
import ChatRoom from "./ChatRoom"
import Waiting from "./Waiting"
import Friends from "./Friends"
import ChatRequestModal from "./ChatRequestModal"
import GroupList from "./GroupList"
import GroupChat from "./GroupChat"
import GroupModal from "./GroupModal"
import GroupInviteNotification from "./GroupInviteNotification"

function App() {
  const [user, setUser] = useState(null) // { uid: nickname, nickname }
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState("home") // "home", "waiting", "chat", "friends", "groups", "group-chat"
  const [chatRoomId, setChatRoomId] = useState(null)
  const [isEndingChat, setIsEndingChat] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [joinGroupData, setJoinGroupData] = useState(null)

  // Initialize session from localStorage
  useEffect(() => {
    const init = async () => {
      const raw = localStorage.getItem("session")
      const session = raw ? JSON.parse(raw) : null
      if (session?.nickname) {
        const currentUser = { uid: session.nickname, nickname: session.nickname }
        setUser(currentUser)
        const profile = await getUserProfile(currentUser.uid)
        setUserProfile(profile)
        setUserPresence(currentUser.uid, "online")
      }
      setLoading(false)
    }
    init()
  }, [])

  // Listen for accepted chat requests
  useEffect(() => {
    if (!user) return
    const unsubscribe = listenToAcceptedChatRequests(user.uid, (roomId) => {
      console.log("[v0] Chat request accepted, starting chat for requester:", roomId)
      handleStartDirectChat(roomId)
    })
    return () => unsubscribe()
  }, [user])

  // Presence cleanup on tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user) setUserPresence(user.uid, "offline")
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [user])

  const handleAuthSuccess = async (nickname) => {
    localStorage.setItem("session", JSON.stringify({ nickname }))
    const currentUser = { uid: nickname, nickname }
    setUser(currentUser)
    const profile = await getUserProfile(currentUser.uid)
    setUserProfile(profile)
    setUserPresence(currentUser.uid, "online")
    setLoading(false)
  }

  const handleLogout = async () => {
    if (user) {
      setUserPresence(user.uid, "offline")
    }
    localStorage.removeItem("session")
    setUser(null)
    setUserProfile(null)
    setCurrentView("home")
  }

  const handleEnterChat = () => {
    setIsEndingChat(false)
    setCurrentView("waiting")
  }

  const handleChatStarted = (roomId) => {
    console.log("[v0] Chat started with room:", roomId)
    setIsEndingChat(false)
    setChatRoomId(roomId)
    setCurrentView("chat")
    if (user) {
      setUserPresence(user.uid, "in-chat")
    }
  }

  const handleChatEnded = (action) => {
    console.log("[v0] Chat ended with action:", action)
    setChatRoomId(null)

    if ((action === "skip" || action === "partner-left") && !isEndingChat) {
      console.log("[v0] Returning to waiting queue")
      setCurrentView("waiting")
      if (user) setUserPresence(user.uid, "online")
    } else {
      console.log("[v0] Returning to home (End Chat)")
      setIsEndingChat(false)
      setCurrentView("home")
      if (user) setUserPresence(user.uid, "online")
    }
  }

  const handleViewFriends = () => setCurrentView("friends")

  const handleBackToHome = () => {
    setCurrentView("home")
    if (user) setUserPresence(user.uid, "online")
  }

  const handleStartDirectChat = (roomId) => {
    console.log("[v0] Starting direct chat with room:", roomId)
    setIsEndingChat(false)
    setChatRoomId(roomId)
    setCurrentView("chat")
    if (user) setUserPresence(user.uid, "in-chat")
  }

  const handleChatRequestAccepted = (roomId) => {
    console.log("[v0] Chat request accepted, starting chat:", roomId)
    handleStartDirectChat(roomId)
  }

  const handleEndChatPermanently = () => {
    console.log("[v0] User clicked End Chat, setting flag to prevent waiting queue")
    setIsEndingChat(true)
  }

  const handleViewGroups = () => {
    setCurrentView("groups")
  }

  const handleSelectGroup = (group) => {
    setSelectedGroupId(group.id)
    setCurrentView("group-chat")
  }

  const handleCreateGroup = () => {
    setJoinGroupData(null)
    setShowGroupModal(true)
  }

  const handleJoinGroup = (group) => {
    setJoinGroupData(group)
    setShowGroupModal(true)
  }

  const handleGroupCreated = (groupId) => {
    setSelectedGroupId(groupId)
    setCurrentView("group-chat")
  }

  const handleBackToGroups = () => {
    setSelectedGroupId(null)
    setCurrentView("groups")
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>Loading...</h2>
      </div>
    )
  }

  if (!user || !userProfile) {
    return <Auth onAuthSuccess={handleAuthSuccess} />
  }

  return (
    <div style={styles.app}>
      <ChatRequestModal user={user} userProfile={userProfile} onChatAccepted={handleChatRequestAccepted} />

      <GroupInviteNotification user={user} onGroupJoined={(group) => handleSelectGroup(group)} />

      {showGroupModal && (
        <GroupModal
          user={user}
          onClose={() => setShowGroupModal(false)}
          onGroupCreated={handleGroupCreated}
          joinGroup={joinGroupData}
        />
      )}

      {currentView === "home" && (
        <Home
          user={user}
          userProfile={userProfile}
          onEnterChat={handleEnterChat}
          onViewFriends={handleViewFriends}
          onViewGroups={handleViewGroups}
          onLogout={handleLogout}
          onStartDirectChat={handleStartDirectChat}
        />
      )}

      {currentView === "waiting" && (
        <Waiting user={user} userProfile={userProfile} onChatStarted={handleChatStarted} onCancel={handleBackToHome} />
      )}

      {currentView === "chat" && chatRoomId && (
        <ChatRoom
          user={user}
          userProfile={userProfile}
          chatRoomId={chatRoomId}
          onChatEnded={handleChatEnded}
          onEndChatPermanently={handleEndChatPermanently}
        />
      )}

      {currentView === "friends" && <Friends user={user} userProfile={userProfile} onBack={handleBackToHome} />}

      {currentView === "groups" && (
        <GroupList
          user={user}
          onSelectGroup={handleSelectGroup}
          onCreateGroup={handleCreateGroup}
          onJoinGroup={handleJoinGroup}
          onBack={handleBackToHome}
        />
      )}

      {currentView === "group-chat" && selectedGroupId && (
        <GroupChat user={user} groupId={selectedGroupId} onBack={handleBackToGroups} />
      )}
    </div>
  )
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#f5f5f5",
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "#f5f5f5",
  },
}

export default App
