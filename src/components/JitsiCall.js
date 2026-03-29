"use client"

import { useEffect, useRef, useState } from "react"

const DEFAULT_JITSI_DOMAINS = ["meet.jit.si", "framatalk.org"]
const BLOCKED_JITSI_DOMAINS = new Set(["nevers-libre.org", "meet.nevers-libre.org"])
const parseJoinTimeout = () => {
  const raw = Number(process.env.REACT_APP_JITSI_JOIN_TIMEOUT_MS)
  if (!Number.isFinite(raw)) return 30000
  return Math.min(120000, Math.max(10000, Math.floor(raw)))
}
const HOST_JOIN_TIMEOUT_MS = parseJoinTimeout()
const JITSI_WORKING_DOMAIN_STORAGE_KEY = "craby_jitsi_working_domain"
const jitsiScriptPromises = {}

const sanitizeRoomName = (value) => {
  if (!value) return ""
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120)
}

const normalizeDomain = (value) => {
  return String(value || "")
    .replace(/^https?:\/\//, "")
    .trim()
    .replace(/\/+$/, "")
}

const parseDomains = (value) => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDomain(item)).filter(Boolean)
  }
  return String(value)
    .split(",")
    .map((item) => normalizeDomain(item))
    .filter(Boolean)
}

const dedupeDomains = (domains) => {
  return Array.from(new Set((domains || []).filter(Boolean)))
}

const filterBlockedDomains = (domains) => {
  return (domains || []).filter((domain) => !BLOCKED_JITSI_DOMAINS.has(normalizeDomain(domain)))
}

const resolveConfiguredDomains = (domainOverride) => {
  const overrideDomains = filterBlockedDomains(dedupeDomains(parseDomains(domainOverride)))
  if (overrideDomains.length > 0) return overrideDomains

  const envDomains = filterBlockedDomains(dedupeDomains(parseDomains(process.env.REACT_APP_JITSI_DOMAINS)))
  if (envDomains.length > 0) return envDomains

  const legacyDomain = filterBlockedDomains(dedupeDomains(parseDomains(process.env.REACT_APP_JITSI_DOMAIN)))
  if (legacyDomain.length > 0) return legacyDomain

  return filterBlockedDomains([...DEFAULT_JITSI_DOMAINS])
}

const getCachedWorkingDomain = (configuredDomains) => {
  if (typeof window === "undefined") return ""
  try {
    const cached = normalizeDomain(window.localStorage.getItem(JITSI_WORKING_DOMAIN_STORAGE_KEY))
    if (cached && BLOCKED_JITSI_DOMAINS.has(cached)) {
      window.localStorage.removeItem(JITSI_WORKING_DOMAIN_STORAGE_KEY)
      return ""
    }
    return cached && configuredDomains.includes(cached) ? cached : ""
  } catch {
    return ""
  }
}

const prioritizeDomains = (configuredDomains) => {
  const cached = getCachedWorkingDomain(configuredDomains)
  if (!cached) return { orderedDomains: configuredDomains, cachedDomain: "" }
  return {
    orderedDomains: [cached, ...configuredDomains.filter((domain) => domain !== cached)],
    cachedDomain: cached,
  }
}

