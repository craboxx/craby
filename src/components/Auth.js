"use client"

import { useState } from "react"
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "../firebase/firebaseConfig"
import { checkUsernameAvailable, createUserProfile } from "../firebase/firestore"

export default function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const validateUsername = (username) => {
    const regex = /^[a-zA-Z0-9_]+$/
    return regex.test(username)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (isLogin) {
        // Login
        await signInWithEmailAndPassword(auth, email, password)
        onAuthSuccess()
      } else {
        // Signup
        if (!username.trim()) {
          setError("Username is required")
          setLoading(false)
          return
        }

        if (!validateUsername(username)) {
          setError("Username can only contain letters, numbers, and underscores")
          setLoading(false)
          return
        }

        // Check if username is available
        const isAvailable = await checkUsernameAvailable(username)
        if (!isAvailable) {
          setError("Username is already taken")
          setLoading(false)
          return
        }

        // Create user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)

        // Create user profile
        await createUserProfile(userCredential.user.uid, email, username)

        onAuthSuccess()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>CRABY</h1>
        <p style={styles.subtitle}>Random Chat with Friends</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />

          {!isLogin && (
            <input
              type="text"
              placeholder="Username (letters, numbers, _ only)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={styles.input}
            />
          )}

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Loading..." : isLogin ? "Login" : "Sign Up"}
          </button>
        </form>

        <p style={styles.toggle}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span
            onClick={() => {
              setIsLogin(!isLogin)
              setError("")
            }}
            style={styles.link}
          >
            {isLogin ? "Sign Up" : "Login"}
          </span>
        </p>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "40px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
    width: "100%",
    maxWidth: "400px",
  },
  title: {
    fontSize: "36px",
    fontWeight: "bold",
    textAlign: "center",
    color: "#667eea",
    marginBottom: "8px",
  },
  subtitle: {
    textAlign: "center",
    color: "#666",
    marginBottom: "32px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  input: {
    padding: "12px 16px",
    border: "2px solid #e0e0e0",
    borderRadius: "8px",
    fontSize: "16px",
    outline: "none",
    transition: "border-color 0.3s",
  },
  button: {
    padding: "12px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.3s",
  },
  error: {
    color: "#e74c3c",
    fontSize: "14px",
    margin: "0",
  },
  toggle: {
    textAlign: "center",
    marginTop: "24px",
    color: "#666",
  },
  link: {
    color: "#667eea",
    cursor: "pointer",
    fontWeight: "600",
  },
}
