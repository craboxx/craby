import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  arrayUnion,
  arrayRemove,
  limit,
} from "firebase/firestore"
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbServerTimestamp } from "firebase/database"
import { db, rtdb } from "./firebaseConfig"

// Check if username is available
export const checkUsernameAvailable = async (username) => {
  const usernameDoc = await getDoc(doc(db, "usernames", username.toLowerCase()))
  return !usernameDoc.exists()
}

// Create user profile in Firestore
export const createUserProfile = async (uid, email, username) => {
  await setDoc(doc(db, "users", uid), {
    uid,
    email,
    username,
    createdAt: serverTimestamp(),
    friends: [],
    blockedUsers: [],
  })

  // Reserve username
  await setDoc(doc(db, "usernames", username.toLowerCase()), {
    uid,
    username,
  })
}

// Get user profile
export const getUserProfile = async (uid) => {
  const userDoc = await getDoc(doc(db, "users", uid))
  return userDoc.exists() ? userDoc.data() : null
}

// Get user by username
export const getUserByUsername = async (username) => {
  const usernameDoc = await getDoc(doc(db, "usernames", username.toLowerCase()))
  if (!usernameDoc.exists()) return null

  const uid = usernameDoc.data().uid
  return await getUserProfile(uid)
}

// Add user to waiting pool
export const addToWaitingPool = async (uid, username) => {
  const blockedUsers = await getBlockedUsers(uid)

  await setDoc(doc(db, "waitingPool", uid), {
    uid,
    username,
    blockedUsers: blockedUsers.map((u) => u.uid),
    timestamp: serverTimestamp(),
  })
}

// Remove user from waiting pool
export const removeFromWaitingPool = async (uid) => {
  await deleteDoc(doc(db, "waitingPool", uid))
}

// Get waiting users
export const getWaitingUsers = async () => {
  const waitingQuery = query(collection(db, "waitingPool"), orderBy("timestamp"))
  const snapshot = await getDocs(waitingQuery)
  return snapshot.docs.map((doc) => doc.data())
}

export const getExistingChatRoom = async (user1Id, user2Id) => {
  const q = query(
    collection(db, "chatRooms"),
    where("participants", "array-contains", user1Id),
    where("active", "==", true),
  )

  const snapshot = await getDocs(q)

  for (const doc of snapshot.docs) {
    const room = doc.data()
    if (room.participants.includes(user2Id)) {
      return { id: doc.id, ...room }
    }
  }

  return null
}

export const createChatRoomAtomic = async (user1Id, user2Id, user1Name, user2Name, chatType = "random") => {
  // Check if chat room already exists
  const existingRoom = await getExistingChatRoom(user1Id, user2Id)
  if (existingRoom) {
    console.log("[v0] Using existing chat room:", existingRoom.id)
    return existingRoom.id
  }

  // Create a deterministic room ID based on user IDs to prevent duplicates
  const sortedIds = [user1Id, user2Id].sort()
  const roomKey = `${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`

  try {
    const chatRoomRef = await addDoc(collection(db, "chatRooms"), {
      participants: [user1Id, user2Id],
      participantNames: {
        [user1Id]: user1Name,
        [user2Id]: user2Name,
      },
      chatType,
      createdAt: serverTimestamp(),
      active: true,
      roomKey,
    })

    console.log("[v0] Created new chat room:", chatRoomRef.id)
    return chatRoomRef.id
  } catch (error) {
    console.error("[v0] Error creating chat room:", error)
    // If creation fails, check again for existing room
    const retryRoom = await getExistingChatRoom(user1Id, user2Id)
    if (retryRoom) {
      return retryRoom.id
    }
    throw error
  }
}

// Check if user is currently in an active chat
export const isUserInActiveChat = async (uid) => {
  const q = query(
    collection(db, "chatRooms"),
    where("participants", "array-contains", uid),
    where("active", "==", true),
  )

  const snapshot = await getDocs(q)
  return !snapshot.empty
}

