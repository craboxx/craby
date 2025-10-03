"use client"

import { useState, useEffect, useRef } from "react"
import {
  listenToMessages,
  sendMessage,
  endChatRoom,
  getActiveChatRoom,
  sendFriendRequest,
  blockUser,
  listenToChatRoom,
  setUserPresence,
  reportUser, // Added reportUser import
} from "../firebase/firestore"

export default function ChatRoom({ user, userProfile, chatRoomId, onChatEnded, onEndChatPermanently }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [chatRoom, setChatRoom] = useState(null)
  const [partnerName, setPartnerName] = useState("")
  const [partnerId, setPartnerId] = useState("")
  const [requestSent, setRequestSent] = useState(false)
  const [partnerLeft, setPartnerLeft] = useState(false)
  const messagesEndRef = useRef(null)
  const endChatClickedRef = useRef(false)

  useEffect(() => {
    const loadChatRoom = async () => {
      const room = await getActiveChatRoom(user.uid)
      if (room) {
        setChatRoom(room)
        const otherUserId = room.participants.find((id) => id !== user.uid)
        setPartnerId(otherUserId)
        setPartnerName(room.participantNames[otherUserId])
      }
    }

    loadChatRoom()

    setUserPresence(user.uid, "in-chat")

    return () => {
      if (!endChatClickedRef.current) {
        setUserPresence(user.uid, "online")
      }
    }
  }, [chatRoomId, user.uid])

  useEffect(() => {
    if (!chatRoomId) return

    const unsubscribe = listenToChatRoom(chatRoomId, (room) => {
      if ((!room || !room.active) && !endChatClickedRef.current) {
        console.log("[v0] Chat room ended, partner left")
        setPartnerLeft(true)

        // Auto-return to waiting queue after 2 seconds
        setTimeout(() => {
          onChatEnded("partner-left")
        }, 2000)
      }
    })

    return () => unsubscribe()
  }, [chatRoomId, onChatEnded])

  useEffect(() => {
    if (!chatRoomId) return

    const unsubscribe = listenToMessages(chatRoomId, (msgs) => {
      setMessages(msgs)
    })

    return () => unsubscribe()
  }, [chatRoomId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || partnerLeft) return

    await sendMessage(chatRoomId, user.uid, userProfile.username, newMessage)
    setNewMessage("")
  }

  const handleSkip = async () => {
    console.log("[v0] User clicked Skip, returning to waiting queue")
    await endChatRoom(chatRoomId)
    await setUserPresence(user.uid, "online")
    onChatEnded("skip")
  }

  const handleSendFriendRequest = async () => {
    if (!partnerId || requestSent) return

    try {
      await sendFriendRequest(user.uid, userProfile.username, partnerId, partnerName)
      setRequestSent(true)
      alert(`Friend request sent to ${partnerName}!`)
    } catch (error) {
      console.error("Error sending friend request:", error)
      alert("Failed to send friend request")
    }
  }

  const handleBlockUser = async () => {
    if (!partnerId) return

    const confirmed = window.confirm(`Are you sure you want to block ${partnerName}?`)
    if (!confirmed) return

    try {
      await blockUser(user.uid, partnerId, partnerName)
      await endChatRoom(chatRoomId)
      alert(`${partnerName} has been blocked`)
      onChatEnded()
    } catch (error) {
      console.error("Error blocking user:", error)
      alert("Failed to block user")
    }
  }

  const handleEndChat = async () => {
    console.log("[v0] User clicked End Chat, returning to home permanently")
    endChatClickedRef.current = true

    onEndChatPermanently()

    await endChatRoom(chatRoomId)
    await setUserPresence(user.uid, "online")

    onChatEnded("end")
  }

  const handleReportUser = async () => {
    if (!partnerId) return

    const reason = window.prompt(`Why are you reporting ${partnerName}?\n\nPlease provide a reason:`)
    if (!reason || !reason.trim()) return

    try {
      await reportUser(user.uid, userProfile.username, partnerId, partnerName, reason.trim(), chatRoomId)
      alert(`${partnerName} has been reported. Thank you for helping keep our community safe.`)
    } catch (error) {
      console.error("Error reporting user:", error)
      alert("Failed to report user. Please try again.")
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.chatContainer}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>
              Chatting with {partnerName}
              {partnerLeft && <span style={styles.leftIndicator}> (Left)</span>}
            </h2>
            <p style={styles.subtitle}>Be respectful and have fun!</p>
          </div>
          <div style={styles.headerButtons}>
            <button onClick={handleSendFriendRequest} disabled={requestSent || partnerLeft} style={styles.friendButton}>
              {requestSent ? "Request Sent" : "Add Friend"}
            </button>
            <button onClick={handleReportUser} disabled={partnerLeft} style={styles.reportButton}>
              Report
            </button>
            <button onClick={handleBlockUser} disabled={partnerLeft} style={styles.blockButton}>
              Block
            </button>
            <button onClick={handleSkip} disabled={partnerLeft} style={styles.skipButton}>
              Skip
            </button>
            <button onClick={handleEndChat} style={styles.endButton}>
              End Chat
            </button>
          </div>
        </div>

        {partnerLeft && (
          <div style={styles.warningBar}>
            Your chat partner has left the conversation. Returning to waiting queue...
          </div>
        )}

        <div style={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div style={styles.emptyState}>
              <p>No messages yet. Say hi!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  ...styles.messageWrapper,
                  justifyContent: msg.senderId === user.uid ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    ...styles.message,
                    background: msg.senderId === user.uid ? "#667eea" : "#f0f0f0",
                    color: msg.senderId === user.uid ? "white" : "#333",
                  }}
                >
                  <div style={styles.messageSender}>{msg.senderName}</div>
                  <div style={styles.messageText}>{msg.message}</div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} style={styles.inputContainer}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={partnerLeft ? "Chat ended" : "Type a message..."}
            style={styles.input}
            disabled={partnerLeft}
          />
          <button type="submit" style={styles.sendButton} disabled={partnerLeft}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
  },
  chatContainer: {
    width: "100%",
    maxWidth: "900px",
    height: "80vh",
    background: "white",
    borderRadius: "16px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: "20px 24px",
    borderBottom: "2px solid #f0f0f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#fafafa",
  },
  title: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#333",
    margin: "0",
  },
  leftIndicator: {
    color: "#e74c3c",
    fontSize: "16px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666",
    margin: "4px 0 0 0",
  },
  headerButtons: {
    display: "flex",
    gap: "8px",
  },
  friendButton: {
    padding: "8px 16px",
    background: "#2ecc71",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  reportButton: {
    padding: "8px 16px",
    background: "#e67e22",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  blockButton: {
    padding: "8px 16px",
    background: "#95a5a6",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  skipButton: {
    padding: "8px 16px",
    background: "#f39c12",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  endButton: {
    padding: "8px 16px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  warningBar: {
    background: "#e74c3c",
    color: "white",
    padding: "10px",
    textAlign: "center",
    fontSize: "14px",
    fontWeight: "600",
  },
  messagesContainer: {
    flex: "1",
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  emptyState: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    color: "#999",
  },
  messageWrapper: {
    display: "flex",
    width: "100%",
  },
  message: {
    maxWidth: "70%",
    padding: "12px 16px",
    borderRadius: "12px",
    wordWrap: "break-word",
  },
  messageSender: {
    fontSize: "12px",
    fontWeight: "600",
    marginBottom: "4px",
    opacity: "0.8",
  },
  messageText: {
    fontSize: "15px",
    lineHeight: "1.4",
  },
  inputContainer: {
    padding: "20px 24px",
    borderTop: "2px solid #f0f0f0",
    display: "flex",
    gap: "12px",
    background: "#fafafa",
  },
  input: {
    flex: "1",
    padding: "12px 16px",
    border: "2px solid #e0e0e0",
    borderRadius: "8px",
    fontSize: "15px",
    outline: "none",
  },
  sendButton: {
    padding: "12px 32px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },
}
