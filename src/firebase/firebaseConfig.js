import { initializeApp } from "firebase/app"
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getDatabase } from "firebase/database"

// Firebase web config is intentionally public client metadata.
// Keep a working default for static GitHub Pages deploys that do not inject env vars.
const defaultFirebaseConfig = {
  apiKey: "AIzaSyDYQKW0ybh7i493GJPNMWU3rl-v7THNFbg",
  authDomain: "craby-4838b.firebaseapp.com",
  projectId: "craby-4838b",
  storageBucket: "craby-4838b.firebasestorage.app",
  messagingSenderId: "1027884351051",
  appId: "1:1027884351051:web:60d3c6102e128296e197ce",
  databaseURL: "https://craby-4838b-default-rtdb.asia-southeast1.firebasedatabase.app",
}

const runtimeConfig =
  typeof window !== "undefined" && window.__CRABY_FIREBASE_CONFIG__ ? window.__CRABY_FIREBASE_CONFIG__ : {}

const envOrRuntime = (envKey, runtimeKey) => {
  const envValue = process.env[envKey]
  if (envValue) return envValue
  return runtimeConfig[runtimeKey] || defaultFirebaseConfig[runtimeKey] || ""
}

const firebaseConfig = {
  apiKey: envOrRuntime("REACT_APP_FIREBASE_API_KEY", "apiKey"),
  authDomain: envOrRuntime("REACT_APP_FIREBASE_AUTH_DOMAIN", "authDomain"),
  projectId: envOrRuntime("REACT_APP_FIREBASE_PROJECT_ID", "projectId"),
  storageBucket: envOrRuntime("REACT_APP_FIREBASE_STORAGE_BUCKET", "storageBucket"),
  messagingSenderId: envOrRuntime("REACT_APP_FIREBASE_MESSAGING_SENDER_ID", "messagingSenderId"),
  appId: envOrRuntime("REACT_APP_FIREBASE_APP_ID", "appId"),
  databaseURL: envOrRuntime("REACT_APP_FIREBASE_DATABASE_URL", "databaseURL"),
}

const missingFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([_, value]) => !value)
  .map(([key]) => key)

if (missingFirebaseConfig.length > 0) {
  console.error(
    `[CRABY] Missing Firebase config keys: ${missingFirebaseConfig.join(", ")}. ` +
      "Set REACT_APP_FIREBASE_* variables (or window.__CRABY_FIREBASE_CONFIG__).",
  )
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