export const findAndMatchWaitingUser = async (currentUserId, currentUsername, blockedUserIds = []) => {
  const alreadyInChat = await isUserInActiveChat(currentUserId)
  if (alreadyInChat) {
    console.log("[v0] User is already in an active chat, cannot match")
    return null
  }

  const waitingQuery = query(collection(db, "waitingPool"), orderBy("timestamp"))
  const snapshot = await getDocs(waitingQuery)

  const waitingUsers = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))

  // Find a suitable match
  for (const waitingUser of waitingUsers) {
    // Skip self
    if (waitingUser.uid === currentUserId) continue

    // Skip blocked users
    if (blockedUserIds.includes(waitingUser.uid)) continue
    if ((waitingUser.blockedUsers || []).includes(currentUserId)) continue

    const waitingUserInChat = await isUserInActiveChat(waitingUser.uid)
    if (waitingUserInChat) {
      console.log("[v0] Waiting user is already in chat, skipping:", waitingUser.username)
      continue
    }

    // Check if already in a chat with this user
    const existingRoom = await getExistingChatRoom(currentUserId, waitingUser.uid)
    if (existingRoom) continue

    // Found a match!
    return {
      uid: waitingUser.uid,
      username: waitingUser.username,
    }
  }

  return null
}

// Create chat room
export const createChatRoom = async (user1Id, user2Id, user1Name, user2Name, chatType = "random") => {
  // Check if chat room already exists
  const existingRoom = await getExistingChatRoom(user1Id, user2Id)
  if (existingRoom) {
    return existingRoom.id
  }

  const chatRoomRef = await addDoc(collection(db, "chatRooms"), {
    participants: [user1Id, user2Id],
    participantNames: {
      [user1Id]: user1Name,
      [user2Id]: user2Name,
    },
    chatType, // "random", "direct", or "friend"
    createdAt: serverTimestamp(),
    active: true,
  })

  return chatRoomRef.id
}

// Get active chat room for user
export const getActiveChatRoom = async (uid) => {
  const q = query(
    collection(db, "chatRooms"),
    where("participants", "array-contains", uid),
    where("active", "==", true),
  )

  const snapshot = await getDocs(q)
  if (snapshot.empty) return null

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data(),
  }
}

// End chat room
export const endChatRoom = async (chatRoomId) => {
  await updateDoc(doc(db, "chatRooms", chatRoomId), {
    active: false,
    endedAt: serverTimestamp(),
  })
}

export const sendMessage = async (chatRoomId, senderId, senderName, message, mentions = []) => {
  await addDoc(collection(db, "chatRooms", chatRoomId, "messages"), {
    senderId,
    senderName,
    message,
    mentions, // Array of user IDs mentioned in the message
    timestamp: serverTimestamp(),
  })
}

// Listen to messages
export const listenToMessages = (chatRoomId, callback) => {
  const q = query(collection(db, "chatRooms", chatRoomId, "messages"), orderBy("timestamp"))

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    callback(messages)
  })
}

// Send friend request
export const sendFriendRequest = async (fromUid, fromUsername, toUid, toUsername) => {
  await setDoc(doc(db, "friendRequests", `${fromUid}_${toUid}`), {
    fromUid,
    fromUsername,
    toUid,
    toUsername,
    status: "pending",
    timestamp: serverTimestamp(),
  })
}

// Accept friend request
export const acceptFriendRequest = async (requestId, fromUid, toUid) => {
  // Update request status
  await updateDoc(doc(db, "friendRequests", requestId), {
    status: "accepted",
  })

  // Add to both users' friends lists
  const fromUserRef = doc(db, "users", fromUid)
  const toUserRef = doc(db, "users", toUid)

  const fromUser = await getDoc(fromUserRef)
  const toUser = await getDoc(toUserRef)

  const fromFriends = fromUser.data().friends || []
  const toFriends = toUser.data().friends || []

  await updateDoc(fromUserRef, {
    friends: [...fromFriends, toUid],
  })

  await updateDoc(toUserRef, {
    friends: [...toFriends, fromUid],
  })
}

