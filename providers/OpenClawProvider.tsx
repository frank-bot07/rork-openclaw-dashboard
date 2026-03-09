import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { Agent, ServerProfile, GatewayStatus, CronJob, HeartbeatEntry, ChatMessage, ActivityEntry, QuickAction } from '@/types/openclaw';
import { mockAgents } from '@/mocks/agents';
import { mockCronJobs, mockHeartbeats } from '@/mocks/scheduler';
import { mockChatMessages } from '@/mocks/chat';
import { mockActivity, mockQuickActions } from '@/mocks/activity';

const STORAGE_KEY_PROFILES = 'openclaw_server_profiles';
const STORAGE_KEY_AGENTS = 'openclaw_agents';
const STORAGE_KEY_CRONJOBS = 'openclaw_cronjobs';
const STORAGE_KEY_CHAT = 'openclaw_chat_messages';

const DEFAULT_PROFILE: ServerProfile = {
  id: 'profile-default',
  name: 'Local Gateway',
  address: 'localhost:3000',
  username: 'admin',
  password: '',
  isActive: true,
};

export const [OpenClawProvider, useOpenClaw] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [cronJobs, setCronJobs] = useState<CronJob[]>(mockCronJobs);
  const [heartbeats, setHeartbeats] = useState<HeartbeatEntry[]>(mockHeartbeats);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>(mockChatMessages);
  const [serverProfiles, setServerProfiles] = useState<ServerProfile[]>([DEFAULT_PROFILE]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const dataLoaded = true;
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>(mockActivity);
  const [quickActions] = useState<QuickAction[]>(mockQuickActions);

  const profilesQuery = useQuery({
    queryKey: ['serverProfiles'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_PROFILES);
      return stored ? JSON.parse(stored) as ServerProfile[] : [];
    },
  });

  const agentsQuery = useQuery({
    queryKey: ['persistedAgents'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_AGENTS);
      return stored ? JSON.parse(stored) as Agent[] : null;
    },
  });

  const cronJobsQuery = useQuery({
    queryKey: ['persistedCronJobs'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_CRONJOBS);
      return stored ? JSON.parse(stored) as CronJob[] : null;
    },
  });

  const chatQuery = useQuery({
    queryKey: ['persistedChat'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_CHAT);
      return stored ? JSON.parse(stored) as Record<string, ChatMessage[]> : null;
    },
  });

  useEffect(() => {
    if (profilesQuery.data && profilesQuery.data.length > 0) {
      setServerProfiles(profilesQuery.data);
    }
  }, [profilesQuery.data]);

  useEffect(() => {
    if (agentsQuery.data !== undefined && agentsQuery.data !== null) {
      setAgents(agentsQuery.data);
    }
  }, [agentsQuery.data]);

  useEffect(() => {
    if (cronJobsQuery.data !== undefined && cronJobsQuery.data !== null) {
      setCronJobs(cronJobsQuery.data);
    }
  }, [cronJobsQuery.data]);

  useEffect(() => {
    if (chatQuery.data !== undefined && chatQuery.data !== null) {
      setChatMessages(chatQuery.data);
    }
  }, [chatQuery.data]);

  const isLoading = false;

  const { mutate: persistAgents } = useMutation({
    mutationFn: async (data: Agent[]) => {
      await AsyncStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(data));
      return data;
    },
  });

  const { mutate: persistCronJobs } = useMutation({
    mutationFn: async (data: CronJob[]) => {
      await AsyncStorage.setItem(STORAGE_KEY_CRONJOBS, JSON.stringify(data));
      return data;
    },
  });

  const { mutate: persistChat } = useMutation({
    mutationFn: async (data: Record<string, ChatMessage[]>) => {
      await AsyncStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(data));
      return data;
    },
  });

  const activeProfile = useMemo(() => {
    return serverProfiles.find(p => p.isActive) ?? null;
  }, [serverProfiles]);

  const gatewayStatus: GatewayStatus = useMemo(() => {
    const onlineAgents = agents.filter(a => a.status !== 'offline').length;
    const totalChannels = agents.reduce((sum, a) => sum + a.channels.filter(c => c.connected).length, 0);
    const enabledJobs = cronJobs.filter(j => j.enabled).length;
    return {
      online: true,
      uptime: '14d 7h 23m',
      version: '2.4.1',
      totalAgents: agents.length,
      onlineAgents,
      activeChannels: totalChannels,
      pendingJobs: enabledJobs,
    };
  }, [agents, cronJobs]);

  const { mutate: saveProfiles } = useMutation({
    mutationFn: async (profiles: ServerProfile[]) => {
      await AsyncStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
      return profiles;
    },
    onSuccess: (profiles) => {
      setServerProfiles(profiles);
      queryClient.invalidateQueries({ queryKey: ['serverProfiles'] });
    },
  });

  const addServerProfile = useCallback((profile: ServerProfile) => {
    const updated = [...serverProfiles, profile];
    saveProfiles(updated);
  }, [serverProfiles, saveProfiles]);

  const updateServerProfile = useCallback((profile: ServerProfile) => {
    const updated = serverProfiles.map(p => p.id === profile.id ? profile : p);
    saveProfiles(updated);
  }, [serverProfiles, saveProfiles]);

  const deleteServerProfile = useCallback((id: string) => {
    const updated = serverProfiles.filter(p => p.id !== id);
    saveProfiles(updated);
  }, [serverProfiles, saveProfiles]);

  const setActiveProfileFn = useCallback((id: string) => {
    const updated = serverProfiles.map(p => ({ ...p, isActive: p.id === id }));
    saveProfiles(updated);
  }, [serverProfiles, saveProfiles]);

  const toggleCronJob = useCallback((jobId: string) => {
    setCronJobs(prev => {
      const updated = prev.map(j => j.id === jobId ? { ...j, enabled: !j.enabled } : j);
      persistCronJobs(updated);
      return updated;
    });
  }, [persistCronJobs]);

  const addCronJob = useCallback((job: CronJob) => {
    setCronJobs(prev => {
      const updated = [...prev, job];
      persistCronJobs(updated);
      return updated;
    });
    console.log('[OpenClaw] Added cron job:', job.name);
  }, [persistCronJobs]);

  const updateCronJob = useCallback((jobId: string, updates: Partial<CronJob>) => {
    setCronJobs(prev => {
      const updated = prev.map(j => j.id === jobId ? { ...j, ...updates } : j);
      persistCronJobs(updated);
      return updated;
    });
    console.log('[OpenClaw] Updated cron job:', jobId);
  }, [persistCronJobs]);

  const deleteCronJob = useCallback((jobId: string) => {
    setCronJobs(prev => {
      const updated = prev.filter(j => j.id !== jobId);
      persistCronJobs(updated);
      return updated;
    });
    console.log('[OpenClaw] Deleted cron job:', jobId);
  }, [persistCronJobs]);

  const updateAgent = useCallback((agentId: string, updates: Partial<Agent>) => {
    setAgents(prev => {
      const updated = prev.map(a => a.id === agentId ? { ...a, ...updates } : a);
      persistAgents(updated);
      return updated;
    });
    console.log('[OpenClaw] Updated agent:', agentId);
  }, [persistAgents]);

  const addAgent = useCallback((agent: Agent) => {
    setAgents(prev => {
      const updated = [...prev, agent];
      persistAgents(updated);
      return updated;
    });
    console.log('[OpenClaw] Added agent:', agent.name);
  }, [persistAgents]);

  const deleteAgent = useCallback((agentId: string) => {
    setAgents(prev => {
      const updated = prev.filter(a => a.id !== agentId);
      persistAgents(updated);
      return updated;
    });
    setChatMessages(prev => {
      const updated = { ...prev };
      delete updated[agentId];
      persistChat(updated);
      return updated;
    });
    console.log('[OpenClaw] Deleted agent:', agentId);
  }, [persistAgents, persistChat]);

  const sendMessage = useCallback((agentId: string, content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      agentId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => {
      const updated = {
        ...prev,
        [agentId]: [...(prev[agentId] || []), userMsg],
      };
      persistChat(updated);
      return updated;
    });

    setIsTyping(prev => ({ ...prev, [agentId]: true }));

    setTimeout(() => {
      setIsTyping(prev => ({ ...prev, [agentId]: false }));
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        agentId,
        role: 'assistant',
        content: `[Demo] Received your message. In production, this connects to your OpenClaw instance at ${activeProfile?.address ?? 'localhost:3000'}.`,
        timestamp: new Date().toISOString(),
      };
      setChatMessages(prev => {
        const updated = {
          ...prev,
          [agentId]: [...(prev[agentId] || []), aiMsg],
        };
        persistChat(updated);
        return updated;
      });
    }, 1800);
  }, [activeProfile, persistChat]);

  const clearChat = useCallback((agentId: string) => {
    setChatMessages(prev => {
      const updated = { ...prev, [agentId]: [] };
      persistChat(updated);
      return updated;
    });
    console.log('[OpenClaw] Cleared chat for agent:', agentId);
  }, [persistChat]);

  const executeQuickAction = useCallback((action: QuickAction) => {
    sendMessage(action.agentId, action.command);
    const newActivity: ActivityEntry = {
      id: `act-${Date.now()}`,
      agentId: action.agentId,
      agentName: agents.find(a => a.id === action.agentId)?.name ?? 'Unknown',
      type: 'task',
      title: `Quick action: ${action.label}`,
      detail: action.command,
      timestamp: new Date().toISOString(),
    };
    setActivityFeed(prev => [newActivity, ...prev]);
    console.log('[OpenClaw] Quick action executed:', action.label);
  }, [agents, sendMessage]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    console.log('[OpenClaw] Refreshing data...');
    await new Promise(resolve => setTimeout(resolve, 1200));
    setHeartbeats(mockHeartbeats.map(hb => ({
      ...hb,
      lastPing: new Date().toISOString(),
      latencyMs: hb.status === 'down' ? 0 : Math.floor(Math.random() * 50) + 10,
    })));
    setIsRefreshing(false);
    console.log('[OpenClaw] Data refreshed');
  }, []);

  return {
    agents,
    cronJobs,
    heartbeats,
    chatMessages,
    serverProfiles,
    activeProfile,
    gatewayStatus,
    isRefreshing,
    isTyping,
    dataLoaded,
    addServerProfile,
    updateServerProfile,
    deleteServerProfile,
    setActiveProfile: setActiveProfileFn,
    toggleCronJob,
    addCronJob,
    updateCronJob,
    deleteCronJob,
    updateAgent,
    addAgent,
    deleteAgent,
    sendMessage,
    clearChat,
    refreshData,
    isLoading,
    activityFeed,
    quickActions,
    executeQuickAction,
  };
});
