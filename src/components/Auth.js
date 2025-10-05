"use client"

import { useState } from "react"
import { registerUser, loginUser, checkNicknameExists } from "../firebase/firestore"

export default function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true)
  const [nickname, setNickname] = useState("")
  const [password, setPassword] = useState("")
  const [gender, setGender] = useState("male")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const validateNickname = (name) => /^[a-zA-Z0-9_]+$/.test(name)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (isLogin) {
        if (!nickname.trim() || !password.trim()) {
          setError("Nickname and password are required")
          setLoading(false)
          return
        }
        await loginUser(nickname.trim(), password)
        // Pass nickname up so App sets session and presence
        onAuthSuccess(nickname.trim())
      } else {
        if (!nickname.trim()) {
          setError("Nickname is required")
          setLoading(false)
          return
        }
        if (!validateNickname(nickname.trim())) {
          setError("Nickname can only contain letters, numbers, and underscores")
          setLoading(false)
          return
        }
        if (!password.trim()) {
          setError("Password is required")
          setLoading(false)
          return
        }

        const exists = await checkNicknameExists(nickname.trim())
        if (exists) {
          setError("Nickname already taken")
          setLoading(false)
          return
        }

        await registerUser(nickname.trim(), password, gender)
        onAuthSuccess(nickname.trim())
      }
    } catch (err) {
      setError(err.message || "Something went wrong")
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
            type="text"
            placeholder="Nickname (letters, numbers, _ only)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
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
            <div style={styles.genderRow}>
              <label style={styles.genderLabel}>Gender:</label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={gender === "male"}
                  onChange={() => setGender("male")}
                />
                <span style={styles.radioText}>Male</span>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={gender === "female"}
                  onChange={() => setGender("female")}
                />
                <span style={styles.radioText}>Female</span>
              </label>
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Loading..." : isLogin ? "Login" : "Register"}
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
            {isLogin ? "Register" : "Login"}
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
  genderRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    fontSize: "14px",
    color: "#333",
  },
  genderLabel: { fontWeight: 600 },
  radioLabel: { display: "flex", alignItems: "center", gap: "6px" },
  radioText: { fontSize: "14px" },
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