// Get friend requests for user
export const getFriendRequests = async (uid) => {
  const q = query(collection(db, "friendRequests"), where("toUid", "==", uid), where("status", "==", "pending"))

  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

// Get friends list
export const getFriends = async (uid) => {
  const userDoc = await getDoc(doc(db, "users", uid))
  if (!userDoc.exists()) return []

  const friendIds = userDoc.data().friends || []
  const friends = await Promise.all(
    friendIds.map(async (friendId) => {
      const friendDoc = await getDoc(doc(db, "users", friendId))
      return friendDoc.exists() ? { id: friendId, ...friendDoc.data() } : null
    }),
  )

  return friends.filter((f) => f !== null)
}

// Set user presence
export const setUserPresence = (uid, status) => {
  const presenceRef = ref(rtdb, `presence/${uid}`)
  set(presenceRef, {
    status, // "online", "in-chat", "offline"
    lastChanged: rtdbServerTimestamp(),
  })

  // Set up disconnect handler
  onDisconnect(presenceRef).set({
    status: "offline",
    lastChanged: rtdbServerTimestamp(),
  })
}

// Listen to user presence
export const listenToPresence = (uid, callback) => {
  const presenceRef = ref(rtdb, `presence/${uid}`)
  return onValue(presenceRef, (snapshot) => {
    const data = snapshot.val()
    callback(data ? data.status : "offline")
  })
}

// Get all online users
export const listenToOnlineUsers = (callback) => {
  const presenceRef = ref(rtdb, "presence")
  return onValue(presenceRef, (snapshot) => {
    const data = snapshot.val()
    if (!data) {
      callback([])
      return
    }

    const onlineUsers = Object.entries(data)
      .filter(([_, value]) => value.status !== "offline")
      .map(([uid, value]) => ({ uid, status: value.status }))

    callback(onlineUsers)
  })
}

export const sendChatRequest = async (fromUid, fromUsername, toUid, toUsername) => {
  const requestId = `${fromUid}_${toUid}`
  await setDoc(doc(db, "chatRequests", requestId), {
    fromUid,
    fromUsername,
    toUid,
    toUsername,
    status: "pending",
    timestamp: serverTimestamp(),
  })
}

export const getChatRequests = async (uid) => {
  const q = query(collection(db, "chatRequests"), where("toUid", "==", uid), where("status", "==", "pending"))

  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

export const acceptChatRequest = async (requestId, fromUid, toUid, fromUsername, toUsername) => {
  // Update request status
  await updateDoc(doc(db, "chatRequests", requestId), {
    status: "accepted",
  })

  // Create direct chat room
  const chatRoomId = await createChatRoom(fromUid, toUid, fromUsername, toUsername, "direct")
  return chatRoomId
}

export const rejectChatRequest = async (requestId) => {
  await updateDoc(doc(db, "chatRequests", requestId), {
    status: "rejected",
  })
}

export const blockUser = async (blockerUid, blockedUid, blockedUsername) => {
  const userRef = doc(db, "users", blockerUid)
  const userDoc = await getDoc(userRef)

  if (userDoc.exists()) {
    const blockedUsers = userDoc.data().blockedUsers || []

    await updateDoc(userRef, {
      blockedUsers: arrayUnion({
        uid: blockedUid,
        username: blockedUsername,
        blockedAt: new Date().toISOString(),
      }),
    })
  }
}

export const unblockUser = async (blockerUid, blockedUid) => {
  const userRef = doc(db, "users", blockerUid)
  const userDoc = await getDoc(userRef)

  if (userDoc.exists()) {
    const blockedUsers = userDoc.data().blockedUsers || []
    const userToUnblock = blockedUsers.find((u) => u.uid === blockedUid)

    if (userToUnblock) {
      await updateDoc(userRef, {
        blockedUsers: arrayRemove(userToUnblock),
      })
    }
  }
}

export const getBlockedUsers = async (uid) => {
  const userDoc = await getDoc(doc(db, "users", uid))
  if (!userDoc.exists()) return []

  return userDoc.data().blockedUsers || []
}

export const isUserBlocked = async (checkerUid, targetUid) => {
  const blockedUsers = await getBlockedUsers(checkerUid)
  return blockedUsers.some((u) => u.uid === targetUid)
}

export const listenToChatRequests = (uid, callback) => {
  const q = query(collection(db, "chatRequests"), where("toUid", "==", uid), where("status", "==", "pending"))

  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    callback(requests)
  })
}

export const listenToChatRoom = (chatRoomId, callback) => {
  return onSnapshot(doc(db, "chatRooms", chatRoomId), (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() })
    } else {
      callback(null)
    }
  })
}

