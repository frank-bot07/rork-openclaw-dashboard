import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MessageCircle, Send, Gamepad2, Smartphone } from 'lucide-react-native';
import { ChannelType } from '@/types/openclaw';
import Colors from '@/constants/colors';

interface ChannelIconProps {
  type: ChannelType;
  size?: number;
}

const channelConfig: Record<ChannelType, { icon: typeof MessageCircle; color: string }> = {
  whatsapp: { icon: MessageCircle, color: Colors.whatsapp },
  telegram: { icon: Send, color: Colors.telegram },
  discord: { icon: Gamepad2, color: Colors.discord },
  imessage: { icon: Smartphone, color: Colors.imessage },
};

export default React.memo(function ChannelIcon({ type, size = 18 }: ChannelIconProps) {
  const config = channelConfig[type];
  const Icon = config.icon;

  return (
    <View style={[styles.container, { backgroundColor: config.color + '18' }]}>
      <Icon size={size} color={config.color} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
