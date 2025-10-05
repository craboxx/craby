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
  reportUser,
  parseMentions,
} from "../firebase/firestore"

export default function ChatRoom({ user, userProfile, chatRoomId, onChatEnded, onEndChatPermanently }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [chatRoom, setChatRoom] = useState(null)
  const [partnerName, setPartnerName] = useState("")
  const [partnerId, setPartnerId] = useState("")
  const [requestSent, setRequestSent] = useState(false)
  const [partnerLeft, setPartnerLeft] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
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

    // Parse mentions from message (for one-on-one chat, only partner can be mentioned)
    const availableUsers = [
      { uid: user.uid, username: userProfile.username },
      { uid: partnerId, username: partnerName },
    ]
    const mentions = parseMentions(newMessage, availableUsers)

    await sendMessage(chatRoomId, user.uid, userProfile.username, newMessage, mentions)
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

  const isMessageMentioningMe = (message) => {
    return message.mentions?.includes(user.uid)
  }

  const highlightMentions = (text) => {
    return text.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>')
  }

  return (
    <div className="chat-container">
      <div className="chat-mobile-nav">
        <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="chat-mobile-menu-btn">
          ☰
        </button>
        <h2 className="chat-mobile-title">
          {partnerName}
          {partnerLeft && <span className="chat-left-indicator"> (Left)</span>}
        </h2>
      </div>

      <div className="chat-box">
        <div className="chat-header">
          <div>
            <h2 className="chat-title">
              Chatting with {partnerName}
              {partnerLeft && <span className="chat-left-indicator"> (Left)</span>}
            </h2>
            <p className="chat-subtitle">Be respectful and have fun!</p>
          </div>
          <div className="chat-header-buttons">
            <button onClick={handleSendFriendRequest} disabled={requestSent || partnerLeft} className="chat-friend-btn">
              {requestSent ? "Request Sent" : "Add Friend"}
            </button>
            <button onClick={handleReportUser} disabled={partnerLeft} className="chat-report-btn">
              Report
            </button>
            <button onClick={handleBlockUser} disabled={partnerLeft} className="chat-block-btn">
              Block
            </button>
            <button onClick={handleSkip} disabled={partnerLeft} className="chat-skip-btn">
              Skip
            </button>
            <button onClick={handleEndChat} className="chat-end-btn">
              End Chat
            </button>
          </div>
        </div>

        {showMobileMenu && (
          <div className="chat-mobile-menu">
            <button
              onClick={handleSendFriendRequest}
              disabled={requestSent || partnerLeft}
              className="chat-mobile-menu-item"
            >
              {requestSent ? "Request Sent" : "Add Friend"}
            </button>
            <button onClick={handleReportUser} disabled={partnerLeft} className="chat-mobile-menu-item">
              Report
            </button>
            <button onClick={handleBlockUser} disabled={partnerLeft} className="chat-mobile-menu-item">
              Block
            </button>
            <button onClick={handleSkip} disabled={partnerLeft} className="chat-mobile-menu-item">
              Skip
            </button>
            <button onClick={handleEndChat} className="chat-mobile-menu-item">
              End Chat
            </button>
          </div>
        )}

        {partnerLeft && (
          <div className="chat-warning-bar">
            Your chat partner has left the conversation. Returning to waiting queue...
          </div>
        )}

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <p>No messages yet. Say hi!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message-wrapper ${msg.senderId === user.uid ? "chat-message-right" : "chat-message-left"}`}
              >
                <div
                  className={`chat-message ${msg.senderId === user.uid ? "chat-message-sent" : "chat-message-received"} ${isMessageMentioningMe(msg) ? "chat-message-mentioned" : ""}`}
                >
                  <div className="chat-message-sender">{msg.senderName}</div>
                  <div
                    className="chat-message-text"
                    dangerouslySetInnerHTML={{ __html: highlightMentions(msg.message) }}
                  />
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="chat-input-container">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={partnerLeft ? "Chat ended" : "Type a message..."}
            className="chat-input"
            disabled={partnerLeft}
          />
          <button type="submit" className="chat-send-btn" disabled={partnerLeft}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
