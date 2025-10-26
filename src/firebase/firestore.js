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
  runTransaction,
} from "firebase/firestore"
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbServerTimestamp } from "firebase/database"
import { db, rtdb } from "./firebaseConfig"
import bcrypt from "bcryptjs"

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
    blockedBy: [],
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

export const atomicMatchAndCreateRoom = async (user1Id, user1Name, user2Id, user2Name) => {
  return await runTransaction(db, async (tx) => {
    // Check if both users are in active chats INSIDE transaction
    const user1ChatQuery = query(
      collection(db, "chatRooms"),
      where("participants", "array-contains", user1Id),
      where("active", "==", true),
    )
    const user2ChatQuery = query(
      collection(db, "chatRooms"),
      where("participants", "array-contains", user2Id),
      where("active", "==", true),
    )

    const [user1ChatSnap, user2ChatSnap] = await Promise.all([getDocs(user1ChatQuery), getDocs(user2ChatQuery)])

    if (!user1ChatSnap.empty || !user2ChatSnap.empty) {
      console.log("[v0] One or both users already in active chat")
      return null
    }

    // Verify both users still exist in waiting pool
    const user1Snap = await tx.get(doc(db, "waitingPool", user1Id))
    const user2Snap = await tx.get(doc(db, "waitingPool", user2Id))

    if (!user1Snap.exists() || !user2Snap.exists()) {
      console.log("[v0] One or both users no longer in waiting pool")
      return null
    }

    // Create chat room
    const sortedIds = [user1Id, user2Id].sort()
    const roomKey = `${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`

    const chatRoomRef = await addDoc(collection(db, "chatRooms"), {
      participants: [user1Id, user2Id],
      participantNames: {
        [user1Id]: user1Name,
        [user2Id]: user2Name,
      },
      chatType: "random",
      createdAt: serverTimestamp(),
      active: true,
      roomKey,
    })

    // Remove both users from waiting pool atomically
    tx.delete(doc(db, "waitingPool", user1Id))
    tx.delete(doc(db, "waitingPool", user2Id))

    console.log("[v0] Atomic match successful, room:", chatRoomRef.id)
    return chatRoomRef.id
  })
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
    chatType,
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
    mentions,
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
    status,
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
  // Create direct chat room
  const chatRoomId = await createChatRoom(fromUid, toUid, fromUsername, toUsername, "direct")

  await updateDoc(doc(db, "chatRequests", requestId), {
    status: "accepted",
    chatRoomId: chatRoomId,
    acceptedAt: serverTimestamp(),
  })

  return chatRoomId
}

export const rejectChatRequest = async (requestId) => {
  await updateDoc(doc(db, "chatRequests", requestId), {
    status: "rejected",
  })
}

export const blockUser = async (blockerUid, blockedUid) => {
  const blockerRef = doc(db, "users", blockerUid)
  const blockedRef = doc(db, "users", blockedUid)

  const blockerDoc = await getDoc(blockerRef)
  const blockedDoc = await getDoc(blockedRef)

  if (blockerDoc.exists()) {
    // Add blocked user to blocker's blockedUsers array (just UID)
    await updateDoc(blockerRef, {
      blockedUsers: arrayUnion({ uid: blockedUid }),
    })
  }

  if (blockedDoc.exists()) {
    // Add blocker to blocked user's blockedBy array (just UID)
    await updateDoc(blockedRef, {
      blockedBy: arrayUnion({ uid: blockerUid }),
    })
  }
}

export const unblockUser = async (blockerUid, blockedUid) => {
  const blockerRef = doc(db, "users", blockerUid)
  const blockedRef = doc(db, "users", blockedUid)

  const blockerDoc = await getDoc(blockerRef)
  const blockedDoc = await getDoc(blockedRef)

  if (blockerDoc.exists()) {
    const blockedUsers = blockerDoc.data().blockedUsers || []
    const userToUnblock = blockedUsers.find((u) => u.uid === blockedUid)

    if (userToUnblock) {
      await updateDoc(blockerRef, {
        blockedUsers: arrayRemove(userToUnblock),
      })
    }
  }

  if (blockedDoc.exists()) {
    const blockedByUsers = blockedDoc.data().blockedBy || []
    const blockerToRemove = blockedByUsers.find((u) => u.uid === blockerUid)

    if (blockerToRemove) {
      await updateDoc(blockedRef, {
        blockedBy: arrayRemove(blockerToRemove),
      })
    }
  }
}

