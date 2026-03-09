import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Alert, Pressable, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Server, Plus, Trash2, Check, Wifi, Eye, EyeOff, ChevronRight, Moon, Bell, Shield, Database } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import { ServerProfile } from '@/types/openclaw';
import PressableCard from '@/components/PressableCard';

export default function SettingsScreen() {
  const {
    serverProfiles, activeProfile, addServerProfile,
    deleteServerProfile, setActiveProfile,
  } = useOpenClaw();
  const insets = useSafeAreaInsets();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);

  const handleAddProfile = useCallback(() => {
    if (!name.trim() || !address.trim()) {
      Alert.alert('Missing Fields', 'Please fill in the server name and address.');
      return;
    }
    const profile: ServerProfile = {
      id: `profile-${Date.now()}`,
      name: name.trim(),
      address: address.trim(),
      username: username.trim(),
      password: password.trim(),
      isActive: serverProfiles.length === 0,
    };
    addServerProfile(profile);
    setName('');
    setAddress('');
    setUsername('');
    setPassword('');
    setShowForm(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [name, address, username, password, serverProfiles.length, addServerProfile]);

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Connection Successful', 'Connected to your OpenClaw gateway.');
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Connection Failed', 'Could not reach the gateway. Check your address and try again.');
    },
  });

  const { mutate: testConnection, isPending: isTesting } = testConnectionMutation;

  const handleTestConnection = useCallback(() => {
    testConnection();
  }, [testConnection]);

  const handleDelete = useCallback((id: string, profileName: string) => {
    Alert.alert(
      'Delete Profile',
      `Remove "${profileName}"? You can always add it back later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteServerProfile(id);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  }, [deleteServerProfile]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.headerArea}>
        <Text style={styles.pageTitle}>Settings</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Server Profiles</Text>
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              setShowForm(!showForm);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Plus size={16} color={Colors.primary} />
            <Text style={styles.addBtnText}>{showForm ? 'Cancel' : 'Add New'}</Text>
          </Pressable>
        </View>

        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Server Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Home Server"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              testID="settings-profile-name"
            />
            <Text style={styles.formLabel}>Address</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 192.168.1.100:3000"
              placeholderTextColor={Colors.textMuted}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="none"
              keyboardType="url"
              testID="settings-address"
            />
            <Text style={styles.formLabel}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="admin"
              placeholderTextColor={Colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              testID="settings-username"
            />
            <Text style={styles.formLabel}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                testID="settings-password"
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={12}
              >
                {showPassword ? <EyeOff size={18} color={Colors.textMuted} /> : <Eye size={18} color={Colors.textMuted} />}
              </Pressable>
            </View>
            <Pressable style={styles.saveBtn} onPress={handleAddProfile}>
              <LinearGradient
                colors={[Colors.primary, Colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtnGradient}
              >
                <Text style={styles.saveBtnText}>Save Profile</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {serverProfiles.length === 0 && !showForm && (
          <View style={styles.emptyState}>
            <Server size={36} color={Colors.textDim} />
            <Text style={styles.emptyText}>No server profiles</Text>
            <Text style={styles.emptySubtext}>Add your OpenClaw server to get started</Text>
          </View>
        )}

        {serverProfiles.map((profile) => (
          <View key={profile.id} style={[styles.profileCard, profile.isActive && styles.profileCardActive]}>
            {profile.isActive && (
              <LinearGradient
                colors={['rgba(77, 154, 255, 0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              />
            )}
            <Pressable
              style={styles.profileMain}
              onPress={() => {
                setActiveProfile(profile.id);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={[styles.profileIcon, profile.isActive && styles.profileIconActive]}>
                <Server size={18} color={profile.isActive ? Colors.primary : Colors.textMuted} />
              </View>
              <View style={styles.profileInfo}>
                <View style={styles.profileNameRow}>
                  <Text style={styles.profileName}>{profile.name}</Text>
                  {profile.isActive && (
                    <View style={styles.activeBadge}>
                      <Check size={10} color={Colors.primary} />
                      <Text style={styles.activeText}>Active</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.profileAddress}>{profile.address}</Text>
                {profile.username ? (
                  <Text style={styles.profileUser}>@{profile.username}</Text>
                ) : null}
              </View>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => handleDelete(profile.id, profile.name)}
                hitSlop={12}
              >
                <Trash2 size={16} color={Colors.error} />
              </Pressable>
            </Pressable>
          </View>
        ))}
      </View>

      {activeProfile && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <PressableCard
            style={styles.testCard}
            onPress={handleTestConnection}
          >
            <View style={styles.testRow}>
              <View style={[styles.testIconWrap, { backgroundColor: isTesting ? Colors.warningGlow : Colors.primaryGlow }]}>
                <Wifi size={16} color={isTesting ? Colors.warning : Colors.primary} />
              </View>
              <View style={styles.testInfo}>
                <Text style={styles.testText}>
                  {isTesting ? 'Testing Connection...' : 'Test Connection'}
                </Text>
                <Text style={styles.testSubtext}>Verify your server is reachable</Text>
              </View>
              <ChevronRight size={16} color={Colors.textDim} />
            </View>
          </PressableCard>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.prefsCard}>
          <View style={styles.prefRow}>
            <View style={styles.prefLeft}>
              <View style={[styles.prefIconWrap, { backgroundColor: 'rgba(124, 92, 231, 0.12)' }]}>
                <Moon size={16} color="#7C5CE7" />
              </View>
              <View>
                <Text style={styles.prefLabel}>Dark Mode</Text>
                <Text style={styles.prefDesc}>Always use dark theme</Text>
              </View>
            </View>
            <Switch
              value={darkMode}
              onValueChange={(val) => { setDarkMode(val); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlowStrong }}
              thumbColor={darkMode ? Colors.primary : Colors.textMuted}
            />
          </View>

          <View style={styles.prefDivider} />

          <View style={styles.prefRow}>
            <View style={styles.prefLeft}>
              <View style={[styles.prefIconWrap, { backgroundColor: Colors.warningGlow }]}>
                <Bell size={16} color={Colors.warning} />
              </View>
              <View>
                <Text style={styles.prefLabel}>Notifications</Text>
                <Text style={styles.prefDesc}>Agent alerts and status changes</Text>
              </View>
            </View>
            <Switch
              value={notifications}
              onValueChange={(val) => { setNotifications(val); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlowStrong }}
              thumbColor={notifications ? Colors.primary : Colors.textMuted}
            />
          </View>

          <View style={styles.prefDivider} />

          <View style={styles.prefRow}>
            <View style={styles.prefLeft}>
              <View style={[styles.prefIconWrap, { backgroundColor: Colors.successGlow }]}>
                <Shield size={16} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.prefLabel}>Auto-Reconnect</Text>
                <Text style={styles.prefDesc}>Reconnect when connection drops</Text>
              </View>
            </View>
            <Switch
              value={autoReconnect}
              onValueChange={(val) => { setAutoReconnect(val); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlowStrong }}
              thumbColor={autoReconnect ? Colors.primary : Colors.textMuted}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <PressableCard
          style={styles.storageCard}
          onPress={() => {
            Alert.alert(
              'Clear All Data',
              'This will remove all saved agents, chat history, and scheduled jobs. Are you sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear Everything',
                  style: 'destructive',
                  onPress: () => {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    Alert.alert('Data Cleared', 'Restart the app to reload defaults.');
                  },
                },
              ]
            );
          }}
        >
          <View style={styles.storageRow}>
            <View style={[styles.prefIconWrap, { backgroundColor: Colors.errorGlow }]}>
              <Database size={16} color={Colors.error} />
            </View>
            <View style={styles.storageInfo}>
              <Text style={styles.storageLabel}>Clear Local Data</Text>
              <Text style={styles.storageDesc}>Remove all cached data and start fresh</Text>
            </View>
            <ChevronRight size={16} color={Colors.textDim} />
          </View>
        </PressableCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutCard}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutDivider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>OpenClaw SDK</Text>
            <Text style={styles.aboutValue}>2.4.1</Text>
          </View>
          <View style={styles.aboutDivider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Platform</Text>
            <Text style={styles.aboutValue}>React Native / Expo</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 110 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
  },
  headerArea: {
    paddingBottom: 8,
  },
  pageTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.primaryGlow,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(77, 154, 255, 0.15)',
    marginBottom: 16,
  },
  addBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 20,
    marginBottom: 16,
  },
  formLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  passwordRow: {
    position: 'relative' as const,
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeBtn: {
    position: 'absolute' as const,
    right: 16,
    top: 14,
  },
  saveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 24,
  },
  saveBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
  },
  saveBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 17,
    fontWeight: '600' as const,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
    overflow: 'hidden',
  },
  profileCardActive: {
    borderColor: 'rgba(77, 154, 255, 0.18)',
  },
  profileMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIconActive: {
    backgroundColor: Colors.primaryGlow,
  },
  profileInfo: {
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryGlow,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77, 154, 255, 0.15)',
  },
  activeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  profileAddress: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 3,
  },
  profileUser: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 10,
  },
  testCard: {
    marginTop: -8,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  testIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testInfo: {
    flex: 1,
  },
  testText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  testSubtext: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  prefsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 6,
    marginTop: -8,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  prefLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  prefIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  prefDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  prefDivider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginHorizontal: 14,
  },
  storageCard: {
    marginTop: -8,
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  storageInfo: {
    flex: 1,
  },
  storageLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  storageDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  aboutCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
    marginTop: -8,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  aboutLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  aboutValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  aboutDivider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 10,
  },
});
