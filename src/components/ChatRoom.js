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
  startTicTacToeRematch,
  closeTicTacToeGame,
  // New game helpers
  listenToRpsGame,
  sendRpsRequest,
  acceptRpsRequest,
  declineRpsRequest,
  chooseRps,
  startRpsRematch,
  closeRpsGame,
  listenToBingoGame,
  sendBingoRequest,
  acceptBingoRequest,
  declineBingoRequest,
  setBingoBoard,
  setBingoReady,
  // toggleBingoMark,
  playBingoNumber,
  closeBingoGame,
  startBingoRematch, // added
  listenToPingPongGame,
  sendPingPongRequest,
  acceptPingPongRequest,
  declinePingPongRequest,
  updatePingPongPaddle,
  hostUpdatePingPongState,
  startPingPongRematch,
  closePingPongGame,
} from "../firebase/firestore"

import { ref, set, onValue } from "firebase/database" // Import necessary Firebase Realtime Database functions
import rtdb from "../firebase/rtdb" // Assuming rtdb is exported from firebase/rtdb

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

  // multi-game state
  const [showGamesMenu, setShowGamesMenu] = useState(false)

  const [rpsGame, setRpsGame] = useState(null)
  const [showRpsModal, setShowRpsModal] = useState(false)
  const [rpsTimer, setRpsTimer] = useState(10)
  const [rpsLocked, setRpsLocked] = useState(false)
  const [rpsReveal, setRpsReveal] = useState(false) // show choices + result for 2s
  const [pickedRound, setPickedRound] = useState(null) // round number when I picked
  const [myLastPick, setMyLastPick] = useState(null) // "rock" | "paper" | "scissors"
  const lastRevealedRoundRef = useRef(null)

  const [typingUsers, setTypingUsers] = useState({})
  const typingTimeoutRef = useRef(null)

  const [confettiOn, setConfettiOn] = useState(false) // match celebration

  const [bingoGame, setBingoGame] = useState(null)
  const [showBingoModal, setShowBingoModal] = useState(false)
  const [myBingoNumbers, setMyBingoNumbers] = useState([])
  const [bingoSetupCount, setBingoSetupCount] = useState(0)

  const [pingGame, setPingGame] = useState(null)
  const [showPingModal, setShowPingModal] = useState(false)

  const [pendingGameRequest, setPendingGameRequest] = useState(null) // { game: "ticTacToe"|"rps"|"bingo"|"ping", doc }

  const inputRef = useRef(null) // Declare inputRef here

  const resetBingoLocal = () => {
    setMyBingoNumbers([])
    setBingoSetupCount(0)
  }

  useEffect(() => {
    let isMounted = true

    const loadChatRoom = async () => {
      const room = await getActiveChatRoom(user.uid)
      if (room && isMounted) {
        setChatRoom(room)
        const otherUserId = room.participants.find((id) => id !== user.uid)
        setPartnerId(otherUserId)
        setPartnerName(room.participantNames[otherUserId])
      }
    }

    loadChatRoom()

    setUserPresence(user.uid, "in-chat")

    return () => {
      isMounted = false
      if (!endChatClickedRef.current) {
        setUserPresence(user.uid, "online")
      }
    }
  }, [chatRoomId, user.uid])

  useEffect(() => {
    if (!chatRoomId) return

    let isMounted = true

    const unsubscribe = listenToChatRoom(chatRoomId, (room) => {
      if (isMounted && (!room || !room.active) && !endChatClickedRef.current) {
        console.log("[v0] Chat room ended, partner left")
        setPartnerLeft(true)

        // Auto-return to waiting queue after 2 seconds
        setTimeout(() => {
          if (isMounted) {
            onChatEnded("partner-left")
          }
        }, 2000)
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
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
    if (!chatRoomId) return
    const unsubRps = listenToRpsGame(chatRoomId, (g) => {
      setRpsGame(g)
      if (g && (g.status === "active" || g.status === "ended")) setShowRpsModal(true)
      if (g && g.status === "request" && g.responderId === user.uid) {
        setPendingGameRequest({ game: "rps", title: "Rock Paper Scissors", doc: g })
      } else if (pendingGameRequest?.game === "rps" && (!g || g.status !== "request")) {
        setPendingGameRequest(null)
      }
    })
    const unsubBingo = listenToBingoGame(chatRoomId, (g) => {
      setBingoGame(g)
      if (g && (g.status === "active" || g.status === "setup" || g.status === "ended")) setShowBingoModal(true)
      if (g && g.status === "request" && g.responderId === user.uid) {
        setPendingGameRequest({ game: "bingo", title: "Bingo", doc: g })
      } else if (pendingGameRequest?.game === "bingo" && (!g || g.status !== "request")) {
        setPendingGameRequest(null)
      }
    })
    const unsubPing = listenToPingPongGame(chatRoomId, (g) => {
      setPingGame(g)
      if (g && (g.status === "active" || g.status === "ended")) setShowPingModal(true)
      if (g && g.status === "request" && g.responderId === user.uid) {
        setPendingGameRequest({ game: "ping", title: "Ping Pong", doc: g })
      } else if (pendingGameRequest?.game === "ping" && (!g || g.status !== "request")) {
        setPendingGameRequest(null)
      }
    })
    return () => {
      unsubRps && unsubRps()
      unsubBingo && unsubBingo()
      unsubPing && unsubPing()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, user.uid, pendingGameRequest?.game])

  useEffect(() => {
    if (!tttGame) return
    if (tttGame.status === "request" && tttGame.responderId === user.uid) {
      setPendingGameRequest({ game: "tic", title: "Tic Tac Toe", doc: tttGame })
    } else if (pendingGameRequest?.game === "tic" && tttGame.status !== "request") {
      setPendingGameRequest(null)
    }
    if (tttGame && (tttGame.status === "active" || tttGame.status === "won" || tttGame.status === "draw")) {
      setShowTttModal(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tttGame, pendingGameRequest?.game])

  useEffect(() => {
    if (!showRpsModal || !rpsGame || rpsGame.status !== "active") return
    setRpsTimer(10)
    setRpsLocked(false)
    const id = setInterval(() => {
      setRpsTimer((t) => {
        if (t <= 1) {
          clearInterval(id)
          setRpsLocked(true)
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [showRpsModal, rpsGame])

  useEffect(() => {
    if (!rpsGame) return
    const currentRound = rpsGame.round || 1
    const revealedRound = rpsGame.lastRound?.round

    // Show reveal only once for the round that just finished:
    // reveal round N while the game is on round N+1
    const shouldReveal =
      rpsGame.status === "active" &&
      revealedRound &&
      revealedRound === currentRound - 1 &&
      lastRevealedRoundRef.current !== revealedRound

    if (!shouldReveal) return

    lastRevealedRoundRef.current = revealedRound
    setRpsReveal(true)
    const t = setTimeout(() => {
      setRpsReveal(false)
      setPickedRound(null)
      setMyLastPick(null)
    }, 2000)
    return () => clearTimeout(t)
  }, [rpsGame])

  useEffect(() => {
    // Confetti trigger when match ends
    if (!rpsGame) return
    if (rpsGame.status === "ended" && rpsGame.winnerUid === user.uid) {
      setConfettiOn(true)
      const t = setTimeout(() => setConfettiOn(false), 1400)
      return () => clearTimeout(t)
    } else {
      setConfettiOn(false)
    }
  }, [rpsGame, user.uid])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (bingoGame?.status === "setup") {
      setMyBingoNumbers([])
      setBingoSetupCount(0)
    }
  }, [bingoGame?.status])

  const handleInputChange = (e) => {
    const value = e.target.value
    setNewMessage(value)

    // Broadcast typing status to Firebase RTDB
    if (!chatRoomId || !user.uid) return
    const typingRef = ref(rtdb, `typing/${chatRoomId}/${user.uid}`)
    set(typingRef, { isTyping: true, timestamp: Date.now() })

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set timeout to mark as not typing after 1.5 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      set(typingRef, { isTyping: false })
    }, 1500)
  }

  useEffect(() => {
    if (!chatRoomId || !user.uid) return

    // Listen for partner's typing status only (no addEventListener)
    const typingListenerRef = ref(rtdb, `typing/${chatRoomId}`)
    const unsubTyping = onValue(typingListenerRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const typingStatus = {}
        Object.entries(data).forEach(([uid, status]) => {
          if (uid !== user.uid && status.isTyping) {
            typingStatus[uid] = true
          }
        })
        setTypingUsers(typingStatus)
      }
    })

    return () => {
      unsubTyping()
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [chatRoomId, user.uid])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || partnerLeft) return

    // Clear typing status immediately
    const typingRef = ref(rtdb, `typing/${chatRoomId}/${user.uid}`)
    set(typingRef, { isTyping: false })
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

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

  const handleOpenGamesMenu = () => setShowGamesMenu(true)
  const handleCloseGamesMenu = () => setShowGamesMenu(false)

  const handleRequestTicTacToe = async () => {
    if (!partnerId || partnerLeft) return
    await sendTicTacToeRequest(chatRoomId, user.uid, partnerId)
    setShowGamesMenu(false)
  }
  const handleRequestRps = async () => {
    if (!partnerId || partnerLeft) return
    await sendRpsRequest(chatRoomId, user.uid, partnerId)
    setShowGamesMenu(false)
  }
  const handleRequestBingo = async () => {
    if (!partnerId || partnerLeft) return
    await sendBingoRequest(chatRoomId, user.uid, partnerId)
    setShowGamesMenu(false)
  }
  const handleRequestPing = async () => {
    if (!partnerId || partnerLeft) return
    await sendPingPongRequest(chatRoomId, user.uid, partnerId)
    setShowGamesMenu(false)
  }

  const handleAcceptGame = async () => {
    if (!pendingGameRequest) return
    try {
      if (pendingGameRequest.game === "tic") await acceptTicTacToeRequest(chatRoomId, user.uid)
      if (pendingGameRequest.game === "rps") await acceptRpsRequest(chatRoomId, user.uid)
      if (pendingGameRequest.game === "bingo") await acceptBingoRequest(chatRoomId, user.uid)
      if (pendingGameRequest.game === "ping") await acceptPingPongRequest(chatRoomId, user.uid)
      setPendingGameRequest(null)
    } catch (e) {
      console.error(e)
    }
  }
  const handleDeclineGame = async () => {
    if (!pendingGameRequest) return
    try {
      if (pendingGameRequest.game === "tic") await declineTicTacToeRequest(chatRoomId, user.uid)
      if (pendingGameRequest.game === "rps") await declineRpsRequest(chatRoomId, user.uid)
      if (pendingGameRequest.game === "bingo") await declineBingoRequest(chatRoomId, user.uid)
      if (pendingGameRequest.game === "ping") await declinePingPongRequest(chatRoomId, user.uid)
      setPendingGameRequest(null)
    } catch (e) {
      console.error(e)
    }
  }

  const scores = rpsGame?.scores || {}
  const myRpsScore = scores[user.uid] || 0

  const opponentId =
    rpsGame?.requesterId === user.uid
      ? rpsGame?.responderId
      : rpsGame?.responderId === user.uid
        ? rpsGame?.requesterId
        : null

  const partnerRpsScore = opponentId ? scores[opponentId] || 0 : 0
  const rpsHasEnded = rpsGame?.status === "ended"

  const myBoard = bingoGame?.boards?.[user.uid] || null
  const myMarks = bingoGame?.marks?.[user.uid] || Array(25).fill(false)
  const myMarkSources = bingoGame?.markSources?.[user.uid] || Array(25).fill(null)
  const otherReady = bingoGame?.requesterId && bingoGame?.responderId && bingoGame?.ready?.[partnerId]
  const iAmReady = !!bingoGame?.ready?.[user.uid]

  const setMyBingoNumberAt = (cellIndex) => {
    if (bingoGame?.status !== "setup") return
    // do not allow changing a cell once assigned
    if (myBingoNumbers[cellIndex]) return

    const assignedCount = (myBingoNumbers || []).filter(Boolean).length
    if (assignedCount >= 25) return

    const nextNum = assignedCount + 1
    const arr = [...myBingoNumbers]
    arr[cellIndex] = nextNum
    setMyBingoNumbers(arr)
    setBingoSetupCount((c) => Math.min(25, c + 1))
  }

  const computeBingoLinesLocal = (marksArr) => {
    if (!Array.isArray(marksArr) || marksArr.length !== 25) return 0
    const idx = (r, c) => r * 5 + c
    let lines = 0
    for (let r = 0; r < 5; r++) if ([0, 1, 2, 3, 4].every((c) => marksArr[idx(r, c)])) lines++
    for (let c = 0; c < 5; c++) if ([0, 1, 2, 3, 4].every((r) => marksArr[idx(r, c)])) lines++
    if ([0, 1, 2, 3, 4].every((i) => marksArr[idx(i, i)])) lines++
    if ([0, 1, 2, 3, 4].every((i) => marksArr[idx(i, 4 - i)])) lines++
    return lines
  }

  const submitMyBingoBoard = async () => {
    const filled = Array(25)
      .fill(null)
      .map((_, i) => myBingoNumbers[i] || i + 1)
    await setBingoBoard(chatRoomId, user.uid, filled)
  }

  const handleBingoReady = async () => {
    await setBingoReady(chatRoomId, user.uid)
  }

  // const handleBingoCallNext = async () => {
  //   await callBingoNextNumber(chatRoomId, user.uid)
  // }

  const handleBingoPlayCell = async (idx) => {
    if (!bingoGame || bingoGame.status !== "active") return
    if (bingoGame.currentTurn !== user.uid) return
    const num = (bingoGame?.boards?.[user.uid] || [])[idx]
    if (!num) return
    await playBingoNumber(chatRoomId, user.uid, num)
  }

  const handleReplayBingo = async () => {
    await startBingoRematch(chatRoomId, user.uid)
    setShowBingoModal(false)
  }

  const isPingHost = pingGame?.hostUid === user.uid

  return (
    <div className="chat-container" style={{ position: "relative", background: "#000000", width: "100vw", height: "100vh", maxWidth: "none", margin: "0", padding: "0" }}>
      <div className="chat-mobile-nav">
        <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="chat-mobile-menu-btn">
          ☰
        </button>
        <h2 className="chat-mobile-title">
          {partnerName}
          {partnerLeft && <span className="chat-left-indicator"> (Left)</span>}
        </h2>
        <button
          onClick={handleOpenGamesMenu}
          disabled={partnerLeft}
          className="chat-mobile-games-btn"
          aria-label="Open Games"
          title="Games"
        >
          🎮
        </button>
      </div>

      <div
        className="chat-box"
        style={{
          background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)",
          width: "100%",
          height: "100%",
          maxWidth: "none",
          display: "flex",
          flexDirection: "column",
          ...(celebrate
            ? iAmWinner
              ? { boxShadow: "0 0 0 4px rgba(16,185,129,0.5)", transition: "box-shadow 200ms" }
              : iAmLoser
              ? { boxShadow: "0 0 0 4px rgba(239,68,68,0.5)", transition: "box-shadow 200ms" }
              : undefined
            : undefined)
        }}
      >

        <div className="chat-header" style={{ background: "#1a1a1a", borderBottom: "1px solid #262626" }}>
          <div>
            <h2 className="chat-title" style={{ color: "#ffffff" }}>
              Chatting with {partnerName}
              {partnerLeft && <span className="chat-left-indicator"> (Left)</span>}
            </h2>
            <p className="chat-subtitle" style={{ color: "#a8a8a8" }}>Be respectful and have fun!</p>
          </div>
          <div className="chat-header-buttons">
            <button onClick={handleSendFriendRequest} disabled={requestSent || partnerLeft} className="chat-friend-btn">
              {requestSent ? "Request Sent" : "Add Friend"}
            </button>
            <button onClick={handleOpenGamesMenu} disabled={partnerLeft} className="chat-games-btn">
              Games
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
          <>
            <div
              onClick={() => setShowMobileMenu(false)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99,
              }}
            />
            <div className="chat-mobile-menu">
              <button
                onClick={() => {
                  handleSendFriendRequest()
                  setShowMobileMenu(false)
                }}
                disabled={requestSent || partnerLeft}
                className="chat-mobile-menu-item"
              >
                {requestSent ? "Request Sent" : "Add Friend"}
              </button>
              <button
                onClick={() => {
                  handleReportUser()
                  setShowMobileMenu(false)
                }}
                disabled={partnerLeft}
                className="chat-mobile-menu-item"
              >
                Report
              </button>
              <button
                onClick={() => {
                  handleBlockUser()
                  setShowMobileMenu(false)
                }}
                disabled={partnerLeft}
                className="chat-mobile-menu-item"
              >
                Block
              </button>
              <button
                onClick={() => {
                  handleSkip()
                  setShowMobileMenu(false)
                }}
                disabled={partnerLeft}
                className="chat-mobile-menu-item"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  handleEndChat()
                  setShowMobileMenu(false)
                }}
                className="chat-mobile-menu-item"
              >
                End Chat
              </button>
            </div>
          </>
        )}

        {partnerLeft && (
          <div className="chat-warning-bar">
            Your chat partner has left the conversation. Returning to waiting queue...
          </div>
        )}

        {/* Typing indicator moved inline with messages */}


        <div className="chat-messages" style={{ background: "transparent", paddingBottom: "80px" }}>
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
                    className={`chat-message ${
                      msg.senderId === user.uid ? "chat-message-sent" : "chat-message-received"
                    } ${isMessageMentioningMe(msg) ? "chat-message-mentioned" : ""}`}
                    style={
                      msg.senderId === user.uid
                        ? {
                            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                            color: "#ffffff",
                            borderRadius: "18px 18px 4px 18px",
                            padding: "10px 14px",
                            maxWidth: "75%",
                            wordWrap: "break-word",
                            position: "relative",
                          }
                        : {
                            background: "#262626",
                            color: "#f5f5f5",
                            borderRadius: "18px 18px 18px 4px",
                            padding: "10px 14px",
                            maxWidth: "75%",
                            wordWrap: "break-word",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                            position: "relative",
                          }
                    }
                  >

                  <div className="chat-message-sender">{msg.senderName}</div>
                  <div
                    className="chat-message-text"
                    dangerouslySetInnerHTML={{ __html: highlightMentions(msg.message) }}
                  />
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "#999",
                      marginTop: "0.35rem",
                      opacity: 0.8,
                    }}
                  >
{msg.timestamp
  ? (() => {
      const t =
        msg.timestamp && msg.timestamp.seconds
          ? new Date(msg.timestamp.seconds * 1000)
          : new Date(msg.timestamp);
      return !isNaN(t)
        ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
    })()
  : ""}

                  </div>
                </div>
              </div>
            ))
          )}
{/* Instagram-style inline typing indicator */}
{Object.keys(typingUsers).length > 0 && (
  <div
    className="chat-message-wrapper chat-message-left"
    style={{ opacity: 0.85 }}
  >
    <div
      className="chat-message chat-message-received"
      style={{
        background: "rgba(38, 38, 38, 0.9)",
        backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#f5f5f5",
        borderRadius: "18px",
        padding: "10px 16px",
        maxWidth: "70%",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 500,
          fontStyle: "italic",
          opacity: 0.85,
        }}
      >
        {partnerId && typingUsers[partnerId]
          ? `${partnerName} is typing`
          : "typing"}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "3px",
          marginLeft: "4px",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#f5f5f5",
            animation: "blink 1s infinite alternate",
          }}
        ></span>
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#f5f5f5",
            animation: "blink 1s infinite alternate 0.3s",
          }}
        ></span>
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#f5f5f5",
            animation: "blink 1s infinite alternate 0.6s",
          }}
        ></span>
      </div>
    </div>
  </div>
)}

              
              <div ref={messagesEndRef} />

        </div>

        <form onSubmit={handleSendMessage} className="chat-input-container" style={{ background: "#1a1a1a", borderTop: "1px solid #262626", padding: "12px 16px" }}>

          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder="Message..."
            className="chat-input"
            style={{
              background: "#262626",
              border: "1px solid #3a3a3a",
              borderRadius: "22px",
              padding: "10px 18px",
              color: "#ffffff",
              fontSize: "15px",
              outline: "none",
              flex: 1,
            }}
          />
          <button type="submit" className="chat-send-btn" disabled={partnerLeft}>
            Send
          </button>
        </form>

