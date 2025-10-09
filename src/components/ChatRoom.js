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
  listenToTicTacToeGame,
  sendTicTacToeRequest,
  acceptTicTacToeRequest,
  declineTicTacToeRequest,
  makeTicTacToeMove,
  startTicTacToeRematch, // add
  closeTicTacToeGame, // add
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
  const [tttGame, setTttGame] = useState(null)
  const [showTttModal, setShowTttModal] = useState(false)
  const [tttRequestSent, setTttRequestSent] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

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
    if (!chatRoomId) return

    const unsubscribe = listenToTicTacToeGame(chatRoomId, (game) => {
      setTttGame(game)

      if (game && game.status === "active") {
        setShowTttModal(true)
      }

      if (game && (game.status === "won" || game.status === "draw")) {
        setShowTttModal(true)
        setCelebrate(true)
        setTimeout(() => setCelebrate(false), 3000) // was 2000
      }
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

  const handleSendTicTacToe = async () => {
    if (!partnerId || partnerLeft) return
    try {
      await sendTicTacToeRequest(chatRoomId, user.uid, partnerId)
      setTttRequestSent(true)
    } catch (e) {
      console.error("[v0] Failed to send Tic Tac Toe request", e)
      alert("Failed to send Tic Tac Toe request.")
    }
  }

  const handleAcceptTicTacToe = async () => {
    try {
      await acceptTicTacToeRequest(chatRoomId, user.uid)
    } catch (e) {
      console.error("[v0] Failed to accept Tic Tac Toe request", e)
    }
  }

  const handleDeclineTicTacToe = async () => {
    try {
      await declineTicTacToeRequest(chatRoomId, user.uid)
    } catch (e) {
      console.error("[v0] Failed to decline Tic Tac Toe request", e)
    }
  }

  const handleCellTap = async (idx) => {
    if (!tttGame || tttGame.status !== "active") return
    if (tttGame.currentTurn !== user.uid) return
    if (!Array.isArray(tttGame.board) || tttGame.board[idx] !== null) return
    try {
      await makeTicTacToeMove(chatRoomId, user.uid, idx)
    } catch (e) {
      console.error("[v0] Failed to make move", e)
    }
  }

  const isMessageMentioningMe = (message) => {
    return message.mentions?.includes(user.uid)
  }

  const highlightMentions = (text) => {
    return text.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>')
  }

  const mySymbol = tttGame?.symbols?.[user.uid] || null
  const partnerSymbol = tttGame && partnerId ? tttGame.symbols?.[partnerId] : null
  const iAmWinner = tttGame?.status === "won" && tttGame?.winnerUid === user.uid
  const iAmLoser = tttGame?.status === "won" && tttGame?.winnerUid && tttGame?.winnerUid !== user.uid
  const myScore = tttGame?.scores?.[user.uid] || 0
  const partnerScore = (partnerId && tttGame?.scores?.[partnerId]) || 0

  const handleCloseTtt = async () => {
    try {
      await closeTicTacToeGame(chatRoomId)
    } catch (e) {
      console.error("[v0] Failed to close Tic Tac Toe", e)
    } finally {
      setShowTttModal(false)
    }
  }

  const handleReplayTtt = async () => {
    try {
      await startTicTacToeRematch(chatRoomId, user.uid)
    } catch (e) {
      console.error("[v0] Failed to start rematch", e)
    }
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

      <div
        className="chat-box"
        style={
          celebrate
            ? iAmWinner
              ? { boxShadow: "0 0 0 4px rgba(16,185,129,0.5)", transition: "box-shadow 200ms" }
              : iAmLoser
                ? { boxShadow: "0 0 0 4px rgba(239,68,68,0.5)", transition: "box-shadow 200ms" }
                : undefined
            : undefined
        }
      >
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
            <button onClick={handleSendTicTacToe} disabled={partnerLeft} className="Tic-Tac-btn">
              Tic Tac Toe
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

        {tttGame && tttGame.status === "request" && tttGame.responderId === user.uid && (
          <div className="chat-warning-bar">
            Tic Tac Toe request received. Accept?
            <button onClick={handleAcceptTicTacToe} className="chat-send-btn" style={{ marginLeft: 8 }}>
              Accept
            </button>
            <button onClick={handleDeclineTicTacToe} className="chat-block-btn" style={{ marginLeft: 8 }}>
              Decline
            </button>
          </div>
        )}

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
            <button onClick={handleSendTicTacToe} disabled={partnerLeft} className="chat-mobile-menu-item">
              Tic Tac Toe
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

{showTttModal &&
  tttGame &&
  (tttGame.status === "active" || tttGame.status === "won" || tttGame.status === "draw") && (
    <div
      role="dialog"
      aria-modal="true"
      className="ttt-modal-overlay"
      onClick={() => setShowTttModal(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        className="ttt-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#0f172a",
          color: "#F9FAFB",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          position: "relative",
          overflow: "hidden",
          transition: "all 0.4s ease",
        }}
      >
        <style>{`
          @keyframes ttt-burst {
            0% { transform: translateY(0) scale(0.8); opacity: 0.9; }
            100% { transform: translateY(60px) scale(1.3); opacity: 0; }
          }
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 8px rgba(255,255,255,0.2); }
            100% { box-shadow: 0 0 16px rgba(255,255,255,0.6); }
          }
          .pulse-glow { animation: pulseGlow 2s infinite alternate; }

          .winner-cell { background: rgba(16,185,129,0.2) !important; box-shadow: 0 0 16px #10B98199 inset; }
          .loser-cell { background: rgba(239,68,68,0.15) !important; box-shadow: 0 0 16px #EF444499 inset; }
          .draw-cell { background: rgba(251,191,36,0.15) !important; box-shadow: 0 0 16px #FBBF2499 inset; }

          .ttt-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            font-weight: 700;
            color: white;
            backdrop-filter: blur(6px);
            animation: fadeInOut 2s ease-in-out forwards;
            pointer-events: none;
          }
          @keyframes fadeInOut {
            0% { opacity: 0; transform: scale(0.9); }
            20% { opacity: 1; transform: scale(1); }
            80% { opacity: 1; }
            100% { opacity: 0; transform: scale(0.9); }
          }
        `}</style>

        {(() => {
          const themes = [
            { primary: "#3B82F6", secondary: "#1E3A8A", cellShape: "10%" },
            { primary: "#10B981", secondary: "#064E3B", cellShape: "20%" },
            { primary: "#F59E0B", secondary: "#78350F", cellShape: "40%" },
            { primary: "#8B5CF6", secondary: "#4C1D95", cellShape: "0%" },
            { primary: "#EF4444", secondary: "#7F1D1D", cellShape: "25%" },
          ];
          const theme = themes[(myScore + partnerScore) % themes.length];

          return (
            <>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.primary }}>🧩 Tic Tac Toe</h3>
                <button
                  onClick={handleCloseTtt}
                  style={{
                    background: theme.primary,
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "6px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "0.3s",
                  }}
                >
                  ✖ Close
                </button>
              </div>

              {/* Scoreboard */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: theme.secondary,
                  borderRadius: 10,
                  padding: "8px 12px",
                  marginBottom: 10,
                  boxShadow: `0 0 10px ${theme.primary}55 inset`,
                }}
              >
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{user.displayName || "You"}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#10B981" }}>{myScore}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: theme.primary }}>⚔️</div>
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{partnerName}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#3B82F6" }}>{partnerScore}</div>
                </div>
              </div>

              {/* Symbol + Turn (Left-aligned turn) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 14,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color:
                      tttGame.currentTurn === user.uid
                        ? "#10B981"
                        : "#EF4444",
                    minWidth: 80,
                    textAlign: "right",
                  }}
                >
                  {tttGame.status === "active" &&
                    (tttGame.currentTurn === user.uid
                      ? "Your Turn"
                      : `${partnerName}'s Turn`)}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: theme.primary }}>
                  {mySymbol === "X" ? "❌" : "⭕"}
                </div>
              </div>

              {/* Game Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                }}
              >
                {(tttGame.board || Array(9).fill(null)).map((cell, idx) => {
                  const disabled =
                    tttGame.status !== "active" ||
                    tttGame.board?.[idx] !== null ||
                    tttGame.currentTurn !== user.uid;
                  const handleTap = () => !disabled && handleCellTap(idx);
                  const cellClass =
                    tttGame.status === "won"
                      ? iAmWinner && tttGame.winningLine?.includes(idx)
                        ? "winner-cell"
                        : !iAmWinner && tttGame.winningLine?.includes(idx)
                        ? "loser-cell"
                        : ""
                      : tttGame.status === "draw"
                      ? "draw-cell"
                      : "";
                  return (
                    <div
                      key={idx}
                      onClick={handleTap}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        handleTap();
                      }}
                      className={cellClass}
                      style={{
                        height: 84,
                        background: "#1E293B",
                        borderRadius: theme.cellShape,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 30,
                        fontWeight: 700,
                        cursor: disabled ? "not-allowed" : "pointer",
                        border: `2px solid ${theme.primary}55`,
                        color:
                          cell === "X"
                            ? "#10B981"
                            : cell === "O"
                            ? "#EF4444"
                            : "#F9FAFB",
                        transition: "all 0.25s ease",
                      }}
                    >
                      {cell || ""}
                    </div>
                  );
                })}
              </div>

              {/* Replay Button */}
              {(tttGame.status === "won" || tttGame.status === "draw") && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReplayTtt();
                    }}
                    style={{
                      background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`,
                      color: "white",
                      border: "none",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "0.3s",
                    }}
                  >
                    Play Again
                  </button>
                </div>
              )}

              {/* Result Overlay */}
              {tttGame.status !== "active" && (
                <div
                  className="ttt-overlay"
                  style={{
                    background:
                      tttGame.status === "won"
                        ? iAmWinner
                          ? "rgba(16,185,129,0.25)"
                          : "rgba(239,68,68,0.25)"
                        : "rgba(251,191,36,0.25)",
                  }}
                >
                  {tttGame.status === "draw"
                    ? "🤝 Draw!"
                    : iAmWinner
                    ? "🎉 You Won!"
                    : `😔 You Lose!`}
                </div>
              )}

              {/* Confetti */}
              {celebrate && (
                <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {Array.from({ length: 26 }).map((_, i) => {
                    const left = Math.random() * 100;
                    const top = Math.random() * 30;
                    const color = iAmWinner
                      ? "#10B981"
                      : tttGame.status === "draw"
                      ? "#FBBF24"
                      : "#EF4444";
                    const delay = Math.random() * 300;
                    return (
                      <div
                        key={i}
                        className="ttt-confetti"
                        style={{
                          position: "absolute",
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          left: `${left}%`,
                          top: `${top}%`,
                          background: color,
                          animation: `ttt-burst 900ms ease-out ${delay}ms forwards`,
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  )}


      </div>
    </div>
  )
}
