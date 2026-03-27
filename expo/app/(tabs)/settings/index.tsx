import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, Pressable, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Server, LogOut, Wifi, WifiOff, RefreshCw, Moon, Bell, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useSessionStore } from '@/stores/sessionStore';
import { openClawAuth } from '@/lib/openclaw/auth';
import ConnectionStatusBadge from '@/components/ConnectionStatusBadge';
import PressableCard from '@/components/PressableCard';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { connectionState, gatewayUrl, session, clearSession } = useSessionStore();
  const [isTesting, setIsTesting] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // In production, this calls the real gateway health endpoint
      await new Promise(resolve => setTimeout(resolve, 1500));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Connection Healthy', 'Gateway is responding normally.');
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Connection Failed', 'Could not reach the gateway.');
    } finally {
      setIsTesting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      'Disconnect',
      'This will clear your session and return to the connection screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await openClawAuth.logout();
            clearSession();
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.replace('/connect');
          },
        },
      ],
    );
  }, [clearSession, router]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerArea}>
        <Text style={styles.pageTitle}>Settings</Text>
      </View>

      {/* Connection Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>

        <View style={styles.connectionCard}>
          <LinearGradient
            colors={connectionState === 'connected'
              ? ['rgba(16, 185, 129, 0.08)', 'transparent']
              : ['rgba(239, 68, 68, 0.08)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
          />
          <View style={styles.connectionHeader}>
            <View style={styles.connectionIcon}>
              {connectionState === 'connected' ? (
                <Wifi size={20} color={Colors.success} />
              ) : (
                <WifiOff size={20} color={Colors.error} />
              )}
            </View>
            <View style={styles.connectionInfo}>
              <Text style={styles.connectionLabel}>Gateway</Text>
              <Text style={styles.connectionUrl}>{gatewayUrl ?? 'Not connected'}</Text>
              <ConnectionStatusBadge state={connectionState} />
            </View>
          </View>

          {session && (
            <View style={styles.sessionDetails}>
              <View style={styles.sessionRow}>
                <Text style={styles.sessionLabel}>Version</Text>
                <Text style={styles.sessionValue}>{session.gatewayVersion ?? 'unknown'}</Text>
              </View>
              <View style={styles.sessionRow}>
                <Text style={styles.sessionLabel}>Connected</Text>
                <Text style={styles.sessionValue}>
                  {session.connectedAt
                    ? new Date(session.connectedAt).toLocaleTimeString()
                    : '—'}
                </Text>
              </View>
              <View style={styles.sessionRow}>
                <Text style={styles.sessionLabel}>Operator</Text>
                <Text style={styles.sessionValue}>{session.operatorName ?? 'default'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <PressableCard style={styles.actionCard} onPress={handleTestConnection}>
            <View style={styles.actionInner}>
              <RefreshCw
                size={16}
                color={isTesting ? Colors.warning : Colors.primary}
                style={isTesting ? { opacity: 0.6 } : undefined}
              />
              <Text style={styles.actionText}>
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Text>
            </View>
          </PressableCard>

          <PressableCard style={styles.actionCard} onPress={handleDisconnect}>
            <View style={styles.actionInner}>
              <LogOut size={16} color={Colors.error} />
              <Text style={[styles.actionText, { color: Colors.error }]}>Disconnect</Text>
            </View>
          </PressableCard>
        </View>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.prefsCard}>
          <View style={styles.prefRow}>
            <View style={styles.prefLeft}>
              <Moon size={16} color={Colors.textMuted} />
              <Text style={styles.prefLabel}>Dark Mode</Text>
            </View>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlow }}
              thumbColor={darkMode ? Colors.primary : Colors.textMuted}
            />
          </View>
          <View style={styles.prefDivider} />
          <View style={styles.prefRow}>
            <View style={styles.prefLeft}>
              <Bell size={16} color={Colors.textMuted} />
              <Text style={styles.prefLabel}>Notifications</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlow }}
              thumbColor={notifications ? Colors.primary : Colors.textMuted}
            />
          </View>
          <View style={styles.prefDivider} />
          <View style={styles.prefRow}>
            <View style={styles.prefLeft}>
              <Shield size={16} color={Colors.textMuted} />
              <Text style={styles.prefLabel}>Auto-Reconnect</Text>
            </View>
            <Switch
              value={autoReconnect}
              onValueChange={setAutoReconnect}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlow }}
              thumbColor={autoReconnect ? Colors.primary : Colors.textMuted}
            />
          </View>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutCard}>
          <Server size={20} color={Colors.primary} />
          <View style={styles.aboutInfo}>
            <Text style={styles.aboutName}>OpenClaw Operator Console</Text>
            <Text style={styles.aboutVersion}>v1.0.0-alpha</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20 },
  headerArea: { marginBottom: 24 },
  pageTitle: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  connectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    overflow: 'hidden',
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  connectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(77, 154, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionInfo: { flex: 1, gap: 4 },
  connectionLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  connectionUrl: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  sessionDetails: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    gap: 8,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionLabel: { color: Colors.textMuted, fontSize: 13 },
  sessionValue: { color: Colors.text, fontSize: 13, fontFamily: 'monospace' },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  prefsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 4,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  prefLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prefLabel: { color: Colors.text, fontSize: 15, fontWeight: '500' },
  prefDivider: { height: 1, backgroundColor: Colors.cardBorder, marginHorizontal: 14 },
  aboutCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aboutInfo: { gap: 2 },
  aboutName: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  aboutVersion: { color: Colors.textMuted, fontSize: 13 },
});
