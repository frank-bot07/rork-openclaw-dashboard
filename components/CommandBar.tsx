import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Send, X, ChevronDown, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { Agent } from '@/types/openclaw';
import { getAgentColor } from '@/constants/agentColors';
import StatusDot from '@/components/StatusDot';

interface CommandBarProps {
  agents: Agent[];
  onSend: (agentId: string, message: string) => void;
  onNavigateToAgent: (agentId: string) => void;
}

export default React.memo(function CommandBar({ agents, onSend, onNavigateToAgent }: CommandBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? '');
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const onlineAgents = useMemo(() => agents.filter(a => a.status !== 'offline'), [agents]);
  const selectedAgent = useMemo(() => agents.find(a => a.id === selectedAgentId), [agents, selectedAgentId]);
  const accentColor = useMemo(() => {
    if (!selectedAgent) return { bg: Colors.primaryGlow, text: Colors.primary, border: 'rgba(61, 139, 255, 0.25)' };
    return getAgentColor(selectedAgent.id);
  }, [selectedAgent]);

  const handleOpen = useCallback(() => {
    setExpanded(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleClose = useCallback(() => {
    setExpanded(false);
    setInput('');
    setShowAgentPicker(false);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || !selectedAgentId) return;
    onSend(selectedAgentId, input.trim());
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onNavigateToAgent(selectedAgentId);
    handleClose();
  }, [input, selectedAgentId, onSend, onNavigateToAgent, handleClose]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setShowAgentPicker(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <>
      <Pressable onPress={handleOpen} testID="command-bar-trigger">
        <View style={styles.trigger}>
          <LinearGradient
            colors={[Colors.heroGradientStart, Colors.heroGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
          />
          <View style={styles.triggerLeft}>
            <View style={styles.triggerIcon}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <Zap size={18} color={Colors.cyber} />
              </Animated.View>
            </View>
            <Text style={styles.triggerText}>Send a command...</Text>
          </View>
          <View style={styles.triggerBadge}>
            <View style={styles.triggerBadgeDot} />
            <Text style={styles.triggerBadgeText}>{onlineAgents.length} online</Text>
          </View>
        </View>
      </Pressable>

      <Modal
        visible={expanded}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          style={styles.modal}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Send Command</Text>
            <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
              <X size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.agentSelector}>
            <Text style={styles.selectorLabel}>Send to</Text>
            <Pressable
              style={styles.agentPickerBtn}
              onPress={() => setShowAgentPicker(!showAgentPicker)}
            >
              {selectedAgent && (
                <View style={[styles.miniAvatar, { backgroundColor: accentColor.bg }]}>
                  <Text style={[styles.miniAvatarText, { color: accentColor.text }]}>
                    {selectedAgent.name[0]}
                  </Text>
                </View>
              )}
              <Text style={styles.agentPickerName}>
                {selectedAgent?.name ?? 'Choose an agent'}
              </Text>
              <ChevronDown size={16} color={Colors.textMuted} />
            </Pressable>
          </View>

          {showAgentPicker && (
            <ScrollView style={styles.agentList} contentContainerStyle={styles.agentListContent}>
              {agents.map((agent) => {
                const color = getAgentColor(agent.id);
                return (
                  <Pressable
                    key={agent.id}
                    style={[
                      styles.agentOption,
                      selectedAgentId === agent.id && styles.agentOptionActive,
                    ]}
                    onPress={() => handleSelectAgent(agent.id)}
                  >
                    <View style={[styles.optionAvatar, { backgroundColor: color.bg }]}>
                      <Text style={[styles.optionAvatarText, { color: color.text }]}>
                        {agent.name[0]}
                      </Text>
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionName}>{agent.name}</Text>
                      <Text style={styles.optionModel}>{agent.model}</Text>
                    </View>
                    <StatusDot status={agent.status} size={8} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.inputArea}>
            <TextInput
              style={styles.commandInput}
              placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : 'Type a command...'}
              placeholderTextColor={Colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={4000}
              autoFocus
              testID="command-input"
            />
          </View>

          <View style={styles.bottomBar}>
            <Text style={styles.hintText}>
              Opens chat with {selectedAgent?.name ?? 'agent'} after sending
            </Text>
            <Pressable
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim()}
            >
              {input.trim() ? (
                <LinearGradient
                  colors={[Colors.primary, Colors.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendBtnGradient}
                >
                  <Send size={18} color="#000" />
                  <Text style={styles.sendBtnText}>Send</Text>
                </LinearGradient>
              ) : (
                <View style={styles.sendBtnGradient}>
                  <Send size={18} color={Colors.textDim} />
                  <Text style={[styles.sendBtnText, { color: Colors.textDim }]}>Send</Text>
                </View>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: 16,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  triggerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.cyberGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerText: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: '500' as const,
  },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.successGlow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  triggerBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  triggerBadgeText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  modal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  selectorLabel: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  agentPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: {
    fontSize: 14,
    fontWeight: '800' as const,
  },
  agentPickerName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
    flex: 1,
  },
  agentList: {
    maxHeight: 260,
    marginHorizontal: 20,
  },
  agentListContent: {
    gap: 6,
    paddingBottom: 10,
  },
  agentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  agentOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  optionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionAvatarText: {
    fontSize: 15,
    fontWeight: '800' as const,
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  optionModel: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  inputArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  commandInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    textAlignVertical: 'top' as const,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  hintText: {
    color: Colors.textDim,
    fontSize: 13,
    flex: 1,
    marginRight: 12,
  },
  sendBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
  },
  sendBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  sendBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