{showTttModal && tttGame && (tttGame.status === "active" || tttGame.status === "won" || tttGame.status === "draw") && (
  <div
    role="dialog"
    aria-modal="true"
    className="ttt-modal-overlay"
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        // Don't auto-close when clicking outside
      }
    }}
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 60,
      background: "rgba(0,0,255,0.1)",
      backdropFilter: "blur(0.2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 10,
      pointerEvents: "none",
    }}

  >

    <div
      className="ttt-modal-content"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 380,
        background: "rgba(15, 23, 42, 0.95)",
        color: "#F9FAFB",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.4s ease",
        pointerEvents: "auto",
        backdropFilter: "blur(8px)",
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
            pointer-events: none;
            animation: fadeInOut 0.5s ease-in-out forwards;
          }

          @keyframes fadeInOut {
            0% { opacity: 0; transform: scale(0.8); }
            20% { opacity: 1; transform: scale(1); }
            80% { opacity: 1; }
            100% { opacity: 0; transform: scale(0.8); }
          }

          @keyframes draw-sparkle {
            0% { transform: translateY(0) scale(0.5); opacity: 0.7; }
            100% { transform: translateY(-40px) scale(1.2); opacity: 0; }
          }
        `}</style>

                {(() => {
                  const themes = [
                    { primary: "#3B82F6", secondary: "#1E3A8A", cellShape: "10%" },
                    { primary: "#10B981", secondary: "#064E3B", cellShape: "20%" },
                    { primary: "#F59E0B", secondary: "#78350F", cellShape: "40%" },
                    { primary: "#8B5CF6", secondary: "#4C1D95", cellShape: "0%" },
                    { primary: "#EF4444", secondary: "#7F1D1D", cellShape: "25%" },
                  ]
                  const theme = themes[(myScore + partnerScore) % themes.length]

                  return (
                    <>
                      {/* Header with buttons */}
                      <div
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          display: "flex",
                          gap: 8,
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReplayTtt()
                          }}
                          style={{
                            background: theme.primary,
                            border: "none",
                            borderRadius: 8,
                            color: "#fff",
                            padding: "6px 12px",
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Try Again
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCloseTtt()
                          }}
                          style={{
                            background: "transparent",
                            border: `1px solid ${theme.primary}`,
                            borderRadius: 8,
                            color: theme.primary,
                            padding: "6px 12px",
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          ✖ Close
                        </button>
                      </div>

                      {/* Title */}
                      <h3
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: theme.primary,
                          marginBottom: 10,
                          textAlign: "left",
                        }}
                      >
                        🧩 Tic Tac Toe
                      </h3>

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

                      {/* Turn indicator */}
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
                            color: tttGame.currentTurn === user.uid ? "#10B981" : "#EF4444",
                            minWidth: 120,
                            textAlign: "right",
                          }}
                        >
                          {tttGame.status === "active"
                            ? tttGame.currentTurn === user.uid
                              ? "Your Turn"
                              : `${partnerName}'s Turn`
                            : ""}
                        </div>

                        <div style={{ fontSize: 28, fontWeight: 700, color: theme.primary }}>
                          {mySymbol === "X" ? "❌" : "⭕"}
                        </div>
                      </div>

                      {/* Game board */}
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
                            tttGame.currentTurn !== user.uid
                          const handleTap = () => !disabled && handleCellTap(idx)
                          const cellClass =
                            tttGame.status === "won"
                              ? iAmWinner && tttGame.winningLine?.includes(idx)
                                ? "winner-cell"
                                : !iAmWinner && tttGame.winningLine?.includes(idx)
                                  ? "loser-cell"
                                  : ""
                              : tttGame.status === "draw"
                                ? "draw-cell"
                                : ""
                          return (
                            <div
                              key={idx}
                              onClick={handleTap}
                              onTouchEnd={(e) => {
                                e.preventDefault()
                                handleTap()
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
                                color: cell === "X" ? "#10B981" : cell === "O" ? "#EF4444" : "#F9FAFB",
                                transition: "all 0.25s ease",
                              }}
                            >
                              {cell || ""}
                            </div>
                          )
                        })}
                      </div>

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
                          {tttGame.status === "draw" ? "🤝 Draw!" : iAmWinner ? "🎉 You Won!" : "😔 You Lost!"}
                        </div>
                      )}

                      {/* Celebration */}
                      {celebrate && (
                        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                          {Array.from({ length: 30 }).map((_, i) => {
                            const left = Math.random() * 100
                            const top = Math.random() * 40
                            const color = tttGame.status === "draw" ? "#FBBF24" : iAmWinner ? "#10B981" : "#EF4444"
                            const delay = Math.random() * 300
                            const size = Math.random() * 6 + 4
                            return (
                              <div
                                key={i}
                                style={{
                                  position: "absolute",
                                  width: size,
                                  height: size,
                                  borderRadius: 2,
                                  left: `${left}%`,
                                  top: `${top}%`,
                                  background: color,
                                  animation:
                                    tttGame.status === "draw"
                                      ? `draw-sparkle 800ms ease-out ${delay}ms forwards`
                                      : `ttt-burst 900ms ease-out ${delay}ms forwards`,
                                }}
                              />
                            )
                          })}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          )}

