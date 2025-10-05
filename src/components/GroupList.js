"use client"

import { useState, useEffect } from "react"
import { getUserGroups, listenToTrendingGroups } from "../firebase/firestore"

export default function GroupList({ user, onSelectGroup, onCreateGroup, onJoinGroup, onBack }) {
  const [myGroups, setMyGroups] = useState([])
  const [trendingGroups, setTrendingGroups] = useState([])
  const [activeTab, setActiveTab] = useState("my-groups")

  useEffect(() => {
    loadMyGroups()

    const unsubscribe = listenToTrendingGroups((groups) => {
      setTrendingGroups(groups)
    })

    return () => unsubscribe()
  }, [user.uid])

  const loadMyGroups = async () => {
    const groups = await getUserGroups(user.uid)
    setMyGroups(groups)
  }

  const isUserInGroup = (group) => {
    return group.members?.includes(user.uid)
  }

  const hasPendingRequest = (group) => {
    return group.joinRequests?.some((req) => req.uid === user.uid)
  }

  const handleBackClick = () => {
    if (onBack && typeof onBack === "function") {
      onBack()
    }
  }

  return (
    <div className="group-list-container">
      <div className="group-list-header">
        <button onClick={handleBackClick} className="group-list-back-btn">
          ← Back
        </button>
        <h2 className="group-list-title">Groups</h2>
        <button onClick={onCreateGroup} className="group-create-btn">
          + Create Group
        </button>
      </div>

      <div className="group-tabs">
        <button
          onClick={() => setActiveTab("my-groups")}
          className={`group-tab ${activeTab === "my-groups" ? "group-tab-active" : ""}`}
        >
          My Groups ({myGroups.length})
        </button>
        <button
          onClick={() => setActiveTab("trending")}
          className={`group-tab ${activeTab === "trending" ? "group-tab-active" : ""}`}
        >
          Trending
        </button>
      </div>

      <div className="group-list-content">
        {activeTab === "my-groups" && (
          <div className="group-list">
            {myGroups.length === 0 ? (
              <div className="group-empty-state">
                <p>{"You haven't joined any groups yet"}</p>
                <p style={{ fontSize: "14px", color: "#999", marginTop: "8px" }}>
                  Create a group or join trending groups!
                </p>
              </div>
            ) : (
              myGroups.map((group) => (
                <div key={group.id} className="group-item" onClick={() => onSelectGroup(group)}>
                  <div className="group-item-info">
                    <div className="group-item-name">{group.name}</div>
                    {group.description && <div className="group-item-description">{group.description}</div>}
                    <div className="group-item-meta">
                      {group.members?.length || 0} members • {group.admins?.includes(user.uid) && "⭐ Admin"}
                    </div>
                  </div>
                  <div className="group-item-arrow">→</div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "trending" && (
          <div className="group-list">
            {trendingGroups.length === 0 ? (
              <div className="group-empty-state">
                <p>No trending groups yet</p>
              </div>
            ) : (
              trendingGroups.map((group) => (
                <div key={group.id} className="group-item">
                  <div className="group-item-info">
                    <div className="group-item-name">
                      {group.name}
                      {!group.isPublic && <span style={{ marginLeft: "8px", fontSize: "12px" }}>🔒</span>}
                    </div>
                    {group.description && <div className="group-item-description">{group.description}</div>}
                    <div className="group-item-meta">
                      {group.members?.length || 0} members • Activity: {group.activityScore || 0}
                    </div>
                  </div>
                  {isUserInGroup(group) ? (
                    <button onClick={() => onSelectGroup(group)} className="group-join-btn">
                      Open
                    </button>
                  ) : hasPendingRequest(group) ? (
                    <button disabled className="group-pending-btn">
                      Pending
                    </button>
                  ) : (
                    <button onClick={() => onJoinGroup(group)} className="group-join-btn">
                      Join
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
