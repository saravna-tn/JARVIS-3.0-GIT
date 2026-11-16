
import { useState, useRef, useEffect } from "react";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "./firebase";
import "./App.css";
import arcReactor from "./Arc Reactor Core.png";
import smallarc from "./small arc.png";

const WELCOME_MESSAGE = {
  sender: "jarvis",
  text: "Hello! How can I help you?",
};

function cleanTextForSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, " code omitted ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/\s+/g, " ")
    .trim();
}

function App() {
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("LOCAL AI");

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountMemory, setAccountMemory] = useState({});
  const [memoryLoading, setMemoryLoading] = useState(false);

  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [chats, setChats] = useState([]);
  const [openMenuChatId, setOpenMenuChatId] = useState(null);
  const historyMenuRef = useRef(null);
  const [chatSearch, setChatSearch] = useState("");
  const [activeChatId, setActiveChatId] = useState(null);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [storageWarning, setStorageWarning] = useState("");

  const recognitionRef = useRef(null);
  const messagesRef = useRef(null);
  const requestIdRef = useRef(0);
  const speechEnabledRef = useRef(true);

  // Filter conversations by title
  const filteredChats = chats.filter((chat) =>
    (chat.title || "New conversation")
      .toLowerCase()
      .includes(chatSearch.trim().toLowerCase())
  );

  // Separate pinned and recent conversations
  const pinnedChats = filteredChats.filter(
    (chat) => chat.pinned === true
  );

  const recentChats = filteredChats.filter(
    (chat) => chat.pinned !== true
  );

  // Authentication and account memory
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setAccountMemory({});
        setChats([]);
        setActiveChatId(null);
        setMessages([WELCOME_MESSAGE]);
        setAuthLoading(false);
        return;
      }

      setMemoryLoading(true);

      try {
        const memoryRef = doc(
          db,
          "users",
          currentUser.uid,
          "memory",
          "profile"
        );

        const memorySnap = await getDoc(memoryRef);

        if (memorySnap.exists()) {
          setAccountMemory(memorySnap.data());
          console.log("Account memory loaded:", memorySnap.data());
        } else {
          setAccountMemory({});
          console.log("No account memory found yet.");
        }
      } catch (error) {
        console.error("Could not load account memory:", error);
        setAccountMemory({});
      } finally {
        setMemoryLoading(false);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen for this user's saved conversations
  useEffect(() => {
    if (!user) return;

    const chatsRef = collection(db, "users", user.uid, "chats");
    const chatsQuery = query(chatsRef, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        setChats(
          snapshot.docs.map((chatDoc) => ({
            id: chatDoc.id,
            ...chatDoc.data(),
          }))
        );
      },
      (error) => {
        console.error("Could not load chat history:", error);
        setStorageWarning("Could not load saved chat history.");
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Keep the message panel scrolled to the latest message
  useEffect(() => {
    const panel = messagesRef.current;
    if (!panel) return;

    panel.scrollTop = panel.scrollHeight;
  }, [messages]);

  // Keep speech setting synchronized
  useEffect(() => {
    speechEnabledRef.current = speechEnabled;

    if (!speechEnabled) {
      window.speechSynthesis?.cancel();
    }
  }, [speechEnabled]);

  async function signInWithGoogle() {
    try {
      const googleProvider = new GoogleAuthProvider();
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google sign-in error:", error);
      alert("Google sign-in failed. Please try again.");
    }
  }

  async function handleSignOut() {
    try {
      ++requestIdRef.current;
      stopSpeech();
      recognitionRef.current?.stop();
      await signOut(auth);
    } catch (error) {
      console.error("Sign-out error:", error);
      alert("Could not sign out. Please try again.");
    }
  }

  async function saveAccountMemory(key, value) {
    if (!user) return;

    try {
      const memoryRef = doc(
        db,
        "users",
        user.uid,
        "memory",
        "profile"
      );

      const updatedMemory = {
        ...accountMemory,
        [key]: value,
      };

      await setDoc(memoryRef, updatedMemory, { merge: true });
      setAccountMemory(updatedMemory);

      console.log("Account memory saved:", key, value);
    } catch (error) {
      console.error("Could not save account memory:", error);
      setStorageWarning("Could not save account memory.");
    }
  }

  function speakText(text) {
    if (!speechEnabledRef.current) return;
    if (!("speechSynthesis" in window)) return;

    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onerror = (event) => {
      console.error("Speech error:", event.error);
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel();
  }

  function toggleSpeech() {
    if (speechEnabled) {
      stopSpeech();
      setSpeechEnabled(false);
    } else {
      setSpeechEnabled(true);
    }
  }

  // Save a message in the current Firestore conversation
  async function saveChatMessage(chatId, sender, text) {
    if (!user || !chatId) return;

    try {
      const messagesRef = collection(
        db,
        "users",
        user.uid,
        "chats",
        chatId,
        "messages"
      );

      await addDoc(messagesRef, {
        sender,
        text,
        createdAt: serverTimestamp(),
      });

      const chatRef = doc(
        db,
        "users",
        user.uid,
        "chats",
        chatId
      );

      await updateDoc(chatRef, {
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Could not save chat message:", error);
      setStorageWarning("A message could not be saved to chat history.");
    }
  }


  async function generateChatTitle(chatId, conversationMessages) {
    if (!user || !chatId) return;

    try {
      const chatRef = doc(
        db,
        "users",
        user.uid,
        "chats",
        chatId
      );

      const chatSnapshot = await getDoc(chatRef);

      if (!chatSnapshot.exists()) return;

      // Generate a title only once for each new chat.
      if (chatSnapshot.data().titleGenerated === true) return;

      const response = await fetch(
        "http://localhost:5000/api/generate-title",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: conversationMessages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.title) {
        throw new Error(data.error || "Title generation failed");
      }

      await updateDoc(chatRef, {
        title: data.title,
        titleGenerated: true,
        updatedAt: serverTimestamp(),
      });

      console.log("Chat title generated:", data.title);
    } catch (error) {
      console.error("Could not generate chat title:", error);
    }
  }


  // Create a Firestore conversation when the first message is sent
  
  async function ensureChatExists(firstMessage) {
    if (activeChatId) return activeChatId;
    if (!user) return null;

    try {
      const chatsRef = collection(db, "users", user.uid, "chats");

      const fallbackTitle =
        firstMessage.length > 40
          ? firstMessage.slice(0, 40) + "..."
          : firstMessage;

      const newChat = await addDoc(chatsRef, {
        title: fallbackTitle || "New conversation",
        titleGenerated: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActiveChatId(newChat.id);
      return newChat.id;
    } catch (error) {
      console.error("Could not create chat:", error);
      setStorageWarning("Could not create a saved conversation.");
      return null;
    }
  }


  // Start a completely new conversation
  function startNewChat() {
    ++requestIdRef.current;
    setLoading(false);
    stopSpeech();
    recognitionRef.current?.stop();

    setActiveChatId(null);
    setMessages([WELCOME_MESSAGE]);
    setMessage("");
    setStorageWarning("");
    setSessionId(crypto.randomUUID());
  }

  // Restore a saved conversation
  async function loadChat(chatId) {
    if (!user || loading) return;

    ++requestIdRef.current;
    setLoading(false);
    stopSpeech();
    recognitionRef.current?.stop();

    try {
      const messagesRef = collection(
        db,
        "users",
        user.uid,
        "chats",
        chatId,
        "messages"
      );

      const messagesQuery = query(
        messagesRef,
        orderBy("createdAt", "asc")
      );

      const snapshot = await getDocs(messagesQuery);

      const restoredMessages = snapshot.docs.map((messageDoc) => ({
        id: messageDoc.id,
        ...messageDoc.data(),
      }));

      setMessages(
        restoredMessages.length > 0
          ? restoredMessages
          : [WELCOME_MESSAGE]
      );

      setActiveChatId(chatId);

      // A fresh backend session is essential for restoring old context.
      setSessionId(crypto.randomUUID());

      setMessage("");
      setStorageWarning("");
    } catch (error) {
      console.error("Could not restore conversation:", error);
      setStorageWarning("Could not open this conversation.");
    }
  }

  // Delete a conversation and its messages
  async function deleteChat(chatId) {
    if (!user) return;

    const confirmed = window.confirm(
      "Delete this conversation permanently?"
    );

    if (!confirmed) return;

    try {
      const messagesRef = collection(
        db,
        "users",
        user.uid,
        "chats",
        chatId,
        "messages"
      );

      const snapshot = await getDocs(messagesRef);

      await Promise.all(
        snapshot.docs.map((messageDoc) =>
          deleteDoc(messageDoc.ref)
        )
      );

      const chatRef = doc(
        db,
        "users",
        user.uid,
        "chats",
        chatId
      );

      await deleteDoc(chatRef);

      if (activeChatId === chatId) {
        startNewChat();
      }
    } catch (error) {
      console.error("Could not delete conversation:", error);
      setStorageWarning("Could not delete this conversation.");
    }
  }

  // Pin or unpin a conversation
  async function togglePinChat(chatId, currentPinnedStatus) {
    if (!user || !chatId) return;

    try {
      const chatRef = doc(
        db,
        "users",
        user.uid,
        "chats",
        chatId
      );

      await updateDoc(chatRef, {
        pinned: !currentPinnedStatus
      });

      console.log(
        currentPinnedStatus
          ? "Conversation unpinned"
          : "Conversation pinned"
      );
    } catch (error) {
      console.error("Could not update pin status:", error);
      setStorageWarning("Could not update conversation pin status.");
    }
  }

  // Rename a conversation
  async function renameChat(chatId, currentTitle) {
    if (!user || !chatId) return;

    const newTitle = window.prompt(
      "Enter a new conversation name:",
      currentTitle || "New conversation"
    );

    if (newTitle === null) return;

    const trimmedTitle = newTitle.trim();

    if (!trimmedTitle) {
      alert("Conversation name cannot be empty.");
      return;
    }

    try {
      const chatRef = doc(
        db,
        "users",
        user.uid,
        "chats",
        chatId
      );

      await updateDoc(chatRef, {
        title: trimmedTitle
      });

      setOpenMenuChatId(null);
      console.log("Conversation renamed successfully");
    } catch (error) {
      console.error("Could not rename conversation:", error);
      setStorageWarning("Could not rename conversation.");
    }
  }

  // Close conversation menu when clicking outside
  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        historyMenuRef.current &&
        !historyMenuRef.current.contains(event.target)
      ) {
        setOpenMenuChatId(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  // Clear messages in the current conversation without deleting its entry
  async function clearChat() {
    ++requestIdRef.current;
    setLoading(false);
    stopSpeech();

    if (user && activeChatId) {
      try {
        const messagesRef = collection(
          db,
          "users",
          user.uid,
          "chats",
          activeChatId,
          "messages"
        );

        const snapshot = await getDocs(messagesRef);

        await Promise.all(
          snapshot.docs.map((messageDoc) =>
            deleteDoc(messageDoc.ref)
          )
        );

        const chatRef = doc(
          db,
          "users",
          user.uid,
          "chats",
          activeChatId
        );

        await updateDoc(chatRef, {
          title: "New conversation",
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Could not clear saved conversation:", error);
        setStorageWarning("Could not clear saved chat messages.");
      }
    }

    try {
      await fetch("http://localhost:5000/api/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
    } catch (error) {
      console.error("Could not clear backend memory:", error);
    }

    setMessages([WELCOME_MESSAGE]);
    setMessage("");
    setSessionId(crypto.randomUUID());
  }

  // Send a message to JARVIS
  async function sendMessage() {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || loading || !user) return;

    const requestId = ++requestIdRef.current;

    setMessage("");
    setLoading(true);
    setStorageWarning("");

    const previousMessages = messages.filter(
      (item) =>
        ["user", "jarvis"].includes(item.sender) &&
        item.text !== WELCOME_MESSAGE.text
    );

    const chatId = await ensureChatExists(trimmedMessage);

    if (requestId !== requestIdRef.current) return;

    if (chatId) {
      await saveChatMessage(chatId, "user", trimmedMessage);
    }

    setMessages((current) => [
      ...current,
      { sender: "user", text: trimmedMessage },
    ]);

    const memoryMatch = trimmedMessage.match(
      /remember\s+(?:that\s+)?my\s+name\s+is\s+(.+)/i
    );

    if (memoryMatch) {
      const rememberedName = memoryMatch[1].trim();

      await saveAccountMemory("name", rememberedName);

      const reply = `Got it. I'll remember that your name is ${rememberedName}.`;

      setMessages((current) => [
        ...current,
        { sender: "jarvis", text: reply },
      ]);

      if (chatId) {
        await saveChatMessage(chatId, "jarvis", reply);

        const conversationForTitle = [
          ...previousMessages,
          { sender: "user", text: trimmedMessage },
          { sender: "jarvis", text: reply },
        ];

        console.log("TITLE DEBUG: Calling title generator", {
          chatId,
          conversationForTitle,
        });

        await generateChatTitle(chatId, conversationForTitle);
      }

      speakText(reply);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:5000/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: trimmedMessage,
            sessionId,
            accountMemory,
            history: previousMessages.map((item) => ({
              sender: item.sender,
              text: item.text,
            })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Backend error");
      }

      if (requestId !== requestIdRef.current) return;

      const reply = data.reply || "I received an empty response.";

      setProvider(data.provider || "AI");

      setMessages((current) => [
        ...current,
        { sender: "jarvis", text: reply },
      ]);

      if (chatId) {
        await saveChatMessage(chatId, "jarvis", reply);
      }

      speakText(reply);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      console.error(error);

      const errorMessage =
        "Sorry, I couldn't connect to my AI brain.";

      setMessages((current) => [
        ...current,
        { sender: "jarvis", text: errorMessage },
      ]);

      if (chatId) {
        await saveChatMessage(chatId, "jarvis", errorMessage);
      }

      speakText(errorMessage);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function startVoiceInput() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      setMessage(spokenText);
    };

    recognition.onerror = (event) => {
      console.error("Voice recognition error:", event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function formatChatDate(timestamp) {
    if (!timestamp?.toDate) return "";

    return timestamp.toDate().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  }

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src={smallarc} alt="JARVIS" />
          <h1>
            JARVIS <span>3.0</span>
          </h1>
          <p>Initializing your assistant...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src={smallarc} alt="JARVIS" />
          <h1>
            JARVIS <span>3.0</span>
          </h1>
          <p>AI Personal Assistant</p>

          <button
            className="google-signin-button"
            onClick={signInWithGoogle}
          >
            Continue with Google
          </button>

          <small>
            Sign in to continue to your JARVIS account
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${sidebarOpen ? "sidebar-visible" : "sidebar-hidden"}`}>
      <aside className={`chat-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-heading">
          <h2>Conversations</h2>

          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            title="Close sidebar"
          >
            ×
          </button>
        </div>

        <button
          className="sidebar-new-chat"
          onClick={startNewChat}
        >
          + New Chat
        </button>

        <div className="sidebar-search-container">
          <input
            type="text"
            className="sidebar-search"
            placeholder="🔍 Search conversations..."
            value={chatSearch}
            onChange={(event) => setChatSearch(event.target.value)}
          />
        </div>

        
        <div className="chat-history-list">
          {chats.length === 0 ? (
            <p className="empty-history">
              Your conversations will appear here.
            </p>
          ) : filteredChats.length === 0 ? (
            <p className="empty-history">
              No matching conversations found.
            </p>
          ) : (
            <>
              {pinnedChats.length > 0 && (
                <section className="chat-group">
                  <h3 className="chat-group-heading">📌 PINNED</h3>

                  {pinnedChats.map((chat) => (
                    <div className="history-menu-wrapper" ref={historyMenuRef}>
                      <div
                        ref={historyMenuRef}
                        key={chat.id}
                        className={`history-item ${
                          activeChatId === chat.id ? "active" : ""
                        }`}
                      >
                        <button
                          className="history-open"
                          onClick={() => loadChat(chat.id)}
                          disabled={loading}
                        >
                          <span className="history-title">
                            {chat.title || "New conversation"}
                          </span>
                          <span className="history-date">
                            {formatChatDate(chat.updatedAt)}
                          </span>
                        </button>
                        
                        <button
                          className="history-menu"
                          onClick={() =>
                            setOpenMenuChatId(
                              openMenuChatId === chat.id ? null : chat.id
                            )
                          }
                          title="Conversation options"
                        >
                          ⋮
                        </button>
                    </div>

                      {openMenuChatId === chat.id && (
                        <div className="history-dropdown">
                          <button
                            onClick={() => renameChat(chat.id, chat.title)}
                          >
                            ✏️ Rename
                          </button>

                          <button
                            onClick={() => {
                              togglePinChat(chat.id, true);
                              setOpenMenuChatId(null);
                            }}
                          >
                            📌 Unpin
                          </button>

                          <button
                            onClick={() => {
                              setOpenMenuChatId(null);
                              deleteChat(chat.id);
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      )}

                      <button
                        className="history-pin"
                        onClick={() => togglePinChat(chat.id, true)}
                        title="Unpin conversation"
                      >
                        📌
                      </button>

                      <button
                        className="history-delete"
                        onClick={() => deleteChat(chat.id)}
                        title="Delete conversation"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </section>
              )}

              {recentChats.length > 0 && (
                <section className="chat-group">
                  <h3 className="chat-group-heading">RECENT</h3>

                  {recentChats.map((chat) => (
                    <div className="history-menu-wrapper" ref={historyMenuRef}>
                      <div
                      key={chat.id}
                      className={`history-item ${
                        activeChatId === chat.id ? "active" : ""
                      }`}
                    >
                      <button
                        className="history-open"
                        onClick={() => loadChat(chat.id)}
                        disabled={loading}
                      >
                        <span className="history-title">
                          {chat.title || "New conversation"}
                        </span>
                        <span className="history-date">
                          {formatChatDate(chat.updatedAt)}
                        </span>
                      </button>

                      <button
                        className="history-menu"
                        onClick={() =>
                          setOpenMenuChatId(
                            openMenuChatId === chat.id ? null : chat.id
                          )
                        }
                        title="Conversation options"
                      >
                        ⋮
                      </button>
                    </div>
                    

                      {openMenuChatId === chat.id && (
                        <div className="history-dropdown">
                          <button
                            onClick={() => renameChat(chat.id, chat.title)}
                          >
                            ✏️ Rename
                          </button>

                          <button
                            onClick={() => {
                              togglePinChat(chat.id, false);
                              setOpenMenuChatId(null);
                            }}
                          >
                            📌 Pin
                          </button>

                          <button
                            onClick={() => {
                              setOpenMenuChatId(null);
                              deleteChat(chat.id);
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      )}

                      <button
                        className="history-pin"
                        onClick={() => togglePinChat(chat.id, false)}
                        title="Pin conversation"
                      >
                        📌
                      </button>

                      <button
                        className="history-delete"
                        onClick={() => deleteChat(chat.id)}
                        title="Delete conversation"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>


        <div className="sidebar-footer">
          <span>{user.displayName || user.email}</span>
          <button onClick={handleSignOut}>Log out</button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="brand">
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle chat history"
            >
              ☰
            </button>

            <div className="logo">
              <img src={smallarc} alt="JARVIS" />
            </div>

            <div>
              <h1>
                JARVIS <span>3.0</span>
              </h1>
              <p>AI Personal Assistant</p>
            </div>
          </div>

          <div className="status">
            <span className="status-dot"></span>
            <span>{provider}</span>
          </div>
        </header>

        <main className="main-content">
          <section className="hero">
            <div className="hero-reactor">
              <img
                src={arcReactor}
                alt="JARVIS Arc Reactor"
              />
            </div>

            <div className="hero-brand">
              <div className="hero-brand-title">
                <span>JARVIS</span>
                <span className="hero-version">3.0</span>
              </div>

              <div className="hero-tech-line">
                <span></span>
              </div>

              <p>AI PERSONAL ASSISTANT</p>
            </div>

            <div className="hero-greeting">
              <h2>Good to see you.</h2>
              <p>Your intelligent assistant is ready.</p>
            </div>
          </section>

          <section className="chat-panel">
            <div className="panel-header">
              <div>
                <h3>Conversation</h3>
                <p>Talk to your AI assistant</p>
              </div>

              <span className="mode-badge">{provider}</span>
            </div>

            {storageWarning && (
              <p className="storage-warning">
                {storageWarning}
              </p>
            )}

            <div className="messages" ref={messagesRef}>
              {messages.map((item, index) => (
                <div
                  key={item.id || index}
                  className={`message ${
                    item.sender === "user"
                      ? "user-message"
                      : "jarvis-message"
                  }`}
                >
                  <div className="message-avatar">
                    {item.sender === "user" ? "U" : "J"}
                  </div>

                  <div className="message-content">
                    <span className="message-name">
                      {item.sender === "user" ? "You" : "JARVIS"}
                    </span>

                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="input-area">
              <div className="composer-row">
                <textarea
                  className="chat-textarea"
                  placeholder="Ask JARVIS anything..."
                  value={message}
                  rows={2}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    event.target.style.height = "auto";
                    event.target.style.height =
                      Math.min(event.target.scrollHeight, 180) + "px";
                  }}
                  onKeyDown={handleKeyDown}
                />

                <button
                  className="send-button"
                  onClick={sendMessage}
                  disabled={loading || !message.trim()}
                >
                  {loading ? "Thinking..." : "Send"}
                </button>
              </div>

              <div className="composer-actions">
                <button
                  className={`mic-button ${
                    isListening ? "listening" : ""
                  }`}
                  title={isListening ? "Stop listening" : "Voice input"}
                  onClick={startVoiceInput}
                >
                  {isListening ? "⏹ Stop mic" : "🎙 Speak"}
                </button>

                <button
                  className="clear-button"
                  onClick={clearChat}
                >
                  Clear Chat
                </button>

                <button
                  className="new-user-button"
                  onClick={startNewChat}
                >
                  New Chat
                </button>

                <button onClick={toggleSpeech}>
                  {speechEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}
                </button>
              </div>
            </div>
          </section>

          <section className="feature-grid">
            <div className="feature-card">
              <span className="feature-icon">🧠</span>
              <h3>AI Brain</h3>
              <p>Ollama + Online AI</p>
            </div>

            <div className="feature-card">
              <span className="feature-icon">🎙</span>
              <h3>Voice Control</h3>
              <p>Speak naturally</p>
            </div>

            <div className="feature-card">
              <span className="feature-icon">⚡</span>
              <h3>Smart Commands</h3>
              <p>Control your system</p>
            </div>
          </section>
        </main>

        <footer>
          JARVIS 3.0 <span>•</span> Built with React
        </footer>
      </div>
    </div>
  );
}

export default App;
