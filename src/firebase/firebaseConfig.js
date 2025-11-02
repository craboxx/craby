import { initializeApp } from "firebase/app"
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getDatabase } from "firebase/database"

const firebaseConfig = {
  apiKey: "AIzaSyDYQKW0ybh7i493GJPNMWU3rl-v7THNFbg",
  authDomain: "craby-4838b.firebaseapp.com",
  projectId: "craby-4838b",
  storageBucket: "craby-4838b.firebasestorage.app",
  messagingSenderId: "1027884351051",
  appId: "1:1027884351051:web:60d3c6102e128296e197ce",
  databaseURL: "https://craby-4838b-default-rtdb.asia-southeast1.firebasedatabase.app",
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const rtdb = getDatabase(app)

// Auto sign-in anonymously if not authenticated
export const ensureAnonymousAuth = async () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe()
      if (user) {
        // Already authenticated (anonymous or custom)
        resolve(user)
      } else {
        // Sign in anonymously
        try {
          const result = await signInAnonymously(auth)
          resolve(result.user)
        } catch (error) {
          reject(error)
        }
      }
    })
  })
}
