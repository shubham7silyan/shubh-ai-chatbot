# Shubh AI Chatbot (Real-Time Streaming)

Frontend Developer Assignment: **Real-Time AI Chatbot with Streaming**

Company: **Newtuple Technologies Private Limited**

Author: **Shubham Silyan** (GitHub: **@shubham7silyan**)

 A simple real-time AI chatbot where the AI reply streams in live (chunk by chunk) using a WebSocket connection.

 This repo has:
 - `client/` = React (Vite) UI
 - `server/` = Node.js WebSocket server that calls an LLM with streaming

## Demo Video

- Add your link here: _______

## Tech Stack

- Frontend: React 18, Vite
- Styling: Tailwind CSS
- Realtime: WebSocket (native browser WebSocket API) + `ws` on the server
- LLM: Groq streaming API (can be swapped later)

## Features (Checklist)

- [x] Chat message list (user + AI)
- [x] Timestamps
- [x] Auto-scroll to latest message
- [x] Disable input while AI is responding
- [x] Connection status indicator
- [x] Basic reconnection logic
- [x] Streaming AI response rendering
- [x] Basic error handling

## Folder Structure

- **Root**: npm workspaces (runs both client + server)
- **`server/`**: Express + WebSocket server
- **`client/`**: React chat UI

## Setup (Step by step)

### 1) Install Node

Make sure you have Node.js installed (Node 18+ recommended).

### 2) Install dependencies

From the repo root:

```bash
npm install
```

### 3) Add environment variables

This project uses **two env files**:
- **Server env**: root `.env`
- **Client env**: `client/.env`

#### Server env (root)

1) Copy `.env.example` to `.env` in the repo root:

```bash
copy .env.example .env
```

2) Open `.env` and set:

- `GROQ_API_KEY` (required)
- `GROQ_MODEL` (optional, default is `llama-3.1-8b-instant`)
- `PORT` (optional, default is `8080`)
- `SYSTEM_PROMPT` (optional)

#### Client env (`client/.env`)

3) Create `client/.env` and add:

```bash
VITE_WS_URL=ws://localhost:8080/ws
```

Tip: there is also a template file at `client/.env.example`.

### 4) Run the app

In one terminal (from repo root):

```bash
npm run dev
```

- Client runs on Vite port (usually `http://localhost:5173`)
- Server runs on `http://localhost:8080`

## Useful Commands

From repo root:

- `npm run dev` – run client + server together
- `npm run build` – build the frontend
- `npm run start` – run server only

## How Streaming Works (Quick Explanation)

- The client opens a WebSocket connection to `ws://localhost:8080/ws`.
- When you send a message, the client sends the whole message history:
  - `{ type: "user_message", messages: [...] }`
- The server calls the LLM in **streaming mode** and forwards output in small chunks:
  - `ai_start` (creates an empty AI message in the UI)
  - `ai_chunk` (append text to that message)
  - `ai_done` (stop streaming and enable input again)

This keeps the UI feeling “live” instead of waiting for one big response.

## Time Spent

- About: 8 hours

## Notes

- If you see a server error about missing `GROQ_API_KEY`, double-check your `.env` file.
- The server is stateless: the client sends message history on each request.

## Common Issues

### "Unknown at rule @tailwind" in `client/src/index.css`

Some editors show warnings for Tailwind directives like `@tailwind base;`.

- The project still runs fine because Tailwind is processed by PostCSS during the Vite build.
- If you want to hide the warning, install the **Tailwind CSS IntelliSense** extension (VS Code) or disable the CSS "unknown at rules" warning in your editor settings.
