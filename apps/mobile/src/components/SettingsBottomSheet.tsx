import React, { useRef, useState, useCallback } from 'react';
import { Dimensions, Linking, Platform, Pressable, TextInput, View } from 'react-native';
import { reloadAppAsync } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import {
  Settings,
  Mail,
  RotateCcw,
  Pencil,
  Plus,
  User,
  Check,
  X,
  ImagePlus,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import { cn } from 'tailwind-variants';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  pickPhotos,
  compressAndSavePhoto,
  deletePhotoFile,
  getFullPhotoUri,
  type PickPhotosResult,
} from '~/lib/photoUtils';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { toast } from '~/components/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDestructiveAction,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 96;
const TRIGGER_AVATAR_SIZE = 36;
const BANNER_HEIGHT = 64;

// ─── ActionRow ────────────────────────────────────────────────────────────────

interface ActionRowProps {
  label: string;
  onPress: () => Promise<void> | void;
  isLast?: boolean;
  isBold?: boolean;
  icon?: LucideIcon;
  centered?: boolean;
}

function ActionRow({ label, onPress, isLast, isBold, icon, centered }: ActionRowProps) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      className={cn(
        'py-4.5 px-5 w-full h-auto rounded-none',
        centered ? 'justify-center' : 'justify-start',
        !isLast && 'border-b border-border',
      )}>
      {icon && (
        <View className="mr-4">
          <Icon as={icon} className="text-foreground" size={22} strokeWidth={1.5} />
        </View>
      )}
      <Text
        className={cn(
          'text-lg text-foreground',
          isBold ? 'font-body-semibold' : 'font-body-medium',
        )}>
        {label}
      </Text>
    </Button>
  );
}

// ─── ProfileAvatar ────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface ProfileAvatarProps {
  imageUri: string | null;
  name: string | null;
  onPress: () => void;
}

function ProfileAvatar({ imageUri, name, onPress }: ProfileAvatarProps) {
  const { t } = useTranslation();
  const initials = getInitials(name);
  const displayUri = imageUri ? getFullPhotoUri(imageUri) : null;
  const BadgeIcon = imageUri ? Pencil : Plus;

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={t('Change Photo')}
      className="active:scale-95"
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
      }}>
      <Avatar
        alt={name ?? 'Profile'}
        className="border-[6px] border-background"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
        }}>
        <AvatarImage source={displayUri ? { uri: displayUri } : undefined} />
        <AvatarFallback>
          {initials ? (
            <Text className="text-xl font-body-bold text-foreground/70">{initials}</Text>
          ) : (
            <Icon as={User} className="text-foreground/50" size={32} strokeWidth={1.5} />
          )}
        </AvatarFallback>
      </Avatar>

      {/* Dynamic badge: "+" when no photo, pencil when photo exists */}
      <View
        className="absolute bg-primary items-center justify-center border-2 border-background"
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          bottom: 0,
          right: -2,
        }}>
        <Icon
          as={BadgeIcon}
          className="text-primary-foreground"
          size={12}
          strokeWidth={2.5}
        />
      </View>
    </Pressable>
  );
}

// ─── ProfileNameField ─────────────────────────────────────────────────────────

interface ProfileNameFieldProps {
  name: string | null;
  onSave: (newName: string) => void;
}

function ProfileNameField({ name, onSave }: ProfileNameFieldProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? '');
  const inputRef = useRef<TextInput>(null);

  const beginEdit = useCallback(() => {
    setDraft(name ?? '');
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [name]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    onSave(draft.trim());
  }, [draft, onSave]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setDraft(name ?? '');
  }, [name]);

  if (isEditing) {
    return (
      <View className="flex-row items-center gap-2 px-5">
        {/* Cancel button */}
        <Button
          variant="ghost"
          size="none"
          onPress={cancelEdit}
          hitSlop={6}
          className="p-1.5 rounded-full bg-destructive/10">
          <Icon as={X} className="text-destructive" size={16} strokeWidth={2.5} />
        </Button>

        {/* Input */}
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commitEdit}
          returnKeyType="done"
          placeholder={t('Your Name')}
          className="flex-1 text-lg font-body-semibold text-foreground border-b-2 border-primary py-1"
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="words"
          maxLength={50}
        />

        {/* Save button */}
        <Button
          variant="ghost"
          size="none"
          onPress={commitEdit}
          hitSlop={6}
          className="p-1.5 rounded-full bg-primary/10">
          <Icon
            as={Check}
            className="text-primary-foreground"
            size={16}
            strokeWidth={2.5}
          />
        </Button>
      </View>
    );
  }

  return (
    <Pressable
      onPress={beginEdit}
      className="flex-row items-center gap-1.5 active:opacity-70 px-5 py-1">
      <Text
        variant="h2"
        className={cn(
          'font-heading',
          name ? 'text-foreground' : 'text-muted-foreground',
        )}>
        {name || t('Your Name')}
      </Text>
      <Icon as={Pencil} className="text-muted-foreground" size={14} strokeWidth={2} />
    </Pressable>
  );
}

