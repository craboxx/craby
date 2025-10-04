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
  isUserInActiveChat, // Import new function
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

        const alreadyInChat = await isUserInActiveChat(user.uid)
        if (alreadyInChat) {
          console.log("[v0] User is already in an active chat, redirecting...")
          const existingChat = await getActiveChatRoom(user.uid)
          if (existingChat && isActive) {
            hasMatched = true
            onChatStarted(existingChat.id)
            return
          }
        }

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
                const [currentUserInChat, otherUserInChat] = await Promise.all([
                  isUserInActiveChat(user.uid),
                  isUserInActiveChat(otherUser.uid),
                ])

                if (currentUserInChat || otherUserInChat) {
                  console.log("[v0] One of the users is already in a chat, aborting match")
                  matchingAttempted = false
                  setStatus("Looking for a chat partner...")
                  return
                }

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
    <div className="waiting-container">
      <div className="waiting-card">
        <div className="waiting-spinner" />
        <h2 className="waiting-title">{status}</h2>
        <p className="waiting-subtitle">
          {waitingCount > 1 ? `${waitingCount} users in waiting pool` : "Waiting for other users..."}
        </p>
        <button onClick={handleCancel} className="waiting-cancel-btn">
          Cancel
        </button>
      </div>
    </div>
  )
}