{showGamesMenu && (
  <div role="dialog" aria-modal="true" onClick={handleCloseGamesMenu} style={{...modalOverlayStyle, position: "absolute", top: 0, left: 0, right: 0, bottom: 60, background: "rgba(0,0,0,0.2)", backdropFilter: "blur(1px)", zIndex: 10, pointerEvents: "none"}}>
    <div onClick={(e) => e.stopPropagation()} style={{ ...modalCardStyle, maxWidth: 720, background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(8px)", pointerEvents: "auto" }}>

              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Choose a Game</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {[
                  { key: "tic", icon: "❌⭕", title: "Tic Tac Toe", onClick: handleRequestTicTacToe },
                  { key: "rps", icon: "🪨📄✂️", title: "Rock Paper Scissors", onClick: handleRequestRps },
                  { key: "bingo", icon: "🧩", title: "Bingo", onClick: handleRequestBingo },
                  { key: "ping", icon: "🏓", title: "Ping Pong", onClick: handleRequestPing },
                ].map((g) => (
                  <div
                    key={g.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "rgba(255, 255, 255, 0.08)",
                      backdropFilter: "blur(6px)",
                      transition: "background 0.2s ease, transform 0.2s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")} // dark sharp color
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(30, 30, 30, 1)")} // normal state
                  >
                    {/* Left emoji */}
                    <span style={{ fontSize: 22, marginRight: 12 }}>{g.icon}</span>

                    {/* Centered title */}
                    <span
                      style={{
                        flexGrow: 1,
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: 16,
                        color: "#fff",
                      }}
                    >
                      {g.title}
                    </span>

                    {/* Right button */}
                    <button
                      onClick={g.onClick}
                      style={{
                        ...requestBtnStyle,
                        fontSize: 14,
                        padding: "6px 12px",
                        borderRadius: 8,
                        minWidth: 80,
                      }}
                    >
                      Request
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                <button onClick={handleCloseGamesMenu} style={secondaryBtnStyle}>
                  Back
                </button>
              </div>
            </div>
          </div>
        )}

{pendingGameRequest && (
  <div role="dialog" aria-modal="true" onClick={() => {}} style={{...modalOverlayStyle, position: "absolute", top: 0, left: 0, right: 0, bottom: 60, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)", zIndex: 10, pointerEvents: "none"}}>
    <div onClick={(e) => e.stopPropagation()} style={{...modalCardStyle, background: "rgba(15, 23, 42, 0.85)", pointerEvents: "auto"}}>

              <div style={{ fontSize: 28, marginBottom: 8 }}>🎮 Game Request</div>
              <div
                style={{
                  height: 1,
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.2), rgba(255,255,255,0.5), rgba(255,255,255,0.2))",
                  marginBottom: 12,
                }}
              />
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 6 }}>{partnerName} challenged you to play:</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{pendingGameRequest.title}</div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={handleAcceptGame} style={acceptBtnStyle}>
                  Accept
                </button>
                <button onClick={handleDeclineGame} style={declineBtnStyle}>
                  Decline
                </button>
              </div>
            </div>
          </div>
        )}

        {showRpsModal && rpsGame && (rpsGame.status === "active" || rpsGame.status === "ended") && (
          <>
  <div role="dialog" aria-modal="true" style={{...modalOverlayStyle, position: "absolute", top: 0, left: 0, right: 0, bottom: 60, background: "rgba(0,0,255,0.1)", backdropFilter: "blur(0px)", zIndex: 10, pointerEvents: "none"}}>
    <div onClick={(e) => e.stopPropagation()} style={{...modalCardStyle, background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(8px)", pointerEvents: "auto"}}>

                <style>{`
                  .glow-btn {
                    position: relative;
                    box-shadow: 0 0 0 0 rgba(59,130,246,0.4);
                    transition: box-shadow .2s ease, transform .15s ease, background .2s ease;
                  }
                  .glow-btn:hover {
                    box-shadow: 0 0 16px rgba(59,130,246,0.5);
                    transform: translateY(-1px);
                  }
                  .rps-box {
                    background: #0b1222;
                    border: 1px solid #1f2937;
                    border-radius: 16px;
                    min-height: 92px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 44px;
                  }
                  @keyframes fadeIn {
                    from { opacity: 0; transform: scale(.96); }
                    to { opacity: 1; transform: scale(1); }
                  }
                  .fade-in { animation: fadeIn 220ms ease-out both; }

                  @keyframes popWin {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.12); }
                    100% { transform: scale(1); }
                  }
                  .pop-win { animation: popWin 380ms ease-out both; }

                  .rps-option {
                    width: 88px; height: 88px; font-size: 34px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 14px; border: 1px solid #1f2937; cursor: pointer;
                    background: linear-gradient(180deg, #111827, #0f172a);
                    transition: transform .1s ease, box-shadow .2s ease, border-color .2s ease;
                    box-shadow: 0 0 0 0 rgba(99,102,241,0.0);
                  }
                  .rps-option:hover { transform: translateY(-1px); box-shadow: 0 0 16px rgba(99,102,241,0.25); border-color: #334155; }
                  .rps-option.active { box-shadow: 0 0 18px rgba(99,102,241,0.45); border-color: #6366f1; }

                  .result-text { font-weight: 800; text-align: center; }
                  .result-win { color: #10B981; }
                  .result-lose { color: #EF4444; }
                  .result-draw { color: #FBBF24; }

                  .confetti-dot {
                    position: absolute; width: 8px; height: 8px; border-radius: 2px; opacity: .9;
                    animation: burst .9s ease-out forwards;
                  }
                  @keyframes burst {
                    0% { transform: translateY(0) scale(.8); opacity: .9; }
                    100% { transform: translateY(60px) scale(1.2); opacity: 0; }
                  }
                `}</style>

                <div style={modalHeaderRow}>
                  <h3 style={{ fontWeight: 800 }}>🪨📄✂️ Rock Paper Scissors</h3>
                  <button
                    onClick={() => closeRpsGame(chatRoomId).finally(() => setShowRpsModal(false))}
                    className="glow-btn"
                    style={{ ...secondaryBtnStyle, borderColor: "#334155" }}
                    title="Close"
                    aria-label="Close RPS"
                  >
                    Close
                  </button>
                </div>

                {/* Scoreboard */}
                <div style={{ ...scoreRow, gap: 12 }}>
                  <div style={scoreCol}>
                    <div style={scoreName}>{user.displayName || "You"}</div>
                    <div style={{ ...scoreValue, color: "#F9FAFB" }}>{myRpsScore}</div>
                  </div>
                  <div style={{ textAlign: "center", minWidth: 120 }}>
                    <div style={{ fontWeight: 800 }}>Round {Math.min(3, rpsGame.round || 1)}</div>
                  </div>
                  <div style={scoreCol}>
                    <div style={scoreName}>{partnerName}</div>
                    <div style={{ ...scoreValue, color: "#F9FAFB" }}>{partnerRpsScore}</div>
                  </div>
                </div>

                {/* Reveal area */}
                {(() => {
                  const last = rpsGame.lastRound
                  // determine emojis for reveal
                  const toEmoji = (c) => (c === "rock" ? "🪨" : c === "paper" ? "📄" : c === "scissors" ? "✂️" : "")
                  let youEmoji = ""
                  let oppEmoji = ""
                  let youWon = null
                  if (rpsReveal && last) {
                    const aIsMe = last.aUid === user.uid
                    youEmoji = toEmoji(aIsMe ? last.aChoice : last.bChoice)
                    oppEmoji = toEmoji(aIsMe ? last.bChoice : last.aChoice)
                    youWon = last.winnerUid ? last.winnerUid === user.uid : null
                  }
                  return (
                    <>
                      <div
                        className="fade-in"
                        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}
                      >
                        <div className={`rps-box ${youWon === true ? "pop-win" : ""}`} aria-label="Your choice box">
                          {rpsReveal ? youEmoji : ""}
                        </div>
                        <div
                          className={`rps-box ${youWon === false ? "pop-win" : ""}`}
                          aria-label="Opponent choice box"
                        >
                          {rpsReveal ? oppEmoji : ""}
                        </div>
                      </div>
                      <div
                        className={`result-text ${youWon === true ? "result-win" : youWon === false ? "result-lose" : "result-draw"}`}
                      >
                        {rpsReveal
                          ? youWon === true
                            ? "You Win 🎉"
                            : youWon === false
                              ? "You Lose 😔"
                              : "Draw 🤝"
                          : "\u00A0"}
                      </div>
                    </>
                  )
                })()}

                {/* Options */}
                {rpsGame.status === "active" && (
                  <>
                    <div style={{ height: 12 }} />
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                      {[
                        { key: "rock", emoji: "🪨" },
                        { key: "paper", emoji: "📄" },
                        { key: "scissors", emoji: "✂️" },
                      ].map(({ key, emoji }) => {
                        const isDisabled =
                          rpsReveal ||
                          rpsGame.status !== "active" ||
                          (pickedRound && pickedRound === (rpsGame.round || 1))
                        const isActive = myLastPick === key && pickedRound === (rpsGame.round || 1)
                        return (
                          <button
                            key={key}
                            onClick={async () => {
                              if (isDisabled) return
                              setPickedRound(rpsGame.round || 1)
                              setMyLastPick(key)
                              try {
                                await chooseRps(chatRoomId, user.uid, key)
                              } catch (e) {
                                console.error("[v0] chooseRps failed", e)
                              }
                            }}
                            disabled={isDisabled}
                            className={`rps-option ${isActive ? "active" : ""}`}
                            title={`Choose ${key}`}
                            aria-label={`Choose ${key}`}
                          >
                            {emoji}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ height: 6 }} />
                  </>
                )}

                {/* Match result */}
                {rpsHasEnded && (
                  <div
                    className="fade-in"
                    style={{
                      textAlign: "center",
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: rpsGame.winnerUid
                        ? rpsGame.winnerUid === user.uid
                          ? "rgba(16,185,129,0.12)"
                          : "rgba(239,68,68,0.10)"
                        : "rgba(251,191,36,0.10)",
                      boxShadow: rpsGame.winnerUid
                        ? rpsGame.winnerUid === user.uid
                          ? "0 0 12px rgba(16,185,129,0.35)"
                          : "0 0 10px rgba(239,68,68,0.25)"
                        : "0 0 10px rgba(251,191,36,0.25)",
                      transition: "box-shadow 200ms",
                      position: "relative",
                      overflow: "hidden",
                      boxSizing: "border-box", // Ensure padding is included in width
                    }}
                  >
                    {rpsGame.winnerUid
                      ? rpsGame.winnerUid === user.uid
                        ? "🎉 You won the match!"
                        : "😔 You lost the match."
                      : "🤝 Match draw."}
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                      <button onClick={() => startRpsRematch(chatRoomId)} style={requestBtnStyle}>
                        Try Again
                      </button>
                      <button
                        onClick={() => closeRpsGame(chatRoomId).finally(() => setShowRpsModal(false))}
                        style={secondaryBtnStyle}
                      >
                        Close
                      </button>
                    </div>

                    {/* Confetti */}
                    {confettiOn && (
                      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        {Array.from({ length: 26 }).map((_, i) => {
                          const left = Math.random() * 100
                          const top = Math.random() * 35
                          const color = "#10B981"
                          const delay = Math.random() * 300
                          const size = Math.random() * 6 + 4
                          return (
                            <div
                              key={i}
                              className="confetti-dot"
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                background: color,
                                width: size,
                                height: size,
                                animationDelay: `${delay}ms`,
                              }}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

{showBingoModal && bingoGame && (bingoGame.status === "setup" || bingoGame.status === "active" || bingoGame.status === "ended") && (
  <div role="dialog" aria-modal="true" style={{...modalOverlayStyle, position: "absolute", top: 0, left: 0, right: 0, bottom: 60, background: "rgba(0,0,255,0.1)", backdropFilter: "blur(0px)", zIndex: 10, pointerEvents: "none"}}>
    <div onClick={(e) => e.stopPropagation()} style={{ ...modalCardStyle, maxWidth: 560, position: "relative", overflow: "hidden", background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(8px)", pointerEvents: "auto" }}>

                <style>{`
                  @keyframes bingo-pop {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                  }
                  @keyframes streamer {
                    0% { transform: translateY(-20px) rotate(0deg); opacity: 0.9; }
                    100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
                  }
                  @keyframes boo-wiggle {
                    0%,100% { transform: rotate(0deg); }
                    25% { transform: rotate(2deg); }
                    50% { transform: rotate(-2deg); }
                    75% { transform: rotate(2deg); }
                  }
                  @keyframes tomato-fall {
                    0% { transform: translateY(-10px) scale(0.9); opacity: 0.9; }
                    100% { transform: translateY(110px) scale(1.1); opacity: 0; }
                  }
                  /* structured, scoped celebration animations */
                  @keyframes bingo-confetti-fall {
                    0% { transform: translateY(-120%) rotate(0deg); opacity: 0; }
                    10% { opacity: 1; }
                    100% { transform: translateY(120%) rotate(360deg); opacity: 0.9; }
                  }
                  @keyframes bingo-confetti-wiggle {
                    0% { transform: translateX(0); }
                    50% { transform: translateX(8px); }
                  }
                  @keyframes bingo-boo-slide {
                    0% { transform: translateY(-10px); opacity: 0; }
                    20% { opacity: 1; }
                    100% { transform: translateY(110%); opacity: 0.8; }
                  }

                  /* add organized celebration animations */
                  @keyframes bingo-heading-pop {
                    0% { transform: scale(0.85); opacity: 0; }
                    60% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                  }
                  @keyframes bingo-pulse {
                    0%, 100% { opacity: 0.8; }
                    50% { opacity: 1; }
                  }
@keyframes bingo-ribbon-fall {
  0% { transform: translateY(-150%); opacity: 0; }
  10% { opacity: 0.9; }
  70% { transform: translateY(80vh); opacity: 1; }
  100% { transform: translateY(120vh) rotate(20deg); opacity: 0; }
}

@keyframes bingo-shake-soft {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px) rotate(-1deg); }
  50% { transform: translateX(3px) rotate(1deg); }
  80% { transform: translateX(-2px) rotate(-1deg); }
}

@keyframes bingo-badge-pop {
  0% { transform: scale(1.3) translateY(-8px); opacity: 0; }
  70% { transform: scale(0.95) translateY(3px); opacity: 0.6; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}

.bingo-confetti-piece {
  position: absolute;
  top: -10%;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  filter: brightness(0.6);
  animation: bingo-confetti-fall 4s linear infinite,
             bingo-confetti-wiggle 1.5s ease-in-out infinite;
  opacity: 0.7;
}

.bingo-ribbon {
  position: absolute;
  top: -10%;
  width: 3px;
  height: 28px;
  border-radius: 2px;
  opacity: 0.8;
  filter: grayscale(70%);
  animation: bingo-ribbon-fall 0.3s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}

/* ---------- Headings ---------- */
.bingo-heading {
  font-weight: 900;
  font-size: 1.8rem;
  letter-spacing: 1px;

  background: linear-gradient(90deg, #f8d65e, #ffb347, #f8d65e);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: heading-glow 3s ease-in-out infinite, heading-pop 400ms ease-out both;
}

.bingo-subtext {
  margin-top: 8px;
  font-size: 1rem;
  font-weight: 400;
  opacity: 0.85;
  letter-spacing: 0.2px;
  animation: pulse-text 1800ms ease-in-out infinite;
}

/* ---------- Button ---------- */
.bingo-tryagain-btn {
  background: linear-gradient(135deg, #ff6b6b, #ff4040);
  color: #fff;
  border: none;
  outline: none;
  padding: 10px 24px;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 4px 12px rgba(255, 64, 64, 0.3);
}

.bingo-tryagain-btn:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 6px 18px rgba(255, 64, 64, 0.45);
}

.bingo-tryagain-btn:active {
  transform: scale(0.96);
  box-shadow: 0 3px 8px rgba(255, 64, 64, 0.25);
}

/* ---------- Animations ---------- */
@keyframes heading-pop {
  0% {
    transform: scale(0.7);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes pulse-text {
  0%, 100% {
    opacity: 0.75;
  }
  50% {
    opacity: 1;
  }
}

@keyframes heading-glow {
  0%, 100% {
    filter: drop-shadow(0 0 6px rgba(255, 204, 0, 0.4));
  }
  50% {
    filter: drop-shadow(0 0 12px rgba(255, 204, 0, 0.8));
  }
}

/* ------------------------------
   Loser Badge — Refined & Expressive
------------------------------ */
.bingo-loser-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 18px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #b91c1c, #ef4444);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.4px;
  box-shadow:
    0 2px 6px rgba(239, 68, 68, 0.4),
    inset 0 0 6px rgba(0, 0, 0, 0.25);
  user-select: none;
  position: relative;
  overflow: hidden;
  animation:
    badge-drop 350ms cubic-bezier(0.25, 1, 0.5, 1) both,
    loser-pulse 2.5s ease-in-out infinite;
}

/* Subtle "falling" entrance */
@keyframes badge-drop {
  0% {
    transform: translateY(-30px) scale(0.6);
    opacity: 0;
  }
  80% {
    transform: translateY(4px) scale(1.05);
    opacity: 1;
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

/* Gentle fading pulse (soft regret/sad feel) */
@keyframes loser-pulse {
  0%, 100% {
    box-shadow:
      0 2px 6px rgba(239, 68, 68, 0.35),
      inset 0 0 4px rgba(255, 255, 255, 0.05);
    opacity: 1;
  }
  50% {
    box-shadow:
      0 4px 12px rgba(239, 68, 68, 0.5),
      inset 0 0 8px rgba(255, 255, 255, 0.08);
    opacity: 0.9;
  }
}

/* Optional subtle diagonal "shine" animation */
.bingo-loser-badge::after {
  content: "";
  position: absolute;
  top: 0;
  left: -150%;
  width: 150%;
  height: 100%;
  background: linear-gradient(
    120deg,
    rgba(255, 255, 255, 0.15) 0%,
    rgba(255, 255, 255, 0.05) 40%,
    rgba(255, 255, 255, 0) 80%
  );
  animation: badge-shine 6s ease-in-out infinite;
}

@keyframes badge-shine {
  0% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(120%);
  }
  100% {
    transform: translateX(120%);
  }
}


/* Gentle shake (less jarring, smoother loop) */
@keyframes shake-soft {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-1.5px); }
  50% { transform: translateX(1.5px); }
  75% { transform: translateX(-1px); }
}

/* ------------------------------
   Winner Glitter — Refined Glow
------------------------------ */
.bingo-glitter {
  position: absolute;
  border-radius: 50%;
  width: 10px;
  height: 10px;
  background: radial-gradient(circle at 30% 30%, #fff8e1 0%, #ffe066 45%, rgba(255, 255, 255, 0) 75%);
  opacity: 0.85;
  pointer-events: none;
  animation:
    glitter-twinkle 1600ms ease-in-out infinite,
    glitter-float 1800ms ease-in-out alternate;
  filter: drop-shadow(0 0 6px rgba(255, 241, 118, 0.8));
  mix-blend-mode: screen;
}

/* Subtle twinkle (smoother scaling + rotation) */
@keyframes glitter-twinkle {
  0%, 100% {
    opacity: 0.2;
    transform: scale(0.8) rotate(0deg);
  }
  50% {
    opacity: 1;
    transform: scale(1.2) rotate(20deg);
  }
}

/* Soft upward floating motion */
@keyframes glitter-float {
  0% { transform: translateY(0); }
  100% { transform: translateY(-10px); }
}

                `}</style>
                <div style={modalHeaderRow}>
                  <h3 style={{ fontWeight: 800 }}>🧩 Bingo</h3>
                  <button
                    onClick={() =>
                      closeBingoGame(chatRoomId).finally(() => {
                        setShowBingoModal(false)
                        resetBingoLocal()
                      })
                    }
                    style={secondaryBtnStyle}
                  >
                    Close
                  </button>
                </div>

                {/* Scoreboard above the game (cumulative) */}
                {(() => {
                  const myBingoScore = (bingoGame.scores && bingoGame.scores[user.uid]) || 0
                  const partnerBingoScore = partnerId && bingoGame.scores ? bingoGame.scores[partnerId] || 0 : 0
                  const myTurn = bingoGame.currentTurn === user.uid
                  return (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 12px",
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.04)",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontWeight: 800, color: myTurn ? "#10B981" : "#E5E7EB" }}>
                          {user.displayName || "Your"} {myTurn ? "Turn" : ""}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{myBingoScore}</div>
                      </div>
                      <div style={{ fontWeight: 800, color: "#E5E7EB" }}>B I N G O</div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontWeight: 800, color: !myTurn ? "#EF4444" : "#E5E7EB" }}>
                          {partnerName} {!myTurn ? " Turn" : ""}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{partnerBingoScore}</div>
                      </div>
                    </div>
                  )
                })()}

                {bingoGame.status === "setup" && (
                  <>
                    <div style={{ marginBottom: 8, textAlign: "center" }}>
                      Tap cells to assign numbers in any order. You cannot change a number once assigned.
                    </div>
                    <div style={bingoGrid}>
                      {Array.from({ length: 25 }).map((_, i) => {
                        const val = myBingoNumbers[i] || ""
                        return (
                          <button
                            key={i}
                            onClick={() => setMyBingoNumberAt(i)}
                            style={{
                              ...bingoCell,
                              background: val ? "#1E293B" : "#0b1222",
                              color: "#fff",
                              border: "1px solid #334155",
                            }}
                            title="Assign number"
                          >
                            {val || ""}
                          </button>
                        )
                      })}
                    </div>
                    {(() => {
                      const filledCount = (myBingoNumbers || []).filter(Boolean).length
                      const canReady = filledCount === 25
                      return (
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                          <button
                            onClick={async () => {
                              // auto-save board, then Ready
                              const filled = Array(25)
                                .fill(null)
                                .map((_, i) => myBingoNumbers[i] || i + 1)
                              await setBingoBoard(chatRoomId, user.uid, filled)
                              await handleBingoReady()
                            }}
                            disabled={!canReady}
                            style={{
                              ...acceptBtnStyle,
                              opacity: canReady ? 1 : 0.6,
                              cursor: canReady ? "pointer" : "not-allowed",
                            }}
                          >
                            Ready
                          </button>
                        </div>
                      )
                    })()}
                    <div style={{ textAlign: "center", marginTop: 8, fontSize: 12 }}>
                      {iAmReady ? "You are ready. " : "You are not ready. "}
                      {otherReady ? `${partnerName} is ready.` : `${partnerName} is not ready.`}
                    </div>
                  </>
                )}

                {bingoGame.status === "active" && (
                  <>
                    <div style={{ textAlign: "center", marginBottom: 8, letterSpacing: 4, fontWeight: 800 }}>
                      {(() => {
                        const myLines = computeBingoLinesLocal(myMarks || Array(25).fill(false))
                        return Array.from("BINGO").map((ch, i) => (
                          <span
                            key={i}
                            style={{ color: i < Math.min(5, myLines) ? "#10B981" : "#9CA3AF", marginRight: 6 }}
                          >
                            {ch}
                          </span>
                        ))
                      })()}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 8,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{user.displayName || "You"}</div>
                        <div style={{ fontSize: 12 }}>
                          {bingoGame.currentTurn === user.uid ? "Your Turn" : `${partnerName}'s Turn`}
                        </div>
                      </div>
                      <div />
                    </div>

                    {/* optional info */}
                    <div style={{ marginBottom: 8, textAlign: "center" }}>
                      Called: {bingoGame.calledNumbers?.length || 0} / 25
                    </div>

                    <div style={bingoGrid}>
                      {(myBoard || Array(25).fill(null)).map((num, idx) => {
                        const marked = myMarks?.[idx]
                        const sourceUid = myMarkSources?.[idx] || null
                        const isMine = sourceUid === user.uid
                        const isMyTurn = bingoGame.currentTurn === user.uid
                        return (
                          <button
                            key={idx}
                            onClick={() => handleBingoPlayCell(idx)}
                            style={{
                              ...bingoCell,
                              background: marked ? (isMine ? "#14532d" : "#5a1c1c") : "#0b1222",
                              border: marked
                                ? isMine
                                  ? "2px solid #10B981"
                                  : "2px solid #EF4444"
                                : "1px solid #334155",
                              color: "#fff",
                              opacity: isMyTurn ? 1 : 0.7,
                              cursor: isMyTurn && !marked ? "pointer" : "not-allowed",
                              transition: "background-color .15s ease, border-color .15s ease",
                            }}
                            title={isMyTurn ? "Tap to play" : "Wait for your turn"}
                            disabled={!isMyTurn || !!marked}
                          >
                            {num || ""}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                {bingoGame.status === "ended" && (
                  <div
                    style={{
                      textAlign: "center",
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 12,
                      background: bingoGame.winnerUid
                        ? bingoGame.winnerUid === user.uid
                          ? "rgba(16,185,129,0.12)"
                          : "rgba(239,68,68,0.10)"
                        : "rgba(107,114,128,0.10)",
                      boxShadow: bingoGame.winnerUid
                        ? bingoGame.winnerUid === user.uid
                          ? "0 0 12px rgba(16,185,129,0.35)"
                          : "0 0 10px rgba(239,68,68,0.25)"
                        : "0 0 10px rgba(107,114,128,0.25)",
                      position: "relative",
                      overflow: "hidden",
                      width: "100%",
                      minHeight: 304,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        overflow: "hidden",
                        borderRadius: 12,
                        background: bingoGame.winnerUid
                          ? bingoGame.winnerUid === user.uid
                            ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.18))"
                            : "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(244,63,94,0.12))"
                          : "transparent",
                        boxShadow: bingoGame.winnerUid
                          ? bingoGame.winnerUid === user.uid
                            ? "inset 0 0 0 2px rgba(34,197,94,0.35)"
                            : "inset 0 0 0 2px rgba(239,68,68,0.25)"
                          : "none",
                      }}
                    >
                      {/* Winner Confetti */}
                      {bingoGame.winnerUid === user.uid && (
                        <>
                          {Array.from({ length: 60 }).map((_, i) => {
                            const left = Math.random() * 100
                            const delay = Math.random() * 300
                            const size = 6 + Math.random() * 6
                            const colors = ["#10B981", "#14B8A6", "#F59E0B", "#9CA3AF"]
                            const color = colors[i % colors.length]
                            return (
                              <div
                                key={`conf-${i}`}
                                className="bingo-confetti-piece"
                                style={{
                                  left: `${left}%`,
                                  background: color,
                                  width: size,
                                  height: size,
                                  animationDelay: `${delay}ms`,
                                }}
                              />
                            )
                          })}
                          {Array.from({ length: 36 }).map((_, i) => {
                            const left = Math.random() * 100
                            const top = Math.random() * 100
                            const delay = Math.random() * 2000
                            const size = 2 + Math.random() * 3
                            return (
                              <div
                                key={`glit-${i}`}
                                className="bingo-glitter"
                                style={{
                                  left: `${left}%`,
                                  top: `${top}%`,
                                  width: size,
                                  height: size,
                                  animationDelay: `${delay}ms`,
                                }}
                              />
                            )
                          })}
                        </>
                      )}

                      {/* Loser: subtle ribbons */}
                      {bingoGame.winnerUid && bingoGame.winnerUid !== user.uid && (
                        <>
                          {Array.from({ length: 24 }).map((_, i) => {
                            const left = (i / 24) * 100
                            const delay = (i % 6) * 80
                            const hues = ["#EF4444", "#F97316", "#9CA3AF"]
                            const bg = hues[i % hues.length]
                            return (
                              <div
                                key={`rib-${i}`}
                                className="bingo-ribbon"
                                style={{
                                  left: `${left}%`,
                                  background: bg,
                                  animationDelay: `${delay}ms`,
                                }}
                              />
                            )
                          })}
                        </>
                      )}
                    </div>

                    {(() => {
                      const iWon = bingoGame.winnerUid === user.uid
                      const title = iWon ? "BINGO! YOU WIN" : `${partnerName} WINS!`
                      const sub = iWon ? "Five in a row—well played!" : "Nice try—better luck next time."
                      const badgeStyle = iWon
                        ? {
                            background: "rgba(16,185,129,0.18)",
                            color: "#10B981",
                            border: "1px solid rgba(16,185,129,0.35)",
                          }
                        : {
                            background: "rgba(239,68,68,0.14)",
                            color: "#EF4444",
                            border: "1px solid rgba(239,68,68,0.28)",
                          }

                      return (
                        <div
                          style={{
                            position: "relative",
                            zIndex: 1,
                            width: "100%",
                            maxWidth: 520,
                            padding: "20px 24px",
                            textAlign: "center",
                            borderRadius: 16,
                            background: "rgba(255, 255, 255, 0.05)",
                            backdropFilter: "blur(12px)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                            color: "#fff",
                          }}
                        >
                          <div className="bingo-heading">{title}</div>
                          <div className="bingo-subtext">{sub}</div>

                          <div style={{ marginTop: 24 }}>
                            <button
                              onClick={() => startBingoRematch(chatRoomId).finally(() => resetBingoLocal())}
                              className="bingo-tryagain-btn"
                              title="Start a new Bingo game"
                            >
                              Try Again
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

{showPingModal && pingGame && (pingGame.status === "active" || pingGame.status === "ended") && (
  <div role="dialog" aria-modal="true" style={{...modalOverlayStyle, position: "absolute", top: 0, left: 0, right: 0, bottom: 60, background: "rgba(0,0,0,0.2)", backdropFilter: "blur(1px)", zIndex: 10, pointerEvents: "none"}}>
    <div onClick={(e) => e.stopPropagation()} style={{...modalCardStyle, background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(8px)", pointerEvents: "auto"}}>

              <div style={modalHeaderRow}>
                <h3 style={{ fontWeight: 800 }}>🏓 Ping Pong</h3>
                <button
                  onClick={() => closePingPongGame(chatRoomId).finally(() => setShowPingModal(false))}
                  style={secondaryBtnStyle}
                >
                  Close
                </button>
              </div>

              <PingPongCanvas
                user={user}
                partnerId={partnerId}
                game={pingGame}
                isHost={isPingHost}
                onPaddle={(y01) => updatePingPongPaddle(chatRoomId, user.uid, y01)}
                onHostUpdate={(state) => hostUpdatePingPongState(chatRoomId, state)}
                onRematch={() => startPingPongRematch(chatRoomId)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 60,
}
const modalCardStyle = {
  width: "100%",
  maxWidth: 480,
  background: "linear-gradient(180deg, #0f172a, #111827)",
  color: "#F9FAFB",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
}
const gameRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#0b1222",
  border: "1px solid #1f2937",
  borderRadius: 12,
  padding: "10px 12px",
}

const gradientBtn = (from, to) => ({
  background: `linear-gradient(90deg, ${from}, ${to})`,
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
})
const requestBtnStyle = gradientBtn("#3B82F6", "#1E40AF")
const acceptBtnStyle = gradientBtn("#10B981", "#065F46")
const declineBtnStyle = gradientBtn("#EF4444", "#7F1D1D")
const secondaryBtnStyle = {
  background: "#1f2937",
  color: "white",
  border: "1px solid #374151",
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
}
const modalHeaderRow = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }
const scoreRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#0b1222",
  borderRadius: 10,
  padding: "8px 12px",
  marginBottom: 10,
}
const scoreCol = { textAlign: "center", flex: 1 }
const scoreName = { fontSize: 12, opacity: 0.8 }
const scoreValue = { fontSize: 22, fontWeight: 800, color: "#fbbf24" }
const bingoGrid = { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }
const bingoCell = {
  height: 56,
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
}

function PingPongCanvas({ user, partnerId, game, isHost, onPaddle, onHostUpdate, onRematch }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const lastHostSendRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    const w = canvas.width
    const h = canvas.height

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      // table
      ctx.fillStyle = "#0b1222"
      ctx.fillRect(0, 0, w, h)
      // center line
      ctx.strokeStyle = "#334155"
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      ctx.setLineDash([])

      const paddles = game.paddles || {}
      const meY = paddles[user.uid] ?? 0.5
      const oppY = paddles[partnerId] ?? 0.5

      // paddles
      const padW = 80
      const padH = 10
      // bottom - me
      ctx.fillStyle = "#10B981"
      ctx.fillRect((w - padW) / 2, h - padH - meY * (h * 0.6), padW, padH)
      // top - opponent
      ctx.fillStyle = "#3B82F6"
      ctx.fillRect((w - padW) / 2, oppY * (h * 0.6), padW, padH)

      // ball
      const ball = game.ball || { x: 0.5, y: 0.5 }
      ctx.fillStyle = "#fbbf24"
      ctx.beginPath()
      ctx.arc(ball.x * w, ball.y * h, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    draw()
  }, [game, user.uid, partnerId])

  useEffect(() => {
    if (!isHost || game.status !== "active") return
    let raf = 0
    const step = (t) => {
      raf = requestAnimationFrame(step)
      // host: simulate simple physics and push to Firestore ~20 fps
      const now = performance.now()
      if (now - lastHostSendRef.current < 50) return // throttle
      lastHostSendRef.current = now

      const paddles = game.paddles || {}
      const meY = paddles[game.requesterId] ?? 0.5
      const oppY = paddles[game.responderId] ?? 0.5

      let { x, y, vx, vy } = game.ball || { x: 0.5, y: 0.5, vx: 0.006, vy: 0.004 }
      x += vx
      y += vy

      // walls
      if (x < 0.03 || x > 0.97) vx *= -1

      // paddle collisions
      // bottom - paddle area near y ~ 0.9
      if (y >= 0.92) {
        const within = Math.abs(x - 0.5) <= 0.2 // centered paddle
        if (within) {
          vy = -Math.abs(vy)
        } else {
          // opponent scores
          const scores = { ...(game.scores || {}) }
          scores[game.responderId] = (scores[game.responderId] || 0) + 1
          x = 0.5
          y = 0.5
          vx = 0.006
          vy = -0.004
          const winUid = scores[game.responderId] >= 5 ? game.responderId : null
          onHostUpdate({
            ball: { x, y, vx, vy },
            scores,
            status: winUid ? "ended" : "active",
            winnerUid: winUid,
          })
          return
        }
      }
      // top paddle y ~ 0.08
      if (y <= 0.08) {
        const within = Math.abs(x - 0.5) <= 0.2
        if (within) {
          vy = Math.abs(vy)
        } else {
          // me scores (host assumed requester)
          const scores = { ...(game.scores || {}) }
          scores[game.requesterId] = (scores[game.requesterId] || 0) + 1
          x = 0.5
          y = 0.5
          vx = -0.006
          vy = 0.004
          const winUid = scores[game.requesterId] >= 5 ? game.requesterId : null
          onHostUpdate({
            ball: { x, y, vx, vy },
            scores,
            status: winUid ? "ended" : "active",
            winnerUid: winUid,
          })
          return
        }
      }

      onHostUpdate({ ball: { x, y, vx, vy } })
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, game?.status, game?.ball, game?.paddles, game?.scores, game.requesterId, game.responderId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMove = (clientY) => {
      const rect = canvas.getBoundingClientRect()
      const y = (clientY - rect.top) / rect.height
      onPaddle(Math.max(0, Math.min(1, y)))
    }

    const onMouseMove = (e) => onMove(e.clientY)
    const onTouchMove = (e) => {
      const t = e.touches[0]
      if (t) onMove(t.clientY)
    }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("touchmove", onTouchMove)
    }
  }, [onPaddle])

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <strong>You:</strong> {game.scores?.[user.uid] || 0}
        </div>
        <div>
          <strong>Opponent:</strong> {game.scores?.[partnerId] || 0}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={520}
        height={320}
        style={{ width: "100%", background: "#0b1222", borderRadius: 12 }}
      />
      {game.status === "ended" && (
        <div style={{ textAlign: "center", marginTop: 10, fontWeight: 800 }}>
          {game.winnerUid === user.uid ? "🎉 You won!" : "😔 You lost."}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
            <button onClick={onRematch} style={requestBtnStyle}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
