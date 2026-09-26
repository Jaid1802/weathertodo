import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Sheet, Touch } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { initials } from '../lib/utils';

export default function ProfileScreen({ navigation }: any) {
  const app = useApp();
  const { state, scheme } = app;
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';

  const user = state.user;
  const isGuest = !user || user.provider === 'guest';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(isGuest ? 'Guest' : (user?.name ?? ''));
  const [headline, setHeadline] = useState(user?.headline ?? 'Planning smarter every day');

  // Display values (Strictly enforce 'Guest' for guest login)
  const displayName = isGuest ? 'Guest' : (user?.name?.trim() || 'User');
  const displayEmail = isGuest ? 'guest@weatherwhattodo.app' : (user?.email || '');
  const displayHeadline = user?.headline || 'Planning smarter every day';
  const userInitials = isGuest ? 'G' : initials(displayName) || 'U';

  const bg = isDark ? '#0B1120' : '#F8FAFC';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const cardBorder = isDark ? '#334155' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const textMuted = isDark ? '#64748B' : '#94A3B8';
  const iconColor = isDark ? '#94A3B8' : '#475569';
  const dividerColor = isDark ? '#334155' : '#F1F5F9';

  const MENU_ITEMS = [
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings-outline' as const,
      onPress: () => navigation.navigate('Settings'),
    },
    {
      id: 'locations',
      label: 'Locations',
      icon: 'location-outline' as const,
      onPress: () => navigation.navigate('Locations'),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'notifications-outline' as const,
      onPress: () => navigation.navigate('Notifications'),
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: 'color-palette-outline' as const,
      onPress: () => navigation.navigate('Appearance'),
    },
    {
      id: 'about',
      label: 'About',
      icon: 'information-circle-outline' as const,
      onPress: () => navigation.navigate('About'),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 100,
        }}
      >
        {/* ---------------- Header ---------------- */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>Profile</Text>
        </View>

        {/* ---------------- User Profile Section ---------------- */}
        <View style={[styles.profileCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Circular Blue Avatar */}
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{userInitials}</Text>
          </View>

          {/* User Details */}
          <View style={styles.profileDetails}>
            <Text numberOfLines={1} style={[styles.userName, { color: textPrimary }]}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={[styles.userEmail, { color: textSecondary }]}>
              {displayEmail}
            </Text>
            <Text numberOfLines={1} style={[styles.userDescription, { color: textMuted }]}>
              {displayHeadline}
            </Text>
          </View>

          {/* Small Profile/User Icon on Right (touchable to edit profile) */}
          <Touch
            onPress={() => {
              setName(displayName);
              setHeadline(displayHeadline);
              setEditing(true);
            }}
            scale={0.92}
            hitSlop={10}
            style={styles.profileAction}
          >
            <Ionicons name="person-outline" size={20} color={iconColor} />
          </Touch>
        </View>

        {/* ---------------- Settings Menu ---------------- */}
        <View style={[styles.menuCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {MENU_ITEMS.map((item, index) => (
            <View key={item.id}>
              <Pressable
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' },
                ]}
              >
                {/* Outline Icon */}
                <Ionicons name={item.icon} size={22} color={iconColor} style={styles.menuIcon} />

                {/* Menu Label */}
                <Text style={[styles.menuLabel, { color: textPrimary }]}>{item.label}</Text>

                {/* Chevron */}
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </Pressable>

              {index < MENU_ITEMS.length - 1 && (
                <View style={[styles.menuDivider, { backgroundColor: dividerColor }]} />
              )}
            </View>
          ))}
        </View>

        {/* ---------------- Sign Out Button ---------------- */}
        <Pressable
          onPress={() => app.signOut()}
          style={({ pressed }) => [
            styles.signOutBtn,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FFF1F2',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECDD3',
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name="log-out-outline" size={19} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      {/* Edit Profile Modal Sheet */}
      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit profile">
        <Text style={[styles.sheetLabel, { color: textMuted }]}>NAME</Text>
        <TextInput
          value={isGuest ? 'Guest' : name}
          onChangeText={isGuest ? undefined : setName}
          editable={!isGuest}
          placeholder="Guest"
          placeholderTextColor={textMuted}
          style={[
            styles.sheetInput,
            {
              backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
              color: isGuest ? textMuted : textPrimary,
              borderColor: cardBorder,
            },
          ]}
        />
        {isGuest && (
          <Text style={{ fontSize: 12, color: textMuted, marginTop: -8, marginBottom: 12 }}>
            Guest accounts use the fixed display name "Guest".
          </Text>
        )}
        <Text style={[styles.sheetLabel, { color: textMuted }]}>HEADLINE</Text>
        <TextInput
          value={headline}
          onChangeText={setHeadline}
          placeholder="Planning smarter every day"
          placeholderTextColor={textMuted}
          style={[
            styles.sheetInput,
            {
              backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
              color: textPrimary,
              borderColor: cardBorder,
            },
          ]}
        />
        <Btn
          title="Save changes"
          full
          onPress={() => {
            const finalName = isGuest ? 'Guest' : (name.trim() || 'User');
            app.updateProfile({ name: finalName, headline: headline.trim() });
            setEditing(false);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 22,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
      },
    }),
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  profileDetails: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  userEmail: {
    fontSize: 13.5,
    fontWeight: '400',
    marginTop: 2,
  },
  userDescription: {
    fontSize: 12.5,
    fontWeight: '400',
    marginTop: 2,
  },
  profileAction: {
    padding: 6,
    borderRadius: 999,
  },
  menuCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 26,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
      },
    }),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuIcon: {
    marginRight: 14,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
    marginRight: 18,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  signOutText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#EF4444',
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sheetInput: {
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 16,
    // @ts-ignore web
    outlineStyle: 'none',
  },
});