interface ProfileSectionProps {
  imageUri: string | null;
  name: string | null;
  onAvatarPress: () => void;
  onSaveName: (newName: string) => void;
  children: React.ReactNode;
}

function ProfileSection({
  imageUri,
  name,
  onAvatarPress,
  onSaveName,
  children,
}: ProfileSectionProps) {
  return (
    <>
      <View style={{ paddingTop: AVATAR_SIZE / 2 + 8 }}>
        <ProfileNameField name={name} onSave={onSaveName} />
        {children}
      </View>

      <View
        className="absolute"
        style={{ top: BANNER_HEIGHT - AVATAR_SIZE / 2, left: 20 }}
        pointerEvents="box-none">
        <ProfileAvatar imageUri={imageUri} name={name} onPress={onAvatarPress} />
      </View>
    </>
  );
}

// ─── TriggerAvatar ────────────────────────────────────────────────────────────

/** Small avatar shown in the header bar as the trigger button. */
function TriggerAvatar({
  imageUri,
  name,
}: {
  imageUri: string | null;
  name: string | null;
}) {
  const initials = getInitials(name);
  const displayUri = imageUri ? getFullPhotoUri(imageUri) : null;

  return (
    <Avatar
      alt={name ?? 'Profile'}
      className="border border-primary-foreground/50"
      style={{
        width: TRIGGER_AVATAR_SIZE,
        height: TRIGGER_AVATAR_SIZE,
        borderRadius: TRIGGER_AVATAR_SIZE / 2,
      }}>
      <AvatarImage source={displayUri ? { uri: displayUri } : undefined} />
      <AvatarFallback className="bg-background/60">
        {initials ? (
          <Text className="text-sm font-body-bold text-primary-foreground">
            {initials}
          </Text>
        ) : (
          <Icon
            as={User}
            className="text-primary-foreground/70"
            size={14}
            strokeWidth={2}
          />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSupportBody(): string {
  const appVersion = Constants.expoConfig?.version ?? 'Unknown';
  const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const osVersion = Platform.Version;
  const device = Device.modelName ?? 'Unknown';
  const { width, height } = Dimensions.get('screen');
  const resolution = `${Math.round(width)}x${Math.round(height)}`;

  return [
    '',
    '',
    '',
    '---',
    `App Version: ${appVersion}`,
    `Platform: ${platform}`,
    `OS Version: ${osVersion}`,
    `Device Model: ${device}`,
    `Resolution: ${resolution}`,
  ].join('\n');
}

// ─── SettingsBottomSheet ──────────────────────────────────────────────────────

export function SettingsBottomSheet() {
  const router = useRouter();
  const { t } = useTranslation();
  const sheet = useRef<TrueSheet>(null);
  const [themeRadiusStr, bgColor] = useCSSVariable([
    '--theme-radius',
    '--color-background',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  const profileName = useSettingsStore((s) => s.profileName);
  const profileImageUri = useSettingsStore((s) => s.profileImageUri);
  const setProfileName = useSettingsStore((s) => s.setProfileName);
  const setProfileImageUri = useSettingsStore((s) => s.setProfileImageUri);

  // Photo options dialog
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [permissionAlert, setPermissionAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: '', message: '' });

  const present = () => sheet.current?.present();
  const dismiss = () => sheet.current?.dismiss();

  const handleSettings = async () => {
    await dismiss();
    router.navigate('/settings');
  };

  const handleContactUs = async () => {
    await dismiss();
    const subject = encodeURIComponent('Tackbok - App Support');
    const body = encodeURIComponent(buildSupportBody());
    const url = `mailto:tackbok.support@mehra.dev?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(url);
    } catch {
      // Silently fail if no email client is configured
    }
  };

  const handleReloadApp = async () => {
    await dismiss();
    reloadAppAsync();
  };

  /** Show an alert guiding the user to enable photo permissions in device Settings. */
  const showPermissionDeniedAlert = useCallback(
    (source: 'camera' | 'library') => {
      const title =
        source === 'camera'
          ? t('Camera Access Required')
          : t('Photo Library Access Required');
      const message =
        source === 'camera'
          ? t('Please enable camera access in your device settings to take photos.')
          : t(
              'Please enable photo library access in your device settings to select photos.',
            );

      setPermissionAlert({ isOpen: true, title, message });
    },
    [t],
  );

  /** Process picker outcomes so denied/cancelled are handled intentionally. */
  const handlePickPhotoResult = useCallback(
    async (result: PickPhotosResult) => {
      if (result.status === 'denied') {
        showPermissionDeniedAlert(result.source);
        return;
      }
      if (result.status === 'cancelled') return;
      if (result.uris.length === 0) return;

      try {
        // Save the new photo first so a failure doesn't destroy the current avatar.
        const asset = await compressAndSavePhoto(result.uris[0]);
        const previousUri = profileImageUri;

        setProfileImageUri(asset.uri);

        if (previousUri && previousUri !== asset.uri) {
          deletePhotoFile(previousUri);
        }
      } catch (error) {
        console.error('Failed to update profile photo:', error);
        toast.error(t('Failed to add photos'), { useModal: true });
      }
    },
    [profileImageUri, setProfileImageUri, showPermissionDeniedAlert, t],
  );

  /** Pick a new photo, compress, save to documents, and update the store. */
  const handlePickNewPhoto = useCallback(async () => {
    setPhotoDialogOpen(false);
    const result = await pickPhotos('library', 1);
    await handlePickPhotoResult(result);
  }, [handlePickPhotoResult]);

  /** Tap on avatar → show dialog (if photo exists) or pick directly. */
  const handleAvatarPress = useCallback(() => {
    if (profileImageUri) {
      // Has existing photo → show Update/Remove dialog
      setPhotoDialogOpen(true);
    } else {
      // No photo → pick directly
      handlePickNewPhoto();
    }
  }, [handlePickNewPhoto, profileImageUri]);

  /** Remove the current photo and clean up the file. */
  const handleRemovePhoto = useCallback(() => {
    setPhotoDialogOpen(false);
    if (profileImageUri) {
      deletePhotoFile(profileImageUri);
      setProfileImageUri(null);
    }
  }, [profileImageUri, setProfileImageUri]);

  const handleSaveName = useCallback(
    (newName: string) => {
      setProfileName(newName || null);
    },
    [setProfileName],
  );

  return (
    <View>
      {/* ── Trigger: small profile avatar in the header ── */}
      <Button
        variant="ghost"
        onPress={present}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('Open Settings')}
        className="py-1 px-1 w-auto h-auto">
        <TriggerAvatar imageUri={profileImageUri} name={profileName} />
      </Button>

      <TrueSheet
        ref={sheet}
        detents={['auto']}
        cornerRadius={sheetRadius}
        grabber={false}
        backgroundColor={bgColor as string}
        maxContentWidth={400}>
        {/* Outer wrapper — clips the banner to match sheet corner radius */}
        <View
          style={{
            overflow: 'hidden',
            borderTopLeftRadius: sheetRadius,
            borderTopRightRadius: sheetRadius,
          }}>
          {/* ── Primary-colored banner ── */}
          <View className="bg-primary" style={{ height: BANNER_HEIGHT }}>
            {/* Grabber handle */}
            <View className="items-center pt-3">
              <View className="w-9 h-1 rounded-full bg-primary-foreground/30" />
            </View>

            {/* X close button — sits inside the banner, pushed down from top */}
            <View className="absolute right-3" style={{ top: 20 }}>
              <Button
                variant="ghost"
                size="icon"
                onPress={dismiss}
                hitSlop={10}
                className="w-8 h-8">
                <Icon as={X} className="text-primary-foreground/70" size={20} />
              </Button>
            </View>
          </View>

          <ProfileSection
            imageUri={profileImageUri}
            name={profileName}
            onAvatarPress={handleAvatarPress}
            onSaveName={handleSaveName}>
            <View className="border-t border-border mt-3">
              <ActionRow label={t('Settings')} icon={Settings} onPress={handleSettings} />
              <ActionRow label={t('Contact Us')} icon={Mail} onPress={handleContactUs} />
              <ActionRow
                label={t('Reload App')}
                icon={RotateCcw}
                onPress={handleReloadApp}
                isLast
              />
            </View>

            <View className="h-2 pb-safe" />
          </ProfileSection>
        </View>
      </TrueSheet>

      {/* ── Photo options dialog: Update / Remove ── */}
      <AlertDialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <AlertDialogContent
          className={sheetRadius === 0 ? 'rounded-none' : ''}
          androidOverlayStrategy="modal">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Profile Photo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Would you like to update or remove your profile photo?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setPhotoDialogOpen(false)}>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogDestructiveAction onPress={handleRemovePhoto}>
              <Icon as={Trash2} className="text-destructive-foreground" size={16} />
              <Text>{t('Remove Photo')}</Text>
            </AlertDialogDestructiveAction>
            <Button onPress={handlePickNewPhoto}>
              <Icon as={ImagePlus} className="text-primary-foreground" size={16} />
              <Text>{t('Update Photo')}</Text>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={permissionAlert.isOpen}
        onOpenChange={(isOpen) => setPermissionAlert((prev) => ({ ...prev, isOpen }))}>
        <AlertDialogContent
          className={sheetRadius === 0 ? 'rounded-none' : ''}
          androidOverlayStrategy="modal">
          <AlertDialogHeader>
            <AlertDialogTitle>{permissionAlert.title}</AlertDialogTitle>
            <AlertDialogDescription>{permissionAlert.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={() => Linking.openSettings()}>
              <Text>{t('Open Settings')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
