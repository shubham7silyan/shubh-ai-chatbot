import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import Groq from "groq-sdk";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
app.use(cors());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "connection_ready",
      createdAt: new Date().toISOString(),
    })
  );

  let activeAbortController = null;

  ws.on("message", async (raw) => {
    let payload;

    try {
      payload = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (payload.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (payload.type !== "user_message") {
      ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
      return;
    }

    if (!process.env.GROQ_API_KEY) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Missing GROQ_API_KEY on server",
        })
      );
      return;
    }

    if (activeAbortController) {
      activeAbortController.aborted = true;
      activeAbortController = null;
    }

    const messageId = randomUUID();
    ws.send(
      JSON.stringify({
        type: "ai_start",
        messageId,
        createdAt: new Date().toISOString(),
      })
    );

    const controller = { aborted: false };
    activeAbortController = controller;

    try {
      const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
      const systemPrompt = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

      const history = Array.isArray(payload.messages) ? payload.messages : [];
      const cleanedHistory = history
        .filter(
          (m) =>
            m &&
            typeof m.content === "string" &&
            (m.role === "user" || m.role === "assistant")
        )
        .map((m) => ({ role: m.role, content: m.content }));

      const messages = [{ role: "system", content: systemPrompt }, ...cleanedHistory];

      const stream = await groq.chat.completions.create({
        model,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        if (controller.aborted) break;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          ws.send(JSON.stringify({ type: "ai_chunk", messageId, delta }));
        }
      }

      ws.send(JSON.stringify({ type: "ai_done", messageId }));
    } catch (err) {
      const isAbort = controller.aborted;
      ws.send(
        JSON.stringify({
          type: "error",
          messageId,
          message: isAbort ? "Request aborted" : err?.message || "Server error",
        })
      );
    } finally {
      activeAbortController = null;
    }
  });

  ws.on("close", () => {
    if (activeAbortController) activeAbortController.aborted = true;
  });

  ws.on("error", () => {
    if (activeAbortController) activeAbortController.aborted = true;
  });
});

const PORT = Number(process.env.PORT || 8080);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint ws://localhost:${PORT}/ws`);
});