export const removeFriend = async (userId, friendId) => {
  const userRef = doc(db, "users", userId)
  const friendRef = doc(db, "users", friendId)

  const userDoc = await getDoc(userRef)
  const friendDoc = await getDoc(friendRef)

  if (userDoc.exists() && friendDoc.exists()) {
    const userFriends = userDoc.data().friends || []
    const friendFriends = friendDoc.data().friends || []

    // Remove from both users' friends lists
    await updateDoc(userRef, {
      friends: userFriends.filter((id) => id !== friendId),
    })

    await updateDoc(friendRef, {
      friends: friendFriends.filter((id) => id !== userId),
    })

    // Delete any pending chat requests between them
    const chatRequestsQuery1 = query(
      collection(db, "chatRequests"),
      where("fromUid", "==", userId),
      where("toUid", "==", friendId),
    )
    const chatRequestsQuery2 = query(
      collection(db, "chatRequests"),
      where("fromUid", "==", friendId),
      where("toUid", "==", userId),
    )

    const [snapshot1, snapshot2] = await Promise.all([getDocs(chatRequestsQuery1), getDocs(chatRequestsQuery2)])

    const deletePromises = []
    snapshot1.forEach((doc) => deletePromises.push(deleteDoc(doc.ref)))
    snapshot2.forEach((doc) => deletePromises.push(deleteDoc(doc.ref)))

    await Promise.all(deletePromises)
  }
}

export const listenToWaitingPool = (callback) => {
  const q = query(collection(db, "waitingPool"), orderBy("timestamp"))
  return onSnapshot(q, (snapshot) => {
    const waitingUsers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    callback(waitingUsers)
  })
}

export const returnToWaitingQueue = async (uid, username) => {
  // Remove from any existing waiting pool entry first
  await removeFromWaitingPool(uid)

  // Add back to waiting pool
  await addToWaitingPool(uid, username)
}

export const reportUser = async (reporterUid, reporterUsername, reportedUid, reportedUsername, reason, chatRoomId) => {
  await addDoc(collection(db, "reports"), {
    reporterUid,
    reporterUsername,
    reportedUid,
    reportedUsername,
    reason,
    chatRoomId,
    timestamp: serverTimestamp(),
    status: "pending", // "pending", "reviewed", "resolved"
  })
}

// Listen for accepted chat requests (for the requester)
export const listenToAcceptedChatRequests = (uid, callback) => {
  const q = query(collection(db, "chatRequests"), where("fromUid", "==", uid), where("status", "==", "accepted"))

  return onSnapshot(q, async (snapshot) => {
    for (const docSnapshot of snapshot.docs) {
      const request = docSnapshot.data()

      // Find the chat room that was created for this request
      const chatRoomQuery = query(
        collection(db, "chatRooms"),
        where("participants", "array-contains", uid),
        where("active", "==", true),
      )

      const chatRoomSnapshot = await getDocs(chatRoomQuery)

      for (const roomDoc of chatRoomSnapshot.docs) {
        const room = roomDoc.data()
        if (room.participants.includes(request.toUid) && room.chatType === "direct") {
          // Delete the accepted request so it doesn't trigger again
          await deleteDoc(doc(db, "chatRequests", docSnapshot.id))

          // Notify the callback with the chat room ID
          callback(roomDoc.id)
          break
        }
      }
    }
  })
}

// Simple nickname existence check using users/{nickname}
export const checkNicknameExists = async (nickname) => {
  const snap = await getDoc(doc(db, "users", nickname))
  return snap.exists()
}

// Register a new user with nickname + password + gender
// Note: Password is stored in plaintext here to match your spec; ideally hash before storing.
export const registerUser = async (nickname, password, gender) => {
  const userRef = doc(db, "users", nickname)
  const exists = await getDoc(userRef)
  if (exists.exists()) {
    throw new Error("Nickname already taken")
  }

  await setDoc(userRef, {
    // store nickname as the canonical id; also include uid to keep rest of app unchanged
    uid: nickname,
    nickname,
    username: nickname, // keep 'username' for compatibility with existing UI
    password, // TODO: hash ideally
    gender,
    friends: [],
    blockedUsers: [],
    createdAt: serverTimestamp(),
  })

  // Return minimal session info
  return { uid: nickname, nickname }
}

