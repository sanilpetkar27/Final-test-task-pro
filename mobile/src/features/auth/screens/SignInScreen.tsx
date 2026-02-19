import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, AppCard, AppScreen, AppTextInput } from '../../../components/ui';
import { useAuthStore } from '../../../state/authStore';
import { lumina, spacing, typography } from '../../../theme';

const isValidEmail = (value: string): boolean => /\S+@\S+\.\S+/.test(value);

export function SignInScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!isValidEmail(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    if (!password.trim()) {
      setError('Password is required.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
    } catch (signInError) {
      const message = String((signInError as Error)?.message || 'Unable to sign in.');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen>
      <View style={styles.root}>
        <AppCard style={styles.glassHeader}>
          <Text style={styles.brand}>TaskPro Mobile</Text>
          <Text style={styles.subtitle}>Secure workspace access for your team.</Text>
        </AppCard>

        <AppCard style={styles.formCard}>
          <Text style={styles.formTitle}>Sign In</Text>
          <AppTextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@company.com"
            value={email}
          />
          <AppTextInput
            autoCapitalize="none"
            autoComplete="password"
            label="Password"
            onChangeText={setPassword}
            placeholder="Enter password"
            secureTextEntry
            value={password}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AppButton
            fullWidth
            label={submitting ? 'Signing In...' : 'Sign In'}
            loading={submitting}
            onPress={() => void onSubmit()}
          />
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  glassHeader: {
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  brand: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  formCard: {
    gap: spacing.md,
  },
  formTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  error: {
    color: lumina.status.danger,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});

