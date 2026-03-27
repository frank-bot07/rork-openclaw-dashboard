import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Modal, ScrollView, Platform } from 'react-native';
import { MessageCircle, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { Agent } from '@/types/openclaw';
import { getAgentColor } from '@/constants/agentColors';
import StatusDot from '@/components/StatusDot';

interface FloatingChatButtonProps {
  agents: Agent[];
}

export default React.memo(function FloatingChatButton({ agents }: FloatingChatButtonProps) {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  const onlineAgents = agents.filter(a => a.status !== 'offline');

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [glowAnim]);

  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onlineAgents.length === 1) {
      router.push(`/agent/${onlineAgents[0].id}`);
    } else if (agents.length === 1) {
      router.push(`/agent/${agents[0].id}`);
    } else {
      setShowPicker(true);
    }
  }, [onlineAgents, agents, router]);

  const handleSelectAgent = useCallback((agentId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(false);
    router.push(`/agent/${agentId}`);
  }, [router]);

  const handlePressIn = useCallback(() => {
    Animated.spring(pulseAnim, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  }, [pulseAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 8 }).start();
  }, [pulseAnim]);

  return (
    <>
      <Animated.View style={[styles.fabContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Animated.View style={[styles.fabGlow, { opacity: glowAnim }]} />
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          testID="floating-chat-btn"
        >
          <LinearGradient
            colors={[Colors.primary, Colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <MessageCircle size={24} color="#000" strokeWidth={2.5} />
          </LinearGradient>
        </Pressable>
        {onlineAgents.length > 0 && (
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{onlineAgents.length}</Text>
          </View>
        )}
      </Animated.View>

      <Modal
        visible={showPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <View>
              <Text style={styles.pickerTitle}>Start chatting</Text>
              <Text style={styles.pickerSubtitle}>Tap an agent to begin</Text>
            </View>
            <Pressable style={styles.pickerClose} onPress={() => setShowPicker(false)} hitSlop={12}>
              <X size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent} showsVerticalScrollIndicator={false}>
            {agents.filter(a => a.status !== 'offline').length > 0 && (
              <Text style={styles.pickerSectionLabel}>Online Now</Text>
            )}
            {agents.filter(a => a.status !== 'offline').map((agent) => {
              const color = getAgentColor(agent.id);
              return (
                <Pressable
                  key={agent.id}
                  style={styles.pickerAgent}
                  onPress={() => handleSelectAgent(agent.id)}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: color.bg }]}>
                    <Text style={[styles.pickerAvatarText, { color: color.text }]}>
                      {agent.avatar ?? agent.name[0]}
                    </Text>
                  </View>
                  <View style={styles.pickerAgentInfo}>
                    <Text style={styles.pickerAgentName}>{agent.name}</Text>
                    <Text style={styles.pickerAgentDesc} numberOfLines={1}>{agent.description}</Text>
                  </View>
                  <StatusDot status={agent.status} size={8} />
                </Pressable>
              );
            })}

            {agents.filter(a => a.status === 'offline').length > 0 && (
              <Text style={[styles.pickerSectionLabel, { marginTop: 24 }]}>Offline</Text>
            )}
            {agents.filter(a => a.status === 'offline').map((agent) => {
              const color = getAgentColor(agent.id);
              return (
                <Pressable
                  key={agent.id}
                  style={[styles.pickerAgent, { opacity: 0.55 }]}
                  onPress={() => handleSelectAgent(agent.id)}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: color.bg }]}>
                    <Text style={[styles.pickerAvatarText, { color: color.text }]}>
                      {agent.avatar ?? agent.name[0]}
                    </Text>
                  </View>
                  <View style={styles.pickerAgentInfo}>
                    <Text style={styles.pickerAgentName}>{agent.name}</Text>
                    <Text style={styles.pickerAgentDesc} numberOfLines={1}>{agent.description}</Text>
                  </View>
                  <StatusDot status={agent.status} size={8} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute' as const,
    bottom: Platform.OS === 'ios' ? 100 : 80,
    right: 20,
    zIndex: 999,
  },
  fabGlow: {
    position: 'absolute' as const,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    top: -4,
    left: -4,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabBadge: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    backgroundColor: Colors.success,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  fabBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800' as const,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pickerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  pickerTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  pickerSubtitle: {
    color: Colors.textMuted,
    fontSize: 15,
    marginTop: 4,
  },
  pickerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pickerList: {
    flex: 1,
  },
  pickerListContent: {
    padding: 24,
    paddingBottom: 40,
  },
  pickerSectionLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  pickerAgent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
    marginBottom: 10,
  },
  pickerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pickerAvatarText: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  pickerAgentInfo: {
    flex: 1,
  },
  pickerAgentName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  pickerAgentDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
});