// Login by verifying nickname + password
export const loginUser = async (nickname, password) => {
  const userRef = doc(db, "users", nickname)
  const snap = await getDoc(userRef)
  if (!snap.exists()) {
    throw new Error("Invalid nickname or password")
  }
  const data = snap.data()
  if (data.password !== password) {
    throw new Error("Invalid nickname or password")
  }
  return { uid: nickname, nickname }
}

// Create a new group
export const createGroup = async (creatorUid, name, description = "", image = "", isPublic = true) => {
  const groupRef = await addDoc(collection(db, "groups"), {
    name,
    description,
    image,
    isPublic,
    createdBy: creatorUid,
    admins: [creatorUid],
    members: [creatorUid],
    joinRequests: [],
    createdAt: serverTimestamp(),
    activityScore: 0,
    lastActivity: serverTimestamp(),
  })

  return groupRef.id
}

// Get user's joined groups
export const getUserGroups = async (uid) => {
  const q = query(collection(db, "groups"), where("members", "array-contains", uid))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

// Get trending groups (public groups ordered by activity score)
export const getTrendingGroups = async (limitCount = 10) => {
  const q = query(
    collection(db, "groups"),
    where("isPublic", "==", true),
    orderBy("activityScore", "desc"),
    limit(limitCount),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

// Listen to trending groups
export const listenToTrendingGroups = (callback, limitCount = 10) => {
  const q = query(
    collection(db, "groups"),
    where("isPublic", "==", true),
    orderBy("activityScore", "desc"),
    limit(limitCount),
  )
  return onSnapshot(q, (snapshot) => {
    const groups = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    callback(groups)
  })
}

// Get group details
export const getGroup = async (groupId) => {
  const groupDoc = await getDoc(doc(db, "groups", groupId))
  return groupDoc.exists() ? { id: groupDoc.id, ...groupDoc.data() } : null
}

// Listen to group details
export const listenToGroup = (groupId, callback) => {
  return onSnapshot(doc(db, "groups", groupId), (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() })
    } else {
      callback(null)
    }
  })
}

// Send group message
export const sendGroupMessage = async (groupId, senderId, senderName, message, mentions = []) => {
  // Add message
  await addDoc(collection(db, "groups", groupId, "messages"), {
    senderId,
    senderName,
    message,
    mentions,
    timestamp: serverTimestamp(),
  })

  // Update activity score
  await updateGroupActivity(groupId)
}

// Listen to group messages
export const listenToGroupMessages = (groupId, callback) => {
  const q = query(collection(db, "groups", groupId, "messages"), orderBy("timestamp"))
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    callback(messages)
  })
}

// Update group activity score
export const updateGroupActivity = async (groupId) => {
  const groupRef = doc(db, "groups", groupId)
  const groupDoc = await getDoc(groupRef)

  if (groupDoc.exists()) {
    const memberCount = groupDoc.data().members?.length || 0

    // Get recent messages count (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const messagesQuery = query(collection(db, "groups", groupId, "messages"), where("timestamp", ">=", oneDayAgo))
    const messagesSnapshot = await getDocs(messagesQuery)
    const recentMessagesCount = messagesSnapshot.size

    // Calculate activity score: (recent_messages * 2) + member_count
    const activityScore = recentMessagesCount * 2 + memberCount

    await updateDoc(groupRef, {
      activityScore,
      lastActivity: serverTimestamp(),
    })
  }
}

// Request to join a group
export const requestJoinGroup = async (groupId, userId, username) => {
  const groupRef = doc(db, "groups", groupId)
  await updateDoc(groupRef, {
    joinRequests: arrayUnion({ uid: userId, username, requestedAt: new Date().toISOString() }),
  })
}

// Approve join request
export const approveJoinRequest = async (groupId, userId, username) => {
  const groupRef = doc(db, "groups", groupId)
  const groupDoc = await getDoc(groupRef)

  if (groupDoc.exists()) {
    const joinRequests = groupDoc.data().joinRequests || []
    const request = joinRequests.find((r) => r.uid === userId)

    if (request) {
      await updateDoc(groupRef, {
        members: arrayUnion(userId),
        joinRequests: arrayRemove(request),
      })

      // Update activity score
      await updateGroupActivity(groupId)
    }
  }
}