export const getBlockedUsers = async (uid) => {
  const userDoc = await getDoc(doc(db, "users", uid))
  if (!userDoc.exists()) return []

  return userDoc.data().blockedUsers || []
}

export const getBlockedByUsers = async (uid) => {
  const userDoc = await getDoc(doc(db, "users", uid))
  if (!userDoc.exists()) return []

  return userDoc.data().blockedBy || []
}

export const isUserBlocked = async (checkerUid, targetUid) => {
  const blockedUsers = await getBlockedUsers(checkerUid)
  return blockedUsers.some((u) => u.uid === targetUid)
}

export const isUserBlockedBy = async (checkerUid, targetUid) => {
  const blockedByUsers = await getBlockedByUsers(checkerUid)
  return blockedByUsers.some((u) => u.uid === targetUid)
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
    status: "pending",
  })
}

// Listen for accepted chat requests (for the requester)
export const listenToAcceptedChatRequests = (uid, callback) => {
  const q = query(collection(db, "chatRequests"), where("fromUid", "==", uid), where("status", "==", "accepted"))

  return onSnapshot(q, async (snapshot) => {
    for (const docSnapshot of snapshot.docs) {
      const request = docSnapshot.data()

      // This eliminates the race condition where the query runs before the room is indexed
      if (request.chatRoomId) {
        // Notify the callback with the chat room ID
        callback(request.chatRoomId)

        // This ensures the requester enters the chat before cleanup
        await deleteDoc(docSnapshot.ref)
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
export const registerUser = async (nickname, password, gender) => {
  const userRef = doc(db, "users", nickname)
  const exists = await getDoc(userRef)
  if (exists.exists()) {
    throw new Error("Nickname already taken")
  }

  const hashedPassword = bcrypt.hashSync(password, 10)

  await setDoc(userRef, {
    uid: nickname,
    nickname,
    username: nickname,
    password: hashedPassword,
    gender,
    friends: [],
    blockedUsers: [],
    blockedBy: [],
    createdAt: serverTimestamp(),
  })

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

  const match = bcrypt.compareSync(password, data.password)
  if (!match) {
    throw new Error("Invalid nickname or password")
  }

  return { uid: nickname, nickname }
}

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
export const sendGroupMessage = async (groupId, senderId, senderName, message, mentions = [], extra = {}) => {
  await addDoc(collection(db, "groups", groupId, "messages"), {
    senderId,
    senderName,
    message,
    mentions,
    timestamp: serverTimestamp(),
    ...extra,
  })
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
      admins: arrayRemove(userId),
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
    admins: arrayRemove(userId),
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

  return [...new Set(mentions)]
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
    .slice(0, 10)

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

export const listenToTicTacToeGame = (chatRoomId, callback) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")
  return onSnapshot(gameRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() })
    } else {
      callback(null)
    }
  })
}

export const sendTicTacToeRequest = async (chatRoomId, requesterId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")
  await setDoc(
    gameRef,
    {
      status: "request",
      requesterId,
      responderId,
      createdAt: serverTimestamp(),
      board: Array(9).fill(null),
      symbols: null,
      currentTurn: null,
      winnerUid: null,
      endedAt: null,
    },
    { merge: true },
  )
}

export const acceptTicTacToeRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return

  const requesterId = data.requesterId
  const symbols = {
    [requesterId]: "X",
    [responderId]: "O",
  }

  await updateDoc(gameRef, {
    status: "active",
    board: Array(9).fill(null),
    symbols,
    currentTurn: requesterId,
    startedAt: serverTimestamp(),
  })
}

export const declineTicTacToeRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return
  await updateDoc(gameRef, { status: "declined", endedAt: serverTimestamp() })
}

export const cancelTicTacToeGame = async (chatRoomId, requesterId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status === "request" && data.requesterId === requesterId) {
    await updateDoc(gameRef, { status: "canceled", endedAt: serverTimestamp() })
  }
}

