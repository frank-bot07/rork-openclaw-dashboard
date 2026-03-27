# OpenClaw Mission Control Dashboard

A sleek, dark-themed mission control app for managing your OpenClaw multi-agent AI system from your iPhone or iPad. Inspired by Vercel, Linear, and sci-fi control panels — dark backgrounds with vibrant accent colors, sharp typography, and real-time status indicators.

---

**Features**

- **Server Connection Setup** — Enter your OpenClaw server address (local IP, hostname, or remote URL) with username/password authentication. Save multiple server profiles and switch between them.
- **Agent Dashboard** — See all your agents at a glance with live status indicators (online, offline, busy). Quick-access cards showing each agent's name, active model, channel bindings, and last activity.
- **Chat with Agents** — Full chat interface to talk directly with any agent. Message history, real-time responses, and support for text and media. Separate conversation threads per agent.
- **Agent Configuration** — Edit each agent's AI model (select from available models), system prompt (SOUL.md), personality, and workspace settings. Create new agents or remove existing ones.
- **Channel Management** — View and manage channel bindings (WhatsApp, Telegram, Discord, iMessage) for each agent. See which phone numbers/bot tokens are linked.
- **Cron Jobs Control** — View, create, edit, and delete scheduled tasks. Toggle cron jobs on/off. See next run time and execution history.
- **Heartbeat Monitor** — Real-time heartbeat status for each agent and the gateway. Visual pulse animations showing system health. Alerts when agents go offline.
- **Model Selector** — Browse and assign AI models to agents. See model details like provider, context window, and capabilities.

---

**Design**

- Deep charcoal/near-black background (#0A0A0F) with subtle blue-gray card surfaces
- Electric blue (#3B82F6) as primary accent, emerald green (#10B981) for healthy status, amber (#F59E0B) for warnings, red (#EF4444) for errors
- Glowing status dots with subtle pulse animations for live agents
- Card-based layout with thin borders and soft inner shadows for depth
- Monospace font accents for technical data (IPs, model names, cron expressions)
- Smooth page transitions and press-in micro-interactions on buttons and cards
- Bottom tab navigation with 4 tabs

---

**Pages / Screens**

- **Dashboard (Home Tab)** — Overview with system status banner, agent cards grid, quick stats (total agents, active channels, pending cron jobs), and gateway health indicator
- **Agents Tab** — Scrollable list of all agents. Tap an agent to open its detail screen with sub-sections for Chat, Config, and Channels
- **Agent Detail → Chat** — Full messaging interface with the selected agent. Input bar at bottom, message bubbles, timestamps
- **Agent Detail → Config** — Edit model selection, system prompt, workspace files, and agent settings
- **Agent Detail → Channels** — Manage channel bindings for this agent (WhatsApp, Telegram, Discord, iMessage)
- **Scheduler Tab** — List of all cron jobs and heartbeat configurations. Tap to edit, swipe to toggle on/off. "Add Job" button for new scheduled tasks
- **Settings Tab** — Server connection profiles, authentication credentials, app preferences, connection test button

---

**App Icon**

- Dark navy/black background with a stylized glowing claw mark in electric blue, resembling both a command center radar and the OpenClaw brand — modern, techy, and bold