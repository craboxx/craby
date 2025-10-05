"use client"

import { useState, useEffect } from "react"
import { getGroupMembers, listenToPresence } from "../firebase/firestore"

export default function MembersModal({
  group,
  user,
  isAdmin,
  isCreator,
  onClose,
  onPromoteAdmin,
  onDemoteAdmin,
  onRemoveMember,
}) {
  const [members, setMembers] = useState([])
  const [memberPresence, setMemberPresence] = useState({})

  useEffect(() => {
    loadMembers()
  }, [group.id])

  const loadMembers = async () => {
    const membersList = await getGroupMembers(group.id)
    setMembers(membersList)

    // Listen to presence for each member
    membersList.forEach((member) => {
      listenToPresence(member.id, (status) => {
        setMemberPresence((prev) => ({
          ...prev,
          [member.id]: status,
        }))
      })
    })
  }

  const getPresenceColor = (status) => {
    switch (status) {
      case "online":
        return "#4caf50"
      case "in-chat":
        return "#2196f3"
      default:
        return "#999"
    }
  }

  const getPresenceText = (status) => {
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
    <div className="members-modal-overlay" onClick={onClose}>
      <div className="members-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="members-modal-header">
          <h2 className="members-modal-title">Group Members</h2>
          <button onClick={onClose} className="members-modal-close-btn">
            ✕
          </button>
        </div>

        <div className="members-modal-subtitle">
          {members.length} {members.length === 1 ? "member" : "members"} in {group.name}
        </div>

        <div className="members-modal-list">
          {members.map((member) => (
            <div key={member.id} className="member-card">
              <div className="member-card-left">
                <div className="member-avatar">
                  <div
                    className="member-presence-indicator"
                    style={{ backgroundColor: getPresenceColor(memberPresence[member.id]) }}
                  />
                  <span className="member-avatar-text">
                    {(member.username || member.nickname || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="member-info">
                  <div className="member-name-row">
                    <span className="member-username">{member.username || member.nickname}</span>
                    {group.createdBy === member.id && (
                      <span className="member-badge member-badge-creator">Creator</span>
                    )}
                    {group.admins?.includes(member.id) && (
                      <span className="member-badge member-badge-admin">Admin</span>
                    )}
                  </div>
                  <div className="member-status">
                    <span className="member-status-text">{getPresenceText(memberPresence[member.id])}</span>
                    {member.gender && <span className="member-gender"> • {member.gender}</span>}
                  </div>
                </div>
              </div>

              {isAdmin && member.id !== user.uid && member.id !== group.createdBy && (
                <div className="member-actions">
                  {group.admins?.includes(member.id) ? (
                    <button
                      onClick={() => onDemoteAdmin(member.id, member.username || member.nickname)}
                      className="member-action-btn member-action-demote"
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      onClick={() => onPromoteAdmin(member.id, member.username || member.nickname)}
                      className="member-action-btn member-action-promote"
                    >
                      Promote
                    </button>
                  )}
                  <button
                    onClick={() => onRemoveMember(member.id, member.username || member.nickname)}
                    className="member-action-btn member-action-remove"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="members-modal-footer">
          <button onClick={onClose} className="members-modal-back-btn">
            ← Back to Chat
          </button>
        </div>
      </div>
    </div>
  )
}