export const makeTicTacToeMove = async (chatRoomId, playerId, index) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")

  const checkWinner = (board) => {
    const wins = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ]
    for (const [a, b, c] of wins) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return true
      }
    }
    return false
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists()) return
    const data = snap.data()

    if (data.status !== "active") return
    if (data.currentTurn !== playerId) return
    if (!Array.isArray(data.board) || index < 0 || index > 8) return
    if (data.board[index] !== null) return

    const playerSymbol = data.symbols?.[playerId]
    if (!playerSymbol) return

    const newBoard = [...data.board]
    newBoard[index] = playerSymbol

    const hasWinner = checkWinner(newBoard)
    const isDraw = !hasWinner && newBoard.every((c) => c !== null)
    const otherPlayerId = Object.keys(data.symbols || {}).find((id) => id !== playerId) || null

    if (hasWinner) {
      const nextScores = { ...(data.scores || {}) }
      nextScores[playerId] = (nextScores[playerId] || 0) + 1

      tx.update(gameRef, {
        board: newBoard,
        status: "won",
        winnerUid: playerId,
        lastMoveAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        scores: nextScores,
        celebrationAt: serverTimestamp(),
      })
    } else if (isDraw) {
      tx.update(gameRef, {
        board: newBoard,
        status: "draw",
        lastMoveAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        celebrationAt: serverTimestamp(),
      })
    } else {
      tx.update(gameRef, {
        board: newBoard,
        currentTurn: otherPlayerId,
        lastMoveAt: serverTimestamp(),
      })
    }
  })
}

export const startTicTacToeRematch = async (chatRoomId, starterUid) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (!data.symbols || !data.symbols[starterUid]) return

  await updateDoc(gameRef, {
    status: "active",
    board: Array(9).fill(null),
    currentTurn: starterUid,
    winnerUid: null,
    startedAt: serverTimestamp(),
    endedAt: null,
    celebrationAt: null,
  })
}

export const closeTicTacToeGame = async (chatRoomId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "ticTacToe")
  await updateDoc(gameRef, {
    status: "idle",
    board: Array(9).fill(null),
    currentTurn: null,
    winnerUid: null,
    symbols: null,
    endedAt: serverTimestamp(),
    celebrationAt: null,
  })
}

// Rock Paper Scissors game helpers
export const listenToRpsGame = (chatRoomId, callback) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "rockPaperScissors")
  return onSnapshot(gameRef, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() })
    else callback(null)
  })
}

export const sendRpsRequest = async (chatRoomId, requesterId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "rockPaperScissors")
  await setDoc(
    gameRef,
    {
      status: "request",
      requesterId,
      responderId,
      createdAt: serverTimestamp(),
      round: 1,
      scores: {},
      choices: {},
      lastRound: null,
      winnerUid: null,
      endedAt: null,
    },
    { merge: true },
  )
}

export const acceptRpsRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "rockPaperScissors")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return

  await updateDoc(gameRef, {
    status: "active",
    startedAt: serverTimestamp(),
    round: 1,
    choices: {},
    lastRound: null,
    winnerUid: null,
    endedAt: null,
  })
}

export const declineRpsRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "rockPaperScissors")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return
  await updateDoc(gameRef, { status: "declined", endedAt: serverTimestamp() })
}

const rpsBeats = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
}

export const chooseRps = async (chatRoomId, playerId, choice) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "rockPaperScissors")
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists()) return
    const data = snap.data()
    if (data.status !== "active") return

    const round = data.round || 1
    const prevChoices = data.choices || {}
    const roundChoices = { ...(prevChoices[round] || {}) }

    if (roundChoices[playerId]) {
      return
    }

    roundChoices[playerId] = choice
    const nextChoices = { ...prevChoices, [round]: roundChoices }

    const players = Object.keys({
      ...(data.requesterId ? { [data.requesterId]: true } : {}),
      ...(data.responderId ? { [data.responderId]: true } : {}),
    })

    if (players.length < 2) {
      tx.update(gameRef, { choices: nextChoices })
      return
    }

    const haveBoth = roundChoices[players[0]] && roundChoices[players[1]]
    if (!haveBoth) {
      tx.update(gameRef, { choices: nextChoices })
      return
    }

    const aUid = players[0]
    const bUid = players[1]
    const aChoice = roundChoices[aUid]
    const bChoice = roundChoices[bUid]

    let winnerUid = null
    if (aChoice !== bChoice) {
      winnerUid = rpsBeats[aChoice] === bChoice ? aUid : bUid
    }

    const scores = { ...(data.scores || {}) }
    if (winnerUid) {
      scores[winnerUid] = (scores[winnerUid] || 0) + 1
    }

    const lastRound = { round, aUid, bUid, aChoice, bChoice, winnerUid }

    const aScore = scores[aUid] || 0
    const bScore = scores[bUid] || 0
    if (aScore >= 2 || bScore >= 2 || round >= 3) {
      const finalWinner = aScore === bScore ? null : aScore > bScore ? aUid : bUid
      tx.update(gameRef, {
        choices: nextChoices,
        scores,
        lastRound,
        status: "ended",
        winnerUid: finalWinner,
        endedAt: serverTimestamp(),
      })
      return
    }

    tx.update(gameRef, {
      choices: nextChoices,
      scores,
      lastRound,
      round: round + 1,
    })
  })
}

