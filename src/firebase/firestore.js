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

export const findAndMatchWaitingUser = async (currentUserId, currentUsername, blockedUserIds = []) => {
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

// Send message
export const sendMessage = async (chatRoomId, senderId, senderName, message) => {
  await addDoc(collection(db, "chatRooms", chatRoomId, "messages"), {
    senderId,
    senderName,
    message,
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
