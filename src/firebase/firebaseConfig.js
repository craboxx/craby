import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
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
