import { useEffect, useMemo, useRef, useState } from "react";

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function makeId() {
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function ConnectionPill({ status }) {
  const meta =
    status === "connected"
      ? { label: "Connected", cls: "bg-emerald-100 text-emerald-900" }
      : status === "connecting"
        ? { label: "Connecting...", cls: "bg-amber-100 text-amber-900" }
        : { label: "Disconnected", cls: "bg-rose-100 text-rose-900" };

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-zinc-900 text-white border-zinc-900"
            : "bg-white text-zinc-900 border-zinc-200"
        }`}
      >
        <div>{message.content}</div>
        <div className={`mt-2 text-[10px] ${isUser ? "text-zinc-200" : "text-zinc-500"}`}>
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm text-zinc-700 shadow-sm">
        AI is typing...
      </div>
    </div>
  );
}

export default function App() {
  const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8080/ws";

  const [messages, setMessages] = useState(() => []);
  const [input, setInput] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [error, setError] = useState("");

  const [isResponding, setIsResponding] = useState(false);
  const [waitingForFirstChunk, setWaitingForFirstChunk] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const activeAiMessageIdRef = useRef(null);

  const bottomRef = useRef(null);

  const canSend = useMemo(() => {
    return input.trim().length > 0 && connectionStatus === "connected" && !isResponding;
  }, [input, connectionStatus, isResponding]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, waitingForFirstChunk]);

  useEffect(() => {
    function cleanupReconnectTimer() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function scheduleReconnect() {
      cleanupReconnectTimer();

      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(8000, 500 * Math.pow(2, attempt));
      reconnectAttemptRef.current = attempt + 1;

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    }

    function connect() {
      setError("");
      setConnectionStatus("connecting");

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptRef.current = 0;
          setConnectionStatus("connected");
          ws.send(JSON.stringify({ type: "ping" }));
        };

        ws.onclose = () => {
          setConnectionStatus("disconnected");
          scheduleReconnect();
        };

        ws.onerror = () => {
          setConnectionStatus("disconnected");
          setError("WebSocket error");
        };

        ws.onmessage = (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }

          if (payload.type === "error") {
            setError(payload.message || "Server error");
            setIsResponding(false);
            setWaitingForFirstChunk(false);
            activeAiMessageIdRef.current = null;
            return;
          }

          if (payload.type === "connection_ready") {
            return;
          }

          if (payload.type === "pong") {
            return;
          }

          if (payload.type === "ai_start") {
            setIsResponding(true);
            setWaitingForFirstChunk(true);
            activeAiMessageIdRef.current = payload.messageId;

            setMessages((prev) => [
              ...prev,
              {
                id: payload.messageId,
                role: "assistant",
                content: "",
                createdAt: payload.createdAt || new Date().toISOString(),
              },
            ]);

            return;
          }

          if (payload.type === "ai_chunk") {
            if (activeAiMessageIdRef.current === payload.messageId) {
              setWaitingForFirstChunk(false);
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === payload.messageId
                  ? { ...m, content: (m.content || "") + (payload.delta || "") }
                  : m
              )
            );
            return;
          }

          if (payload.type === "ai_done") {
            if (activeAiMessageIdRef.current === payload.messageId) {
              activeAiMessageIdRef.current = null;
            }
            setIsResponding(false);
            setWaitingForFirstChunk(false);
            return;
          }
        };
      } catch {
        setConnectionStatus("disconnected");
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      cleanupReconnectTimer();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [WS_URL]);

  function sendMessage() {
    setError("");

    const text = input.trim();
    if (!text) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Not connected");
      return;
    }

    const userMessage = {
      id: makeId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");

    setIsResponding(true);
    setWaitingForFirstChunk(true);

    ws.send(
      JSON.stringify({
        type: "user_message",
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      })
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto w-full px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">Shubh AI Chatbot</div>
            <div className="text-xs text-zinc-500">
              Frontend Developer Assignment • Newtuple Technologies Pvt. Ltd.
            </div>
            <div className="text-xs text-zinc-500">Built by Shubham Silyan (@shubham7silyan)</div>
          </div>
          <ConnectionPill status={connectionStatus} />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto w-full px-4 py-4">
          {error ? (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}

            {waitingForFirstChunk ? <TypingIndicator /> : null}
            <div ref={bottomRef} />
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto w-full px-4 py-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canSend) sendMessage();
                }
              }}
              placeholder={
                connectionStatus !== "connected"
                  ? "Connecting..."
                  : isResponding
                    ? "Wait for AI to finish..."
                    : "Type your message..."
              }
              disabled={connectionStatus !== "connected" || isResponding}
              maxLength={500}
              className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-100"
            />

            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>

          <div className="mt-1 text-[11px] text-zinc-500">
            {input.length}/500
          </div>
        </div>
      </footer>
    </div>
  );
}
