import Colors from './colors';

const AGENT_ACCENT_COLORS = [
  { bg: 'rgba(61, 139, 255, 0.12)', text: '#3D8BFF', border: 'rgba(61, 139, 255, 0.25)', glow: 'rgba(61, 139, 255, 0.06)' },
  { bg: 'rgba(0, 240, 255, 0.12)', text: '#00F0FF', border: 'rgba(0, 240, 255, 0.25)', glow: 'rgba(0, 240, 255, 0.06)' },
  { bg: 'rgba(232, 67, 147, 0.12)', text: '#E84393', border: 'rgba(232, 67, 147, 0.25)', glow: 'rgba(232, 67, 147, 0.06)' },
  { bg: 'rgba(0, 223, 186, 0.12)', text: '#00DFBA', border: 'rgba(0, 223, 186, 0.25)', glow: 'rgba(0, 223, 186, 0.06)' },
  { bg: 'rgba(184, 255, 87, 0.12)', text: '#B8FF57', border: 'rgba(184, 255, 87, 0.25)', glow: 'rgba(184, 255, 87, 0.06)' },
  { bg: 'rgba(108, 92, 231, 0.12)', text: '#6C5CE7', border: 'rgba(108, 92, 231, 0.25)', glow: 'rgba(108, 92, 231, 0.06)' },
  { bg: 'rgba(255, 179, 64, 0.12)', text: '#FFB340', border: 'rgba(255, 179, 64, 0.25)', glow: 'rgba(255, 179, 64, 0.06)' },
  { bg: 'rgba(0, 232, 130, 0.12)', text: '#00E882', border: 'rgba(0, 232, 130, 0.25)', glow: 'rgba(0, 232, 130, 0.06)' },
];

const STATUS_RING_COLORS: Record<string, string> = {
  online: Colors.success,
  busy: Colors.warning,
  degraded: Colors.warning,
  offline: Colors.textMuted,
};

export function getAgentColor(agentId: string) {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AGENT_ACCENT_COLORS.length;
  return AGENT_ACCENT_COLORS[index];
}

export function getStatusRingColor(status: string) {
  return STATUS_RING_COLORS[status] ?? Colors.textMuted;
}
