import { ChatMessage } from '@/types/openclaw';

export const mockChatMessages: Record<string, ChatMessage[]> = {
  'agent-001': [
    { id: 'm1', agentId: 'agent-001', role: 'user', content: 'What\'s the current system status?', timestamp: '2026-03-05T14:50:00Z' },
    { id: 'm2', agentId: 'agent-001', role: 'assistant', content: 'All systems operational. 4 of 5 agents are online. Forge is currently offline (last seen 3 hours ago). Gateway uptime is 99.97%. No critical alerts.', timestamp: '2026-03-05T14:50:05Z' },
    { id: 'm3', agentId: 'agent-001', role: 'user', content: 'Can you ping Forge and report back?', timestamp: '2026-03-05T14:51:00Z' },
    { id: 'm4', agentId: 'agent-001', role: 'assistant', content: 'Pinged Forge — no response after 3 attempts (timeout: 5s each). The agent process appears to be stopped. Would you like me to attempt a restart via the gateway CLI?', timestamp: '2026-03-05T14:51:08Z' },
  ],
  'agent-002': [
    { id: 'm5', agentId: 'agent-002', role: 'user', content: 'Run a quick security audit.', timestamp: '2026-03-05T14:30:00Z' },
    { id: 'm6', agentId: 'agent-002', role: 'assistant', content: 'Security Audit Complete\n\n- API keys: All valid, none expired\n- TLS certificates: Valid (expires in 287 days)\n- Auth tokens: Rotated within policy\n- Forge agent: Unreachable (possible process crash)\n- Network: No suspicious inbound connections\n\nOverall: PASS with 1 warning.', timestamp: '2026-03-05T14:30:15Z' },
  ],
  'agent-003': [
    { id: 'm7', agentId: 'agent-003', role: 'system', content: 'Scribe is processing a batch log rotation. Response times may be slower.', timestamp: '2026-03-05T14:55:00Z' },
    { id: 'm8', agentId: 'agent-003', role: 'user', content: 'What did Atlas and Sentinel discuss today?', timestamp: '2026-03-05T14:56:00Z' },
    { id: 'm9', agentId: 'agent-003', role: 'assistant', content: 'Today\'s cross-agent summary:\n\n- Atlas handled 23 user queries, routed 4 to specialists\n- Sentinel completed 38 health checks (all passed except Forge)\n- 2 security audits were run — both passed with warnings\n- Total messages processed: 147 across all channels', timestamp: '2026-03-05T14:56:12Z' },
  ],
  'agent-005': [
    { id: 'm10', agentId: 'agent-005', role: 'user', content: 'What are the latest developments in local LLM inference?', timestamp: '2026-03-05T13:00:00Z' },
    { id: 'm11', agentId: 'agent-005', role: 'assistant', content: 'Key developments this week:\n\n1. Ollama 0.6 — Added support for Llama 3.2 vision models locally\n2. vLLM — New PagedAttention v3 reduces VRAM usage by ~30%\n3. MLX — Apple released MLX 0.25 with faster quantized inference on M-series\n4. GGUF — New Q3_K_XS quantization offers better quality at 3-bit\n\nShall I prepare a detailed report for the team?', timestamp: '2026-03-05T13:00:20Z' },
  ],
};