// Reject join request
export const rejectJoinRequest = async (groupId, userId) => {
  const groupRef = doc(db, "groups", groupId)
  const groupDoc = await getDoc(groupRef)

  if (groupDoc.exists()) {
    const joinRequests = groupDoc.data().joinRequests || []
    const request = joinRequests.find((r) => r.uid === userId)

    if (request) {
      await updateDoc(groupRef, {
        joinRequests: arrayRemove(request),
      })
    }
  }
}

// Leave group
export const leaveGroup = async (groupId, userId) => {
  const groupRef = doc(db, "groups", groupId)
  const groupDoc = await getDoc(groupRef)

  if (groupDoc.exists()) {
    const admins = groupDoc.data().admins || []

    await updateDoc(groupRef, {
      members: arrayRemove(userId),
      admins: arrayRemove(userId), // Remove from admins if they were one
    })

    // Update activity score
    await updateGroupActivity(groupId)

    // If creator left and there are still members, assign a new admin
    if (groupDoc.data().createdBy === userId) {
      const remainingMembers = groupDoc.data().members.filter((m) => m !== userId)
      if (remainingMembers.length > 0 && admins.length === 1) {
        await updateDoc(groupRef, {
          admins: [remainingMembers[0]],
        })
      }
    }
  }
}

// Add member to group (admin only)
export const addMemberToGroup = async (groupId, userId) => {
  const groupRef = doc(db, "groups", groupId)
  await updateDoc(groupRef, {
    members: arrayUnion(userId),
  })

  // Update activity score
  await updateGroupActivity(groupId)
}

// Remove member from group (admin only)
export const removeMemberFromGroup = async (groupId, userId) => {
  const groupRef = doc(db, "groups", groupId)
  await updateDoc(groupRef, {
    members: arrayRemove(userId),
    admins: arrayRemove(userId), // Also remove from admins if they were one
  })

  // Update activity score
  await updateGroupActivity(groupId)
}

// Promote member to admin
export const promoteToAdmin = async (groupId, userId) => {
  const groupRef = doc(db, "groups", groupId)
  await updateDoc(groupRef, {
    admins: arrayUnion(userId),
  })
}

// Demote admin to regular member
export const demoteFromAdmin = async (groupId, userId) => {
  const groupRef = doc(db, "groups", groupId)
  const groupDoc = await getDoc(groupRef)

  // Don't allow demoting the creator
  if (groupDoc.exists() && groupDoc.data().createdBy !== userId) {
    await updateDoc(groupRef, {
      admins: arrayRemove(userId),
    })
  }
}

// Delete group (creator only)
export const deleteGroup = async (groupId) => {
  await deleteDoc(doc(db, "groups", groupId))
}

// Get member profiles for a group
export const getGroupMembers = async (groupId) => {
  const groupDoc = await getDoc(doc(db, "groups", groupId))
  if (!groupDoc.exists()) return []

  const memberIds = groupDoc.data().members || []
  const members = await Promise.all(
    memberIds.map(async (memberId) => {
      const memberDoc = await getDoc(doc(db, "users", memberId))
      return memberDoc.exists() ? { id: memberId, ...memberDoc.data() } : null
    }),
  )

  return members.filter((m) => m !== null)
}

// Parse mentions from message text
export const parseMentions = (messageText, availableUsers) => {
  const mentionRegex = /@(\w+)/g
  const mentions = []
  let match

  while ((match = mentionRegex.exec(messageText)) !== null) {
    const username = match[1]
    const user = availableUsers.find((u) => u.username === username || u.nickname === username)
    if (user) {
      mentions.push(user.uid || user.id)
    }
  }

  return [...new Set(mentions)] // Remove duplicates
}

