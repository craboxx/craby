"use client"

import { useState, useEffect } from "react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { auth } from "./firebase/firebaseConfig"
import { getUserProfile, setUserPresence, listenToAcceptedChatRequests } from "./firebase/firestore"
import Auth from "./components/Auth"
import Home from "./components/Home"
import ChatRoom from "./components/ChatRoom"
import Waiting from "./components/Waiting"
import Friends from "./components/Friends"
import ChatRequestModal from "./components/ChatRequestModal"

function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState("home") // "home", "waiting", "chat", "friends"
  const [chatRoomId, setChatRoomId] = useState(null)
  const [isEndingChat, setIsEndingChat] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const profile = await getUserProfile(firebaseUser.uid)
        setUserProfile(profile)

        setUserPresence(firebaseUser.uid, "online")
      } else {
        setUser(null)
        setUserProfile(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return

    const unsubscribe = listenToAcceptedChatRequests(user.uid, (chatRoomId) => {
      console.log("[v0] Chat request accepted, starting chat for requester:", chatRoomId)
      handleStartDirectChat(chatRoomId)
    })

    return () => unsubscribe()
  }, [user])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user) {
        setUserPresence(user.uid, "offline")
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [user])

  const handleLogout = async () => {
    if (user) {
      setUserPresence(user.uid, "offline")
    }
    await signOut(auth)
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
      if (user) {
        setUserPresence(user.uid, "online")
      }
    } else {
      console.log("[v0] Returning to home (End Chat)")
      setIsEndingChat(false)
      setCurrentView("home")
      if (user) {
        setUserPresence(user.uid, "online")
      }
    }
  }

  const handleViewFriends = () => {
    setCurrentView("friends")
  }

  const handleBackToHome = () => {
    setCurrentView("home")
    if (user) {
      setUserPresence(user.uid, "online")
    }
  }

  const handleStartDirectChat = (roomId) => {
    console.log("[v0] Starting direct chat with room:", roomId)
    setIsEndingChat(false)
    setChatRoomId(roomId)
    setCurrentView("chat")
    if (user) {
      setUserPresence(user.uid, "in-chat")
    }
  }

  const handleChatRequestAccepted = (roomId) => {
    console.log("[v0] Chat request accepted, starting chat:", roomId)
    handleStartDirectChat(roomId)
  }

  const handleEndChatPermanently = () => {
    console.log("[v0] User clicked End Chat, setting flag to prevent waiting queue")
    setIsEndingChat(true)
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <h2>Loading...</h2>
      </div>
    )
  }

  if (!user || !userProfile) {
    return <Auth onAuthSuccess={() => setLoading(false)} />
  }

  return (
    <div style={styles.app}>
      <ChatRequestModal user={user} userProfile={userProfile} onChatAccepted={handleChatRequestAccepted} />

      {currentView === "home" && (
        <Home
          user={user}
          userProfile={userProfile}
          onEnterChat={handleEnterChat}
          onViewFriends={handleViewFriends}
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