export const startRpsRematch = async (chatRoomId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "rockPaperScissors")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  await updateDoc(gameRef, {
    status: "active",
    round: 1,
    scores: {},
    choices: {},
    lastRound: null,
    winnerUid: null,
    startedAt: serverTimestamp(),
    endedAt: null,
  })
}

export const closeRpsGame = async (chatRoomId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "rockPaperScissors")
  await updateDoc(gameRef, {
    status: "idle",
    endedAt: serverTimestamp(),
  })
}

// Bingo game helpers
export const listenToBingoGame = (chatRoomId, callback) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  return onSnapshot(gameRef, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() })
    else callback(null)
  })
}

export const sendBingoRequest = async (chatRoomId, requesterId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await setDoc(
    gameRef,
    {
      status: "request",
      requesterId,
      responderId,
      createdAt: serverTimestamp(),
      boards: {},
      marks: {},
      ready: {},
      calledNumbers: [],
      winnerUid: null,
      endedAt: null,
    },
    { merge: true },
  )
}

export const acceptBingoRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return
  await updateDoc(gameRef, { status: "setup", startedAt: serverTimestamp() })
}

export const declineBingoRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return
  await updateDoc(gameRef, { status: "declined", endedAt: serverTimestamp() })
}

export const setBingoBoard = async (chatRoomId, uid, numbers25) => {
  if (!Array.isArray(numbers25) || numbers25.length !== 25) return
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists()) return
    const data = snap.data()
    const boards = { ...(data.boards || {}) }
    const marks = { ...(data.marks || {}) }
    boards[uid] = numbers25
    marks[uid] = Array(25).fill(false)
    tx.update(gameRef, { boards, marks })
  })
}

export const setBingoReady = async (chatRoomId, uid) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists()) return
    const data = snap.data()
    const ready = { ...(data.ready || {}), [uid]: true }

    const otherUid =
      data.requesterId && data.requesterId !== uid
        ? data.requesterId
        : data.responderId && data.responderId !== uid
          ? data.responderId
          : null
    const wasOtherReady = !!(otherUid && data.ready?.[otherUid])
    const bothReady = data.requesterId && data.responderId && ready[data.requesterId] && ready[data.responderId]

    const update = { ready, status: bothReady ? "active" : data.status }
    if (bothReady) {
      const starter = data.starterUid || (wasOtherReady ? otherUid : uid)
      update.starterUid = starter
      update.currentTurn = data.currentTurn || starter
      update.startedAt = serverTimestamp()
    }
    tx.update(gameRef, update)
  })
}

export const callBingoNextNumber = async (chatRoomId, callerId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists()) return
    const data = snap.data()
    if (data.status !== "active") return
    if (data.currentTurn && data.currentTurn !== callerId) return

    const called = data.calledNumbers || []
    const next = called.length + 1
    if (next > 25) return

    const otherUid =
      data.requesterId && data.requesterId !== callerId
        ? data.requesterId
        : data.responderId && data.responderId !== callerId
          ? data.responderId
          : callerId

    tx.update(gameRef, { calledNumbers: [...called, next], currentTurn: otherUid })
  })
}