const loadJitsiScript = (domain) => {
  if (typeof window === "undefined") return Promise.reject(new Error("Jitsi is only available in the browser"))
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI)
  const normalizedDomain = normalizeDomain(domain)
  if (!normalizedDomain) return Promise.reject(new Error("Missing Jitsi domain"))
  const scriptSrc = `https://${normalizedDomain}/external_api.js`
  if (jitsiScriptPromises[scriptSrc]) return jitsiScriptPromises[scriptSrc]

  jitsiScriptPromises[scriptSrc] = new Promise((resolve, reject) => {
    const finishResolve = () => {
      if (window.JitsiMeetExternalAPI) {
        resolve(window.JitsiMeetExternalAPI)
      } else {
        delete jitsiScriptPromises[scriptSrc]
        reject(new Error("Jitsi API is unavailable after loading script"))
      }
    }

    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`)
    if (existingScript) {
      existingScript.addEventListener("load", finishResolve, { once: true })
      existingScript.addEventListener(
        "error",
        () => {
          delete jitsiScriptPromises[scriptSrc]
          reject(new Error("Failed to load Jitsi script"))
        },
        { once: true },
      )
      return
    }

    const script = document.createElement("script")
    script.src = scriptSrc
    script.async = true
    script.onload = finishResolve
    script.onerror = () => {
      delete jitsiScriptPromises[scriptSrc]
      reject(new Error("Failed to load Jitsi script"))
    }
    document.body.appendChild(script)
  })

  return jitsiScriptPromises[scriptSrc]
}

export default function JitsiCall({ roomName, displayName, onClose, title = "Video Call", domain, domains }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const [status, setStatus] = useState("loading")
  const [errorText, setErrorText] = useState("")
  const [statusText, setStatusText] = useState("Preparing video call...")
  const [openUrl, setOpenUrl] = useState("")

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const safeRoomName = sanitizeRoomName(roomName)

    if (!safeRoomName) {
      setStatus("error")
      setErrorText("Unable to start call: missing room name.")
      return undefined
    }

    const startCall = async () => {
      setStatus("loading")
      setErrorText("")
      setStatusText("Preparing video call...")
      setOpenUrl("")

      const configuredDomains = dedupeDomains(resolveConfiguredDomains(domains || domain))
      if (configuredDomains.length === 0) {
        setStatus("error")
        setErrorText("No Jitsi hosts configured.")
        setStatusText("")
        return
      }

      const { orderedDomains, cachedDomain } = prioritizeDomains(configuredDomains)
      const triedHosts = []
      const hostErrors = []
      setOpenUrl(`https://${orderedDomains[0]}/${safeRoomName}`)

      const connectOnHost = async (host) => {
        let api = null
        let joined = false
        let frameLoaded = false
        let settled = false
        let timeoutId = null
        const listeners = []

        const removeListeners = () => {
          if (!api) return
          listeners.forEach(([eventName, handler]) => {
            try {
              api.removeListener(eventName, handler)
            } catch {
              // ignore
            }
          })
        }

        const finishAttempt = (ok, reason, resolve) => {
          if (settled) return
          settled = true
          if (timeoutId) clearTimeout(timeoutId)
          removeListeners()
          if (!ok) {
            console.warn(`[jitsi] Host ${host} failed: ${reason || "unknown"}`)
            try {
              api && api.dispose()
            } catch {
              // ignore
            }
            if (apiRef.current === api) {
              apiRef.current = null
            }
            resolve({ ok: false, reason: reason || "unknown" })
            return
          }
          resolve({ ok: true, reason: "joined" })
        }

        return await new Promise(async (resolve) => {
          try {
            const JitsiMeetExternalAPI = await loadJitsiScript(host)
            if (cancelled || !containerRef.current) {
              resolve({ ok: false, reason: "cancelled" })
              return
            }

            if (apiRef.current) {
              try {
                apiRef.current.dispose()
              } catch {
                // ignore
              }
              apiRef.current = null
            }

            api = new JitsiMeetExternalAPI(host, {
              roomName: safeRoomName,
              parentNode: containerRef.current,
              width: "100%",
              height: "100%",
              onload: () => {
                frameLoaded = true
                if (!joined && !cancelled) {
                  setStatusText("")
                }
              },
              userInfo: {
                displayName: displayName || "CRABY User",
              },
              configOverwrite: {
                prejoinPageEnabled: false,
                prejoinConfig: {
                  enabled: false,
                },
                requireDisplayName: false,
                startWithAudioMuted: false,
                startWithVideoMuted: false,
                disableDeepLinking: true,
                enableFeaturesBasedOnToken: false,
                enableInsecureRoomNameWarning: false,
              },
              interfaceConfigOverwrite: {
                DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
                MOBILE_APP_PROMO: false,
              },
            })
            apiRef.current = api

            const addListener = (eventName, handler) => {
              try {
                api.addListener(eventName, handler)
                listeners.push([eventName, handler])
              } catch {
                // ignore unsupported event
              }
            }

            addListener("videoConferenceJoined", () => {
              joined = true
              finishAttempt(true, "joined", resolve)
            })
            addListener("conferenceFailed", () => {
              if (!joined) finishAttempt(false, "conferenceFailed", resolve)
            })
            addListener("connectionFailed", () => {
              if (!joined) finishAttempt(false, "connectionFailed", resolve)
            })
            addListener("errorOccurred", () => {
              if (!joined) finishAttempt(false, "errorOccurred", resolve)
            })
            addListener("readyToClose", () => {
              if (joined && onCloseRef.current) {
                onCloseRef.current()
              }
            })

            timeoutId = setTimeout(() => {
              if (!joined) {
                if (frameLoaded) {
                  // Keep iframe-only success for meet.jit.si to allow manual in-frame join when needed.
                  if (normalizeDomain(host) === "meet.jit.si") {
                    finishAttempt(true, `frameLoadedNoJoin${HOST_JOIN_TIMEOUT_MS}ms`, resolve)
                  } else {
                    finishAttempt(false, `frameLoadedNoJoin${HOST_JOIN_TIMEOUT_MS}ms`, resolve)
                  }
                } else {
                  finishAttempt(false, `joinTimeout${HOST_JOIN_TIMEOUT_MS}ms`, resolve)
                }
              }
            }, HOST_JOIN_TIMEOUT_MS)
          } catch (error) {
            console.warn(`[jitsi] Host ${host} initialization error`, error)
            finishAttempt(false, "initError", resolve)
          }
        })
      }

      for (let index = 0; index < orderedDomains.length; index++) {
        const host = orderedDomains[index]
        triedHosts.push(host)

        setStatus("loading")
        setStatusText(index === 0 ? `Connecting via ${host}...` : `Trying backup host (${host})...`)

        const result = await connectOnHost(host)
        if (cancelled) return

        if (result.ok) {
          if (result.reason === "joined") {
            try {
              window.localStorage.setItem(JITSI_WORKING_DOMAIN_STORAGE_KEY, host)
            } catch {
              // ignore storage errors
            }
          }
          setStatus("ready")
          setStatusText("")
          return
        }
        hostErrors.push(`${host}: ${result.reason}`)

        if (cachedDomain && host === cachedDomain) {
          try {
            window.localStorage.removeItem(JITSI_WORKING_DOMAIN_STORAGE_KEY)
          } catch {
            // ignore storage errors
          }
        }
      }

      if (cancelled) return
      setStatus("error")
      setStatusText("")
      const summary = hostErrors.length > 0 ? ` (${hostErrors.join(" | ")})` : ""
      setErrorText(`Could not connect video call. Tried hosts: ${triedHosts.join(", ")}${summary}`)
    }

    startCall()

    return () => {
      cancelled = true
      if (apiRef.current) {
        apiRef.current.dispose()
        apiRef.current = null
      }
    }
  }, [domain, domains, displayName, roomName])

  return (
    <div className="jitsi-call-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="jitsi-call-panel">
        <div className="jitsi-call-header">
          <div>
            <h3 className="jitsi-call-title">{title}</h3>
            <p className="jitsi-call-room-label">Room: {sanitizeRoomName(roomName)}</p>
          </div>
          <button onClick={onClose} className="jitsi-call-close-btn">
            Close
          </button>
        </div>

        <div className="jitsi-call-body">
          {status === "loading" && !!statusText && <div className="jitsi-call-status">{statusText}</div>}
          {status === "error" && (
            <div className="jitsi-call-error">
              <div>{errorText}</div>
              {openUrl && (
                <button
                  onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}
                  className="jitsi-call-open-link-btn"
                >
                  Open Meeting In New Tab
                </button>
              )}
            </div>
          )}
          <div className="jitsi-call-frame" ref={containerRef} style={{ display: status === "error" ? "none" : "block" }} />
        </div>
      </div>
    </div>
  )
}