// Update group settings
export const updateGroupSettings = async (groupId, updates) => {
  const groupRef = doc(db, "groups", groupId)
  await updateDoc(groupRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

// Invite user to group
export const inviteUserToGroup = async (groupId, invitedUserId, invitedUsername, inviterUid, inviterUsername) => {
  await addDoc(collection(db, "groupInvites"), {
    groupId,
    invitedUserId,
    invitedUsername,
    inviterUid,
    inviterUsername,
    status: "pending",
    timestamp: serverTimestamp(),
  })
}

// Get group invites for user
export const getGroupInvites = async (userId) => {
  const q = query(
    collection(db, "groupInvites"),
    where("invitedUserId", "==", userId),
    where("status", "==", "pending"),
  )
  const snapshot = await getDocs(q)

  // Fetch group details for each invite
  const invites = await Promise.all(
    snapshot.docs.map(async (docSnapshot) => {
      const invite = docSnapshot.data()
      const group = await getGroup(invite.groupId)
      return {
        id: docSnapshot.id,
        ...invite,
        group,
      }
    }),
  )

  return invites
}

// Listen to group invites
export const listenToGroupInvites = (userId, callback) => {
  const q = query(
    collection(db, "groupInvites"),
    where("invitedUserId", "==", userId),
    where("status", "==", "pending"),
  )

  return onSnapshot(q, async (snapshot) => {
    const invites = await Promise.all(
      snapshot.docs.map(async (docSnapshot) => {
        const invite = docSnapshot.data()
        const group = await getGroup(invite.groupId)
        return {
          id: docSnapshot.id,
          ...invite,
          group,
        }
      }),
    )
    callback(invites)
  })
}

// Accept group invite
export const acceptGroupInvite = async (inviteId, groupId, userId) => {
  await updateDoc(doc(db, "groupInvites", inviteId), {
    status: "accepted",
  })

  await addMemberToGroup(groupId, userId)
}

// Reject group invite
export const rejectGroupInvite = async (inviteId) => {
  await updateDoc(doc(db, "groupInvites", inviteId), {
    status: "rejected",
  })
}

// Add reaction to group message
export const addMessageReaction = async (groupId, messageId, userId, emoji) => {
  const messageRef = doc(db, "groups", groupId, "messages", messageId)
  const messageDoc = await getDoc(messageRef)

  if (messageDoc.exists()) {
    const reactions = messageDoc.data().reactions || {}

    // Initialize emoji array if it doesn't exist
    if (!reactions[emoji]) {
      reactions[emoji] = []
    }

    // Toggle reaction: remove if already exists, add if not
    if (reactions[emoji].includes(userId)) {
      reactions[emoji] = reactions[emoji].filter((id) => id !== userId)
      // Remove emoji key if no users left
      if (reactions[emoji].length === 0) {
        delete reactions[emoji]
      }
    } else {
      reactions[emoji].push(userId)
    }

    await updateDoc(messageRef, { reactions })
  }
}

// Search users for group invite
export const searchUsers = async (searchTerm, excludeUserIds = []) => {
  if (!searchTerm.trim()) return []

  const usersQuery = query(collection(db, "users"))
  const snapshot = await getDocs(usersQuery)

  const users = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((user) => {
      const matchesSearch =
        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.nickname?.toLowerCase().includes(searchTerm.toLowerCase())
      const notExcluded = !excludeUserIds.includes(user.uid || user.id)
      return matchesSearch && notExcluded
    })
    .slice(0, 10) // Limit to 10 results

  return users
}

// Pin/unpin message
export const togglePinMessage = async (groupId, messageId) => {
  const groupRef = doc(db, "groups", groupId)
  const groupDoc = await getDoc(groupRef)

  if (groupDoc.exists()) {
    const pinnedMessages = groupDoc.data().pinnedMessages || []

    if (pinnedMessages.includes(messageId)) {
      // Unpin
      await updateDoc(groupRef, {
        pinnedMessages: arrayRemove(messageId),
      })
    } else {
      // Pin (limit to 5 pinned messages)
      if (pinnedMessages.length >= 5) {
        alert("Maximum 5 pinned messages allowed")
        return
      }
      await updateDoc(groupRef, {
        pinnedMessages: arrayUnion(messageId),
      })
    }
  }
}

// Delete message (admin or message sender)
export const deleteGroupMessage = async (groupId, messageId) => {
  await deleteDoc(doc(db, "groups", groupId, "messages", messageId))
}

// Edit message
export const editGroupMessage = async (groupId, messageId, newMessage) => {
  const messageRef = doc(db, "groups", groupId, "messages", messageId)
  await updateDoc(messageRef, {
    message: newMessage,
    edited: true,
    editedAt: serverTimestamp(),
  })
}