const computeBingoLines = (marksArr) => {
  if (!Array.isArray(marksArr) || marksArr.length !== 25) return 0
  const idx = (r, c) => r * 5 + c
  let lines = 0
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => marksArr[idx(r, c)])) lines++
  }
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => marksArr[idx(r, c)])) lines++
  }
  if ([0, 1, 2, 3, 4].every((i) => marksArr[idx(i, i)])) lines++
  if ([0, 1, 2, 3, 4].every((i) => marksArr[idx(i, 4 - i)])) lines++
  return lines
}

export const toggleBingoMark = async (chatRoomId, uid, cellIndex) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists()) return
    const data = snap.data()
    if (data.status !== "active") return
    const boards = data.boards || {}
    const marks = { ...(data.marks || {}) }
    const myBoard = boards[uid] || []
    const myMarks = Array.isArray(marks[uid]) ? [...marks[uid]] : Array(25).fill(false)
    const numberAtCell = myBoard[cellIndex]
    if (!data.calledNumbers?.includes(numberAtCell)) return
    myMarks[cellIndex] = !myMarks[cellIndex]
    marks[uid] = myMarks

    const lines = computeBingoLines(myMarks)
    if (lines >= 5) {
      const nextScores = { ...(data.scores || {}) }
      nextScores[uid] = (nextScores[uid] || 0) + 1

      tx.update(gameRef, {
        marks,
        status: "ended",
        winnerUid: uid,
        endedAt: serverTimestamp(),
        scores: nextScores,
      })
    } else {
      tx.update(gameRef, { marks })
    }
  })
}

export const startBingoRematch = async (chatRoomId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await updateDoc(gameRef, {
    status: "setup",
    boards: {},
    marks: {},
    markSources: {},
    ready: {},
    calledNumbers: [],
    winnerUid: null,
    startedAt: serverTimestamp(),
    endedAt: null,
  })
}

export const closeBingoGame = async (chatRoomId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await updateDoc(gameRef, {
    status: "idle",
    boards: {},
    marks: {},
    markSources: {},
    ready: {},
    calledNumbers: [],
    winnerUid: null,
    endedAt: serverTimestamp(),
  })
}

// Ping Pong game helpers
export const listenToPingPongGame = (chatRoomId, callback) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  return onSnapshot(gameRef, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() })
    else callback(null)
  })
}

export const sendPingPongRequest = async (chatRoomId, requesterId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  await setDoc(
    gameRef,
    {
      status: "request",
      requesterId,
      responderId,
      createdAt: serverTimestamp(),
      scores: {},
      hostUid: requesterId,
      ball: { x: 0.5, y: 0.5, vx: 0.006, vy: 0.004 },
      paddles: {},
      lastUpdateAt: serverTimestamp(),
      winnerUid: null,
    },
    { merge: true },
  )
}

export const acceptPingPongRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return
  await updateDoc(gameRef, {
    status: "active",
    startedAt: serverTimestamp(),
    paddles: {
      [data.requesterId]: 0.5,
      [data.responderId]: 0.5,
    },
  })
}

export const declinePingPongRequest = async (chatRoomId, responderId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (data.status !== "request" || data.responderId !== responderId) return
  await updateDoc(gameRef, { status: "declined", endedAt: serverTimestamp() })
}

export const updatePingPongPaddle = async (chatRoomId, uid, y01) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  const paddles = { ...(data.paddles || {}) }
  paddles[uid] = Math.max(0, Math.min(1, y01))
  await updateDoc(gameRef, { paddles })
}

export const hostUpdatePingPongState = async (chatRoomId, state) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  await updateDoc(gameRef, {
    ...state,
    lastUpdateAt: serverTimestamp(),
  })
}

export const startPingPongRematch = async (chatRoomId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  const snap = await getDoc(gameRef)
  if (!snap.exists()) return
  const data = snap.data()
  await updateDoc(gameRef, {
    status: "active",
    ball: { x: 0.5, y: 0.5, vx: 0.006, vy: 0.004 },
    paddles: {
      [data.requesterId]: 0.5,
      [data.responderId]: 0.5,
    },
    scores: {},
    winnerUid: null,
    startedAt: serverTimestamp(),
    endedAt: null,
  })
}

export const closePingPongGame = async (chatRoomId) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "pingPong")
  await updateDoc(gameRef, { status: "idle", endedAt: serverTimestamp() })
}

