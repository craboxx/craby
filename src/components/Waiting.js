"use client"

import { useState, useEffect } from "react"
import {
  addToWaitingPool,
  removeFromWaitingPool,
  createChatRoomAtomic,
  getActiveChatRoom,
  setUserPresence,
  getExistingChatRoom,
  listenToWaitingPool,
} from "../firebase/firestore"

export default function Waiting({ user, userProfile, onChatStarted, onCancel }) {
  const [status, setStatus] = useState("Looking for a chat partner...")
  const [waitingCount, setWaitingCount] = useState(0)
  const [isMatching, setIsMatching] = useState(false)

  useEffect(() => {
    let unsubscribe = null
    let isActive = true
    let hasMatched = false
    let matchingAttempted = false

    const initializeWaiting = async () => {
      try {
        console.log("[v0] Initializing waiting for user:", user.uid)

        // Check if user already has an active chat
        const existingChat = await getActiveChatRoom(user.uid)
        if (existingChat && isActive) {
          console.log("[v0] Found existing active chat, connecting...")
          hasMatched = true
          setStatus("Partner found! Connecting...")
          setTimeout(() => {
            if (isActive) onChatStarted(existingChat.id)
          }, 300)
          return
        }

        // Set user presence to online
        await setUserPresence(user.uid, "online")

        // Add user to waiting pool
        await addToWaitingPool(user.uid, userProfile.username)
        console.log("[v0] Added to waiting pool")

        // Listen to waiting pool changes for real-time matching
        unsubscribe = listenToWaitingPool(async (waitingUsers) => {
          if (!isActive || hasMatched) return

          console.log("[v0] Waiting pool updated:", waitingUsers.length, "users")
          setWaitingCount(waitingUsers.length)

          // Check if current user is still in waiting pool
          const currentUser = waitingUsers.find((u) => u.uid === user.uid)

          if (!currentUser) {
            console.log("[v0] Current user removed from waiting pool, checking for active chat...")
            // User was removed from pool, likely matched - check for active chat
            const activeChat = await getActiveChatRoom(user.uid)
            if (activeChat && isActive && !hasMatched) {
              console.log("[v0] Found active chat room after removal, connecting...")
              hasMatched = true
              setStatus("Partner found! Connecting...")
              setTimeout(() => {
                if (isActive) onChatStarted(activeChat.id)
              }, 500)
            }
            return
          }

          const currentUserBlockedList = currentUser.blockedUsers || []

          // Try to find a match (need at least 2 users)
          if (waitingUsers.length >= 2 && !matchingAttempted) {
            // Find another user who is not blocked and not self
            const otherUser = waitingUsers.find(
              (u) =>
                u.uid !== user.uid &&
                !currentUserBlockedList.includes(u.uid) &&
                !(u.blockedUsers || []).includes(user.uid),
            )

            if (otherUser) {
              console.log("[v0] Found potential match:", otherUser.username)
              matchingAttempted = true
              setStatus("Partner found! Connecting...")

              try {
                // Check if chat room already exists between these two users
                const existingRoom = await getExistingChatRoom(user.uid, otherUser.uid)
                if (existingRoom) {
                  console.log("[v0] Using existing chat room:", existingRoom.id)
                  hasMatched = true
                  await removeFromWaitingPool(user.uid)
                  setTimeout(() => {
                    if (isActive) onChatStarted(existingRoom.id)
                  }, 300)
                  return
                }

                // Only the user with the smaller UID creates the room to prevent race conditions
                const shouldCreateRoom = user.uid < otherUser.uid

                if (shouldCreateRoom) {
                  console.log("[v0] Creating new chat room (I have smaller UID)")

                  // Create chat room atomically
                  const chatRoomId = await createChatRoomAtomic(
                    user.uid,
                    otherUser.uid,
                    userProfile.username,
                    otherUser.username,
                    "random",
                  )

                  console.log("[v0] Chat room created:", chatRoomId)
                  hasMatched = true

                  // Remove both users from waiting pool
                  await Promise.all([removeFromWaitingPool(user.uid), removeFromWaitingPool(otherUser.uid)])

                  // Connect to chat immediately
                  setTimeout(() => {
                    if (isActive) onChatStarted(chatRoomId)
                  }, 300)
                } else {
                  console.log("[v0] Waiting for other user to create room (they have smaller UID)")
                  // The other user will create the room
                  // Our listener will detect when we're removed from waiting pool
                  // and will find the active chat room
                }
              } catch (error) {
                console.error("[v0] Error during matching:", error)
                matchingAttempted = false
                setStatus("Error creating chat. Retrying...")
                setTimeout(() => {
                  if (isActive) setStatus("Looking for a chat partner...")
                }, 2000)
              }
            }
          }
        })
      } catch (error) {
        console.error("[v0] Error in waiting:", error)
        setStatus("Error joining waiting pool")
      }
    }

    initializeWaiting()

    return () => {
      console.log("[v0] Cleaning up waiting component")
      isActive = false
      if (unsubscribe) {
        unsubscribe()
      }
      // Clean up waiting pool on unmount only if not matched
      if (!hasMatched) {
        removeFromWaitingPool(user.uid).catch(console.error)
      }
    }
  }, [user.uid, userProfile.username, onChatStarted])

  const handleCancel = async () => {
    console.log("[v0] User cancelled waiting")
    await removeFromWaitingPool(user.uid)
    await setUserPresence(user.uid, "online")
    onCancel()
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <h2 style={styles.title}>{status}</h2>
        <p style={styles.subtitle}>
          {waitingCount > 1 ? `${waitingCount} users in waiting pool` : "Waiting for other users..."}
        </p>
        <button onClick={handleCancel} style={styles.cancelButton}>
          Cancel
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "48px",
    textAlign: "center",
    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
    maxWidth: "400px",
  },
  spinner: {
    width: "60px",
    height: "60px",
    border: "4px solid #f3f3f3",
    borderTop: "4px solid #667eea",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto 24px",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "12px",
  },
  subtitle: {
    color: "#666",
    marginBottom: "32px",
  },
  cancelButton: {
    padding: "12px 32px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
}

// Add keyframe animation
if (typeof document !== "undefined") {
  const style = document.createElement("style")
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(style)
}
