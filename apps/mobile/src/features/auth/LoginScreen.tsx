import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useAuth } from './AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Animated Landing Intro ───────────────────────────────────────────────────
// Purely additive — does not touch any auth logic below.
// Uses React Native's built-in Animated API with useNativeDriver:true for
// 60fps GPU-composited animations without installing new dependencies.

interface LandingIntroProps {
  onComplete: () => void;
}

const LandingIntro: React.FC<LandingIntroProps> = ({ onComplete }) => {
  // Hero scale: 0.88 → 1.0
  const heroScale = useRef(new Animated.Value(0.88)).current;
  // Logo opacity: 0 → 1
  const logoOpacity = useRef(new Animated.Value(0)).current;
  // Slogan opacity: 0 → 1 (staggered after logo)
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  // Divider width: 0 → 48 (staggered)
  const dividerWidth = useRef(new Animated.Value(0)).current;
  // CTA opacity: 0 → 1
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  // Overlay exit: slides up + fades out on dismiss
  const overlayTranslateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const dismissIntro = () => {
    Animated.parallel([
      Animated.timing(overlayTranslateY, {
        toValue: -SCREEN_HEIGHT,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete());
  };

  useEffect(() => {
    // Sequence: hero scales up + logo fades in → divider expands → slogan fades in → CTA fades in
    Animated.sequence([
      // Phase 1: hero entrance (300ms)
      Animated.parallel([
        Animated.spring(heroScale, {
          toValue: 1.0,
          tension: 60,
          friction: 9,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
      // Phase 2: divider expands (250ms after logo)
      Animated.timing(dividerWidth, {
        toValue: 48,
        duration: 350,
        useNativeDriver: false, // width cannot use native driver
      }),
      // Phase 3: slogan fades in (400ms)
      Animated.timing(sloganOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      // Phase 4: CTA fades in (300ms)
      Animated.timing(ctaOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-advance after 2.2s
    const timer = setTimeout(dismissIntro, 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        introStyles.overlay,
        {
          transform: [{ translateY: overlayTranslateY }],
          opacity: overlayOpacity,
        },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Gradient background via layered Views — no external gradient dep needed */}
      <View style={introStyles.gradientTop} />
      <View style={introStyles.gradientMid} />
      <View style={introStyles.gradientBottom} />

      {/* Hero content */}
      <Animated.View
        style={[
          introStyles.heroContent,
          {
            transform: [{ scale: heroScale }],
            opacity: logoOpacity,
          },
        ]}
      >
        {/* Wordmark */}
        <Text style={introStyles.wordmark}>KaramStay</Text>

        {/* Animated hairline divider */}
        <Animated.View style={[introStyles.divider, { width: dividerWidth }]} />

        {/* Slogan */}
        <Animated.Text style={[introStyles.slogan, { opacity: sloganOpacity }]}>
          WHERE EVERY BED{'\n'}HAS ITS STORY
        </Animated.Text>
      </Animated.View>

      {/* Get Started CTA */}
      <Animated.View style={[introStyles.ctaContainer, { opacity: ctaOpacity }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={dismissIntro}
          style={introStyles.ctaButton}
        >
          <Text style={introStyles.ctaText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.9)" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const introStyles = StyleSheet.create({
  overlay: {
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Layered pseudo-gradient: rose-gold → peach → cream
  gradientTop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FF385C',
    opacity: 0.92,
  },
  gradientMid: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFCBA4',
    opacity: 0.55,
    top: '30%',
  },
  gradientBottom: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFF8F5',
    opacity: 0.35,
    top: '60%',
  },
  heroContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  wordmark: {
    fontSize: 46,
    fontWeight: '300',
    letterSpacing: 1.5,
    color: '#FFFFFF',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
  },
  slogan: {
    fontSize: 11,
    letterSpacing: 3.5,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
    textTransform: 'uppercase',
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 72,
    alignSelf: 'center',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctaText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

// ─── Login Screen ─────────────────────────────────────────────────────────────

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { colors, font, space, radius, shadows, isDark } = useTheme();
  const { login, requestOtp } = useAuth();

  // Controls whether intro overlay is visible
  const [showIntro, setShowIntro] = useState(true);

  // Mode: chooser, staff, tenant
  const [loginMode, setLoginMode] = useState<'chooser' | 'staff' | 'tenant'>('chooser');

  // Staff fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Tenant fields
  const [phone, setPhone] = useState('');

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Form card slides up after intro exits
  const formSlideAnim = useRef(new Animated.Value(30)).current;
  const formOpacityAnim = useRef(new Animated.Value(0)).current;

  const handleIntroComplete = () => {
    setShowIntro(false);
    // Micro entrance for the login form
    Animated.parallel([
      Animated.timing(formSlideAnim, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(formOpacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // ── Original auth handlers — 100% unchanged ────────────────────────────────
  const handleStaffSubmit = async () => {
    const newErrors: { [key: string]: string } = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email address';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      showToast('Logged in successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Login failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTenantRequestOtp = async () => {
    const newErrors: { [key: string]: string } = {};
    if (!phone) newErrors.phone = 'Phone number is required';
    else if (phone.length < 8) newErrors.phone = 'Phone number is too short';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await requestOtp(phone.trim());
      navigation.navigate('Otp', { phone: phone.trim() });
    } catch (err: any) {
      showToast(err.message || 'Request failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  // ── End original auth handlers ─────────────────────────────────────────────

  const elevatedCard: object = {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    // Elevated shadow matching Airbnb design tokens
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.25 : 0.08,
    shadowRadius: 16,
    elevation: 6,
  };

  const activePortalShadow = isDark
    ? { ...shadows.sm, shadowColor: '#000000', shadowOpacity: 0.15 }
    : shadows.sm;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ── Animated Intro Overlay ─────────────────────────────────────────── */}
      {showIntro && <LandingIntro onComplete={handleIntroComplete} />}

      {/* ── Login Form (animates in after intro exits) ─────────────────────── */}
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <ResponsiveContainer maxWidth={500}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Toast
                message={toastMsg}
                visible={toastVisible}
                type={toastType}
                onDismiss={() => setToastVisible(false)}
              />

              <Animated.View
                style={{
                  transform: [{ translateY: formSlideAnim }],
                  opacity: formOpacityAnim,
                }}
              >
                {/* Logo / Header */}
                <View style={styles.header}>
                  {/* Elevated icon badge */}
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: colors.primary + '15',
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.2,
                        shadowRadius: 12,
                        elevation: 4,
                      },
                    ]}
                  >
                    <Ionicons name="home" size={40} color={colors.primary} />
                  </View>
                  <Text style={[styles.title, { color: colors.text, fontSize: font.h1.fontSize }]}>
                    KaramStay
                  </Text>
                  <Text style={[styles.sloganSmall, { color: colors.primary }]}>
                    WHERE EVERY BED HAS ITS STORY
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize }]}>
                    Enterprise rental management platform
                  </Text>
                </View>

                {/* Chooser Screen */}
                {loginMode === 'chooser' ? (
                  <Card style={[styles.cardContainer, elevatedCard, { borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
                      Welcome back
                    </Text>
                    <Text style={[styles.cardDesc, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
                      Choose your login portal to continue
                    </Text>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[
                        styles.portalButton,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderRadius: radius.md,
                          ...activePortalShadow,
                        },
                      ]}
                      onPress={() => setLoginMode('staff')}
                    >
                      <View style={[styles.portalIconWrap, { backgroundColor: colors.primary + '15' }]}>
                        <Ionicons name="people" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.portalTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                          Staff Portal
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                          Owner · Manager · Accountant
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[
                        styles.portalButton,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderRadius: radius.md,
                          ...activePortalShadow,
                          marginBottom: 0,
                        },
                      ]}
                      onPress={() => setLoginMode('tenant')}
                    >
                      <View style={[styles.portalIconWrap, { backgroundColor: colors.primary + '15' }]}>
                        <Ionicons name="person" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.portalTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
                          Tenant Portal
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                          Rent · Invoices · Complaints
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </Card>
                ) : null}

                {/* Staff Login */}
                {loginMode === 'staff' ? (
                  <Card style={[styles.cardContainer, elevatedCard, { borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}
                      onPress={() => setLoginMode('chooser')}
                    >
                      <Ionicons name="arrow-back" size={20} color={colors.primary} />
                      <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>
                        Back
                      </Text>
                    </TouchableOpacity>

                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
                      Staff Login
                    </Text>
                    <Text
                      style={[
                        styles.cardDesc,
                        { color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.lg },
                      ]}
                    >
                      Enter email & password to access your dashboard
                    </Text>

                    <Input
                      label="Email Address"
                      value={email}
                      onChangeText={setEmail}
                      placeholder="email@example.com"
                      keyboardType="email-address"
                      error={errors.email}
                    />

                    <Input
                      label="Password"
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      secureTextEntry
                      error={errors.password}
                    />

                    <Button
                      label="Login"
                      onPress={handleStaffSubmit}
                      loading={isLoading}
                      style={{ marginTop: space.sm }}
                    />
                  </Card>
                ) : null}

                {/* Tenant OTP Login */}
                {loginMode === 'tenant' ? (
                  <Card style={[styles.cardContainer, elevatedCard, { borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}
                      onPress={() => setLoginMode('chooser')}
                    >
                      <Ionicons name="arrow-back" size={20} color={colors.primary} />
                      <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>
                        Back
                      </Text>
                    </TouchableOpacity>

                    <Text style={[styles.cardTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
                      Tenant Login
                    </Text>
                    <Text
                      style={[
                        styles.cardDesc,
                        { color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.lg },
                      ]}
                    >
                      Enter your registered phone number to receive a secure OTP
                    </Text>

                    <Input
                      label="Phone Number"
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+91 XXXXX XXXXX"
                      keyboardType="phone-pad"
                      error={errors.phone}
                    />

                    <Button
                      label="Request OTP"
                      onPress={handleTenantRequestOtp}
                      loading={isLoading}
                      style={{ marginTop: space.sm }}
                    />
                  </Card>
                ) : null}
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </ResponsiveContainer>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 6,
  },
  // Persistent micro-slogan under the wordmark (visible after intro exits)
  sloganSmall: {
    fontSize: 9,
    letterSpacing: 2.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
    opacity: 0.8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  cardContainer: {
    // base; elevated card overrides applied inline
  },
  cardTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardDesc: {
    marginBottom: 20,
  },
  portalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  portalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  portalTitle: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
});