export const playBingoNumber = async (chatRoomId, playerId, numberValue) => {
  const gameRef = doc(db, "chatRooms", chatRoomId, "games", "bingo")
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists()) return
    const data = snap.data()
    if (data.status !== "active") return

    const requesterId = data.requesterId
    const responderId = data.responderId
    if (!requesterId || !responderId) return

    if (data.currentTurn && data.currentTurn !== playerId) return

    const opponentId = playerId === requesterId ? responderId : requesterId

    const boards = { ...(data.boards || {}) }
    const marks = { ...(data.marks || {}) }
    const markSources = { ...(data.markSources || {}) }

    const myBoard = boards[playerId]
    const oppBoard = boards[opponentId]
    if (!Array.isArray(myBoard) || myBoard.length !== 25) return
    if (!Array.isArray(oppBoard) || oppBoard.length !== 25) return

    if (!Array.isArray(marks[playerId])) marks[playerId] = Array(25).fill(false)
    if (!Array.isArray(marks[opponentId])) marks[opponentId] = Array(25).fill(false)
    if (!Array.isArray(markSources[playerId])) markSources[playerId] = Array(25).fill(null)
    if (!Array.isArray(markSources[opponentId])) markSources[opponentId] = Array(25).fill(null)

    const myIndex = myBoard.findIndex((n) => n === numberValue)
    const oppIndex = oppBoard.findIndex((n) => n === numberValue)
    if (myIndex < 0 || oppIndex < 0) return

    if (marks[playerId][myIndex]) return

    const nextMarksSelf = [...marks[playerId]]
    const nextMarksOpp = [...marks[opponentId]]
    nextMarksSelf[myIndex] = true
    nextMarksOpp[oppIndex] = true

    const nextSourcesSelf = [...markSources[playerId]]
    const nextSourcesOpp = [...markSources[opponentId]]
    nextSourcesSelf[myIndex] = playerId
    nextSourcesOpp[oppIndex] = playerId

    marks[playerId] = nextMarksSelf
    marks[opponentId] = nextMarksOpp
    markSources[playerId] = nextSourcesSelf
    markSources[opponentId] = nextSourcesOpp

    const called = Array.isArray(data.calledNumbers) ? [...data.calledNumbers] : []
    if (!called.includes(numberValue)) called.push(numberValue)

    const isLineComplete = (arr, a, b, c, d, e) => arr[a] && arr[b] && arr[c] && arr[d] && arr[e]

    const lines = [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14],
      [15, 16, 17, 18, 19],
      [20, 21, 22, 23, 24],
      [0, 5, 10, 15, 20],
      [1, 6, 11, 16, 21],
      [2, 7, 12, 17, 22],
      [3, 8, 13, 18, 23],
      [4, 9, 14, 19, 24],
      [0, 6, 12, 18, 24],
      [4, 8, 12, 16, 20],
    ]

    const playerMarks = marks[playerId]
    let completed = 0
    for (const L of lines) {
      if (isLineComplete(playerMarks, L[0], L[1], L[2], L[3], L[4])) completed++
    }
    const hasBingo = completed >= 5

    const update = {
      marks,
      markSources,
      calledNumbers: called,
      lastPlayedAt: serverTimestamp(),
    }

    if (hasBingo) {
      const nextScores = { ...(data.scores || {}) }
      nextScores[playerId] = (nextScores[playerId] || 0) + 1

      update.status = "ended"
      update.winnerUid = playerId
      update.endedAt = serverTimestamp()
      update.scores = nextScores
    } else {
      update.currentTurn = opponentId
    }

    tx.update(gameRef, update)
  })
}

export const cleanupExpiredChatRequests = async (recipientUid) => {
  try {
    const q = query(
      collection(db, "chatRequests"),
      where("toUid", "==", recipientUid),
      where("status", "==", "pending"),
    )
    const snapshot = await getDocs(q)

    for (const docSnapshot of snapshot.docs) {
      const request = docSnapshot.data()
      const senderInChat = await isUserInActiveChat(request.fromUid)

      if (senderInChat) {
        await deleteDoc(docSnapshot.ref)
      }
    }
  } catch (error) {
    console.error("[v0] Error cleaning up expired chat requests:", error)
  }
}
