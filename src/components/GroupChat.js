"use client"

import { useState, useEffect, useRef } from "react"
import {
  listenToGroup,
  listenToGroupMessages,
  sendGroupMessage,
  leaveGroup,
  getGroupMembers,
  approveJoinRequest,
  rejectJoinRequest,
  removeMemberFromGroup,
  promoteToAdmin,
  demoteFromAdmin,
  parseMentions,
  addMessageReaction,
  togglePinMessage,
  deleteGroupMessage,
  editGroupMessage,
  getUserProfile,
} from "../firebase/firestore"
import GroupSettingsModal from "./GroupSettingsModal"
import InviteMemberModal from "./InviteMemberModal"
import MembersModal from "./MembersModal"

export default function GroupChat({ user, groupId, onBack }) {
  const [group, setGroup] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [members, setMembers] = useState([])
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [showJoinRequests, setShowJoinRequests] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingMessageText, setEditingMessageText] = useState("")
  const [showReactionPicker, setShowReactionPicker] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionSearch, setMentionSearch] = useState("")
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  const [filteredMembers, setFilteredMembers] = useState([])
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [reactionUsers, setReactionUsers] = useState({ open: false, emoji: "", users: [], loading: false, msgId: "" })

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const commonEmojis = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👏"]

  useEffect(() => {
    const unsubscribeGroup = listenToGroup(groupId, (groupData) => {
      setGroup(groupData)
    })

    const unsubscribeMessages = listenToGroupMessages(groupId, (msgs) => {
      setMessages(msgs)
    })

    loadMembers()

    return () => {
      unsubscribeGroup()
      unsubscribeMessages()
    }
  }, [groupId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    const text = newMessage
    const cursorPos = inputRef.current?.selectionStart || text.length

    // Find @ symbol before cursor
    const textBeforeCursor = text.substring(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf("@")

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)

      // Check if there's a space after @ (which would end the mention)
      if (!textAfterAt.includes(" ")) {
        setMentionStartIndex(lastAtIndex)
        setMentionSearch(textAfterAt)
        setShowMentionDropdown(true)

        // Filter members based on search
        const filtered = members.filter((m) =>
          (m.username || m.nickname || "").toLowerCase().includes(textAfterAt.toLowerCase()),
        )
        setFilteredMembers(filtered)
        setSelectedMentionIndex(0)
      } else {
        setShowMentionDropdown(false)
      }
    } else {
      setShowMentionDropdown(false)
    }
  }, [newMessage, members])

  const loadMembers = async () => {
    const membersList = await getGroupMembers(groupId)
    setMembers(membersList)
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const mentions = parseMentions(newMessage, members)

    const extra = {}
    if (replyingTo) {
      const raw = replyingTo.message || ""
      const snippet = raw.length > 140 ? raw.slice(0, 140) + "…" : raw
      extra.replyTo = {
        messageId: replyingTo.id,
        senderId: replyingTo.senderId,
        senderName: replyingTo.senderName,
        snippet,
      }
    }

    await sendGroupMessage(groupId, user.uid, user.nickname || user.username, newMessage, mentions, extra)
    setNewMessage("")
    setReplyingTo(null)
  }

  const handleSelectMention = (member) => {
    const username = member.username || member.nickname
    const beforeMention = newMessage.substring(0, mentionStartIndex)
    const afterMention = newMessage.substring(mentionStartIndex + mentionSearch.length + 1)

    setNewMessage(`${beforeMention}@${username} ${afterMention}`)
    setShowMentionDropdown(false)
    inputRef.current?.focus()
  }

  const handleInputKeyDown = (e) => {
    if (showMentionDropdown && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedMentionIndex((prev) => (prev + 1) % filteredMembers.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedMentionIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length)
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        handleSelectMention(filteredMembers[selectedMentionIndex])
      } else if (e.key === "Escape") {
        setShowMentionDropdown(false)
      }
    }
  }

  const handleEditMessage = async (messageId) => {
    if (!editingMessageText.trim()) return

    try {
      await editGroupMessage(groupId, messageId, editingMessageText)
      setEditingMessageId(null)
      setEditingMessageText("")
    } catch (error) {
      console.error("Error editing message:", error)
      alert("Failed to edit message")
    }
  }

  const handleDeleteMessage = async (messageId) => {
    const confirmed = window.confirm("Delete this message?")
    if (!confirmed) return

    try {
      await deleteGroupMessage(groupId, messageId)
    } catch (error) {
      console.error("Error deleting message:", error)
      alert("Failed to delete message")
    }
  }

  const handleReaction = async (messageId, emoji) => {
    try {
      await addMessageReaction(groupId, messageId, user.uid, emoji)
      setShowReactionPicker(null)
    } catch (error) {
      console.error("Error adding reaction:", error)
    }
  }

  const handlePinMessage = async (messageId) => {
    try {
      await togglePinMessage(groupId, messageId)
    } catch (error) {
      console.error("Error pinning message:", error)
    }
  }

  const handleLeaveGroup = async () => {
    const confirmed = window.confirm(`Are you sure you want to leave ${group?.name}?`)
    if (!confirmed) return

    try {
      await leaveGroup(groupId, user.uid)
      alert("You have left the group")
      onBack()
    } catch (error) {
      console.error("Error leaving group:", error)
      alert("Failed to leave group")
    }
  }

  const handleApproveRequest = async (requestUserId) => {
    try {
      const request = group.joinRequests.find((r) => r.uid === requestUserId)
      await approveJoinRequest(groupId, requestUserId, request.username)
      loadMembers()
    } catch (error) {
      console.error("Error approving request:", error)
    }
  }

  const handleRejectRequest = async (requestUserId) => {
    try {
      await rejectJoinRequest(groupId, requestUserId)
    } catch (error) {
      console.error("Error rejecting request:", error)
    }
  }

  const handleRemoveMember = async (memberId, memberName) => {
    const confirmed = window.confirm(`Remove ${memberName} from the group?`)
    if (!confirmed) return

    try {
      await removeMemberFromGroup(groupId, memberId)
      loadMembers()
    } catch (error) {
      console.error("Error removing member:", error)
    }
  }

  const handlePromoteAdmin = async (memberId, memberName) => {
    try {
      await promoteToAdmin(groupId, memberId)
      alert(`${memberName} is now an admin`)
      loadMembers()
    } catch (error) {
      console.error("Error promoting admin:", error)
    }
  }

  const handleDemoteAdmin = async (memberId, memberName) => {
    try {
      await demoteFromAdmin(groupId, memberId)
      alert(`${memberName} is no longer an admin`)
      loadMembers()
    } catch (error) {
      console.error("Error demoting admin:", error)
    }
  }

  const handleReplyToMessage = (message) => {
    setReplyingTo(message)
    inputRef.current?.focus()
  }

  const isAdmin = group?.admins?.includes(user.uid)
  const isCreator = group?.createdBy === user.uid

  const isMessageMentioningMe = (message) => {
    return message.mentions?.includes(user.uid)
  }

  const highlightMentions = (text) => {
    return text.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>')
  }

  const extractReplyInfo = (messageObj) => {
    const text = messageObj.message || ""
    if (messageObj.replyTo) {
      return {
        type: "structured",
        replyTo: messageObj.replyTo,
        actualMessage: text,
      }
    }
    const replyMatch = text.match(/^\[Reply to @(.+?)\] (.+)$/)
    if (replyMatch) {
      return {
        type: "legacy",
        replyTo: { senderName: replyMatch[1], snippet: "" },
        actualMessage: replyMatch[2],
      }
    }
    return { type: "none", actualMessage: text }
  }

  const isMessagePinned = (messageId) => {
    return group?.pinnedMessages?.includes(messageId)
  }

  const openReactionUsers = async (messageId, emoji, userIds = []) => {
    setReactionUsers({ open: true, emoji, users: [], loading: true, msgId: messageId })
    try {
      const profiles = await Promise.all(
        userIds.map(async (uid) => {
          const profile = await getUserProfile(uid)
          return profile ? { uid, username: profile.username || profile.nickname || uid } : { uid, username: uid }
        }),
      )
      setReactionUsers({ open: true, emoji, users: profiles, loading: false, msgId: messageId })
    } catch (e) {
      console.error(e)
      setReactionUsers({ open: true, emoji, users: [], loading: false, msgId: messageId })
    }
  }

  const toggleMyReactionFromModal = async () => {
    if (!reactionUsers.open) return
    await addMessageReaction(groupId, reactionUsers.msgId, user.uid, reactionUsers.emoji)
  }

  if (!group) {
    return (
      <div className="group-chat-loading">
        <p>Loading group...</p>
      </div>
    )
  }

  return (
    <div className="group-chat-container">
      {showSettings && (
        <GroupSettingsModal
          group={group}
          user={user}
          onClose={() => setShowSettings(false)}
          onGroupDeleted={onBack}
          onSettingsUpdated={() => {}}
        />
      )}

      {showInviteModal && <InviteMemberModal group={group} user={user} onClose={() => setShowInviteModal(false)} />}

      {showMembersModal && (
        <MembersModal
          group={group}
          user={user}
          isAdmin={isAdmin}
          isCreator={isCreator}
          onClose={() => setShowMembersModal(false)}
          onPromoteAdmin={handlePromoteAdmin}
          onDemoteAdmin={handleDemoteAdmin}
          onRemoveMember={handleRemoveMember}
        />
      )}

      <div className="group-chat-mobile-nav">
        <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="group-chat-mobile-menu-btn">
          ☰
        </button>
        <h2 className="group-chat-mobile-title">{group.name}</h2>
      </div>

      <div className="group-chat-box">
        <div className="group-chat-header">
          <div className="group-chat-header-info">
            <h2 className="group-chat-title">{group.name}</h2>
            <p className="group-chat-subtitle">
              {group.members?.length || 0} members {group.description && `• ${group.description}`}
            </p>
          </div>
          <div className="group-chat-header-buttons">
            {isAdmin && (
              <>
                <button onClick={() => setShowInviteModal(true)} className="group-chat-invite-btn">
                  👥 Invite
                </button>
                <button onClick={() => setShowSettings(true)} className="group-chat-settings-btn">
                  ⚙️ Settings
                </button>
              </>
            )}
            <button onClick={() => setShowMembersModal(true)} className="group-chat-members-btn">
              👤 Members
            </button>
            {isAdmin && group.joinRequests?.length > 0 && (
              <button onClick={() => setShowJoinRequests(!showJoinRequests)} className="group-chat-requests-btn">
                📋 Requests ({group.joinRequests.length})
              </button>
            )}
            <button onClick={handleLeaveGroup} className="group-chat-leave-btn">
              🚪 Leave
            </button>
            <button onClick={onBack} className="group-chat-back-btn">
              ← Back
            </button>
          </div>
        </div>

        {showMobileMenu && (
          <div className="group-chat-mobile-menu">
            {isAdmin && (
              <button onClick={() => setShowInviteModal(true)} className="group-chat-mobile-menu-item">
                Invite Members
              </button>
            )}
            <button onClick={() => setShowMembersModal(true)} className="group-chat-mobile-menu-item">
              Members
            </button>
            {isAdmin && group.joinRequests?.length > 0 && (
              <button onClick={() => setShowJoinRequests(!showJoinRequests)} className="group-chat-mobile-menu-item">
                Requests ({group.joinRequests.length})
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setShowSettings(true)} className="group-chat-mobile-menu-item">
                Group Settings
              </button>
            )}
            <button onClick={handleLeaveGroup} className="group-chat-mobile-menu-item">
              Leave Group
            </button>
            <button onClick={onBack} className="group-chat-mobile-menu-item">
              Back to Groups
            </button>
          </div>
        )}

        {showJoinRequests && isAdmin && (
          <div className="group-join-requests-panel">
            <h3 className="group-panel-title">Join Requests</h3>
            {group.joinRequests.map((request) => (
              <div key={request.uid} className="group-request-item">
                <span className="group-request-username">{request.username}</span>
                <div className="group-request-buttons">
                  <button onClick={() => handleApproveRequest(request.uid)} className="group-approve-btn">
                    Approve
                  </button>
                  <button onClick={() => handleRejectRequest(request.uid)} className="group-reject-btn">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="group-chat-messages">
          {messages.length === 0 ? (
            <div className="group-chat-empty-state">
              <p>No messages yet. Start the conversation!</p>
              <p style={{ fontSize: "14px", color: "#999", marginTop: "8px" }}>Tip: Use @username to mention someone</p>
            </div>
          ) : (
            messages.map((msg) => {
              const replyInfo = extractReplyInfo(msg)
              const isMine = msg.senderId === user.uid
              return (
                <div
                  key={msg.id}
                  className={`group-chat-message-wrapper ${isMine ? "group-chat-message-right" : "group-chat-message-left"}`}
                >
                  <div
                    className={`group-chat-message ${isMine ? "group-chat-message-sent" : "group-chat-message-received"} ${isMessageMentioningMe(msg) ? "group-chat-message-mentioned" : ""} ${isMessagePinned(msg.id) ? "group-chat-message-pinned" : ""}`}
                  >
                    {isMessagePinned(msg.id) && <div className="group-message-pin-indicator">📌 Pinned Message</div>}

                    {!isMine && <div className="group-chat-message-sender-highlight">{msg.senderName}</div>}

                    {(replyInfo.type === "structured" || replyInfo.type === "legacy") && (
                      <div className="group-message-reply-reference">
                        <div className="group-message-reply-line" />
                        <div className="group-message-reply-content">
                          <span className="group-message-reply-user">
                            @{replyInfo.replyTo.senderName || replyInfo.replyTo.sender || replyInfo.replyTo.replyToUser}
                          </span>
                          {replyInfo.type === "structured" && replyInfo.replyTo.snippet && (
                            <span className="group-message-reply-snippet">{replyInfo.replyTo.snippet}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {editingMessageId === msg.id ? (
                      <div className="group-message-edit-container">
                        <input
                          type="text"
                          value={editingMessageText}
                          onChange={(e) => setEditingMessageText(e.target.value)}
                          className="group-message-edit-input"
                          autoFocus
                        />
                        <div className="group-message-edit-buttons">
                          <button onClick={() => handleEditMessage(msg.id)} className="group-message-save-btn">
                            ✓ Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingMessageId(null)
                              setEditingMessageText("")
                            }}
                            className="group-message-cancel-btn"
                          >
                            ✕ Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className="group-chat-message-text"
                          dangerouslySetInnerHTML={{ __html: highlightMentions(replyInfo.actualMessage) }}
                        />
                        {msg.edited && <span className="group-message-edited">(edited)</span>}
                      </>
                    )}

                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="group-message-reactions">
                        {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                          <button
                            key={emoji}
                            onClick={() => openReactionUsers(msg.id, emoji, userIds)}
                            className={`group-message-reaction ${userIds.includes(user.uid) ? "group-message-reaction-active" : ""}`}
                            title={`View ${emoji} reactions`}
                          >
                            {emoji} {userIds.length}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="group-message-actions">
                      <button
                        onClick={() => handleReplyToMessage(msg)}
                        className="group-message-action-btn"
                        title="Reply to message"
                      >
                        ↩️
                      </button>
                      <button
                        onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                        className="group-message-action-btn"
                        title="Add reaction"
                      >
                        😊
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handlePinMessage(msg.id)}
                          className="group-message-action-btn"
                          title={isMessagePinned(msg.id) ? "Unpin message" : "Pin message"}
                        >
                          {isMessagePinned(msg.id) ? "📍" : "📌"}
                        </button>
                      )}
                      {msg.senderId === user.uid && (
                        <>
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id)
                              setEditingMessageText(replyInfo.actualMessage)
                            }}
                            className="group-message-action-btn"
                            title="Edit message"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="group-message-action-btn group-message-action-btn-danger"
                            title="Delete message"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                      {isAdmin && msg.senderId !== user.uid && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="group-message-action-btn group-message-action-btn-danger"
                          title="Delete message (Admin)"
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    {showReactionPicker === msg.id && (
                      <div className="group-reaction-picker">
                        {commonEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(msg.id, emoji)}
                            className="group-reaction-picker-emoji"
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {replyingTo && (
          <div className="group-chat-reply-preview">
            <div className="group-chat-reply-preview-content">
              <span className="group-chat-reply-preview-label">Replying to</span>
              <span className="group-chat-reply-preview-user">@{replyingTo.senderName}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="group-chat-reply-preview-close">
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="group-chat-input-container">
          <div className="group-chat-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type a message... (use @username to mention)"
              className="group-chat-input"
            />

            {showMentionDropdown && filteredMembers.length > 0 && (
              <div className="mention-dropdown">
                {filteredMembers.map((member, index) => (
                  <div
                    key={member.id}
                    className={`mention-dropdown-item ${index === selectedMentionIndex ? "mention-dropdown-item-selected" : ""}`}
                    onClick={() => handleSelectMention(member)}
                  >
                    <div className="mention-dropdown-avatar">
                      {(member.username || member.nickname || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="mention-dropdown-info">
                      <div className="mention-dropdown-name">{member.username || member.nickname}</div>
                      {group.admins?.includes(member.id) && <span className="mention-dropdown-badge">Admin</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="group-chat-send-btn">
            Send
          </button>
        </form>
      </div>

      {reactionUsers.open && (
        <div
          className="reaction-users-modal-overlay"
          onClick={() => setReactionUsers({ open: false, emoji: "", users: [], loading: false, msgId: "" })}
        >
          <div className="reaction-users-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reaction-users-header">
              <div className="reaction-users-title">
                Reactions {reactionUsers.emoji && <span className="reaction-users-emoji">{reactionUsers.emoji}</span>}
              </div>
              <button
                className="reaction-users-close"
                onClick={() => setReactionUsers({ open: false, emoji: "", users: [], loading: false, msgId: "" })}
              >
                ✕
              </button>
            </div>
            <div className="reaction-users-content">
              {reactionUsers.loading ? (
                <div className="reaction-users-loading">Loading...</div>
              ) : reactionUsers.users.length === 0 ? (
                <div className="reaction-users-empty">No users yet.</div>
              ) : (
                <div className="reaction-users-list">
                  {reactionUsers.users.map((u) => (
                    <div key={u.uid} className="reaction-user-chip">
                      <div className="reaction-user-avatar">{(u.username || "?").charAt(0).toUpperCase()}</div>
                      <div className="reaction-user-name">{u.username}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="reaction-users-footer">
              <button className="reaction-users-toggle-btn" onClick={toggleMyReactionFromModal}>
                Toggle my {reactionUsers.emoji} reaction
              </button>
              <button
                className="reaction-users-close-secondary"
                onClick={() => setReactionUsers({ open: false, emoji: "", users: [], loading: false, msgId: "" })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
