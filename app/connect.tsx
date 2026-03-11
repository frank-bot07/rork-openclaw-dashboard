import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Eye, EyeOff, Radar, ShieldCheck } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { openClawAuth } from '@/lib/openclaw/auth';
import {
  buildSessionFromOverview,
  getGatewayUrlWarning,
  isUnauthorizedConnectionError,
  normalizeGatewayUrl,
  toConnectionErrorMessage,
} from '@/lib/openclaw/connection';
import { createOpenClawClient } from '@/lib/openclaw/client';
import { useSessionStore } from '@/stores/sessionStore';

export default function ConnectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setConnecting = useSessionStore((state) => state.setConnecting);
  const setConnected = useSessionStore((state) => state.setConnected);
  const setDisconnected = useSessionStore((state) => state.setDisconnected);
  const setUnauthorized = useSessionStore((state) => state.setUnauthorized);

  const [gatewayUrl, setGatewayUrl] = useState('');
  const [operatorToken, setOperatorToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const gatewayWarning = useMemo(() => getGatewayUrlWarning(gatewayUrl), [gatewayUrl]);
  const tokenStorageLabel =
    Platform.OS === 'web' ? 'Stored in browser localStorage (web fallback)' : 'Stored in Expo SecureStore';

  useEffect(() => {
    let isMounted = true;

    const loadLastGatewayUrl = async () => {
      const lastGatewayUrl = await openClawAuth.getLastGatewayUrl();
      if (isMounted && lastGatewayUrl) {
        setGatewayUrl(lastGatewayUrl);
      }
    };

    void loadLastGatewayUrl();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleConnect = useCallback(async () => {
    const trimmedToken = operatorToken.trim();
    let normalizedUrl = '';

    if (!trimmedToken) {
      const nextError = 'Enter your operator token.';
      setErrorMessage(nextError);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      normalizedUrl = normalizeGatewayUrl(gatewayUrl);
    } catch (error) {
      setErrorMessage(toConnectionErrorMessage(error));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);
    setConnecting(normalizedUrl);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const client = createOpenClawClient({
        baseUrl: normalizedUrl,
        authToken: trimmedToken,
      });
      await client.connect();
      const overview = await client.getOverview();
      const session = buildSessionFromOverview(overview, normalizedUrl);

      await openClawAuth.saveTokens({ accessToken: trimmedToken });
      await openClawAuth.saveSession(session);
      client.disconnect('Temporary connect test completed.');

      setConnected(session);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/(dashboard)');
    } catch (error) {
      console.error('[Connect] Raw error:', error);
      console.error('[Connect] Error type:', typeof error, error?.constructor?.name);
      if (error && typeof error === 'object') {
        console.error('[Connect] Error keys:', Object.keys(error));
        console.error('[Connect] Error code:', (error as any).code);
        console.error('[Connect] Error message:', (error as any).message);
      }
      const nextError = toConnectionErrorMessage(error);
      console.error('[Connect] Displayed error:', nextError);
      setErrorMessage(nextError);

      if (isUnauthorizedConnectionError(error)) {
        setUnauthorized(nextError);
      } else {
        setDisconnected(nextError);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsConnecting(false);
    }
  }, [
    gatewayUrl,
    operatorToken,
    router,
    setConnected,
    setConnecting,
    setDisconnected,
    setUnauthorized,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 24) + 32,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <LinearGradient
            colors={[Colors.heroGradientStart, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.heroGlow]}
          />

          <View style={styles.heroBadge}>
            <Radar size={14} color={Colors.cyber} />
            <Text style={styles.heroBadgeText}>Mission Control Link</Text>
          </View>

          <Text style={styles.title}>Connect to your OpenClaw gateway</Text>
          <Text style={styles.subtitle}>
            One deployment per install. Enter the gateway URL and operator token to restore live
            supervision.
          </Text>

          <View style={styles.signalRow}>
            <View style={styles.signalCard}>
              <View style={[styles.signalIconWrap, { backgroundColor: Colors.primaryGlow }]}>
                <ShieldCheck size={16} color={Colors.primary} />
              </View>
              <View style={styles.signalCopy}>
                <Text style={styles.signalLabel}>Secure token storage</Text>
                <Text style={styles.signalValue}>{tokenStorageLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionLabel}>Gateway URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setGatewayUrl}
            placeholder="192.168.1.100:18789 or https://my-gateway.com"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            testID="connect-gateway-url"
            value={gatewayUrl}
          />
          <Text style={styles.helperText}>
            Local network addresses default to `http://`. Public domains default to `https://`.
          </Text>
          {gatewayWarning ? <Text style={styles.warningText}>{gatewayWarning}</Text> : null}

          <Text style={[styles.sectionLabel, styles.tokenLabel]}>Operator token</Text>
          <View style={styles.tokenRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setOperatorToken}
              placeholder="Paste scoped operator token"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showToken}
              style={[styles.input, styles.tokenInput]}
              testID="connect-operator-token"
              value={operatorToken}
            />
            <Pressable
              hitSlop={12}
              onPress={() => setShowToken((current) => !current)}
              style={styles.tokenToggle}
            >
              {showToken ? (
                <EyeOff size={18} color={Colors.textMuted} />
              ) : (
                <Eye size={18} color={Colors.textMuted} />
              )}
            </Pressable>
          </View>

          {errorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Connection failed</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={isConnecting}
            onPress={handleConnect}
            style={({ pressed }) => [
              styles.connectButton,
              pressed && !isConnecting ? styles.connectButtonPressed : null,
              isConnecting ? styles.connectButtonDisabled : null,
            ]}
            testID="connect-submit"
          >
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.connectButtonGradient}
            >
              {isConnecting ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#051016" size="small" />
                  <Text style={styles.connectButtonText}>Connecting...</Text>
                </View>
              ) : (
                <Text style={styles.connectButtonText}>Connect</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  heroCard: {
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 24,
    gap: 16,
  },
  heroGlow: {
    borderRadius: 28,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  signalRow: {
    gap: 12,
  },
  signalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
  },
  signalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalCopy: {
    flex: 1,
    gap: 2,
  },
  signalLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  signalValue: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 20,
  },
  sectionLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  tokenLabel: {
    marginTop: 18,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    color: Colors.text,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  helperText: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  warningText: {
    color: Colors.warning,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  tokenInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  tokenToggle: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  errorCard: {
    backgroundColor: Colors.errorGlow,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 85, 102, 0.18)',
    marginTop: 18,
    padding: 14,
    gap: 6,
  },
  errorTitle: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  errorMessage: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  connectButton: {
    marginTop: 22,
    borderRadius: 18,
    overflow: 'hidden',
  },
  connectButtonPressed: {
    opacity: 0.92,
  },
  connectButtonDisabled: {
    opacity: 0.8,
  },
  connectButtonGradient: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  connectButtonText: {
    color: '#051016',
    fontSize: 16,
    fontWeight: '800' as const,
    letterSpacing: -0.2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
