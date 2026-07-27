import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface StaticDocProps {
  navigation: any;
}

export const PrivacyPolicyScreen: React.FC<StaticDocProps> = ({ navigation }) => {
  const { colors, font, space } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Privacy Policy
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
          1. Personal Data We Collect
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          We collect personal data that you provide directly to us when creating an account, checking in to a unit, or using our services. This includes your name, email address, phone number, date of birth, occupation, emergency contact details, and any document metadata or copies uploaded to the Legal Vault (e.g. government IDs, signed lease contracts).
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          2. Purpose of Collection and Processing
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          In accordance with the Digital Personal Data Protection (DPDP) Act, 2023, your personal data is collected and processed only for legitimate activities related to managing your tenancy contract. This includes generating monthly rent invoices, processing payments, facilitating maintenance ticket resolutions, sending relevant notices, and maintaining required financial ledgers.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          3. Granular Notification Consent
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          You may choose to receive operational alerts (such as payment receipts, reminder alerts, and general notices) via WhatsApp or Push Notifications. Consent for these communication channels can be individually managed and withdrawn at any time through your Profile Settings.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          4. Data Subject Rights
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          Under the DPDP Act, 2023, you have the right to access, rectify, or request erasure of your personal data. You may submit requests to inspect a copy of your stored records or request deletion of your account (subject to statutory audit and legal ledger retention requirements). Please refer to the "Privacy & Data" dashboard under your Profile.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          5. Grievance Redressal
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.xl }]}>
          If you have any questions, concerns, or complaints regarding how your personal data is handled, please contact our designated Grievance Officer whose details are listed under the Support card in your profile settings.
        </Text>
      </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

export const TermsOfServiceScreen: React.FC<StaticDocProps> = ({ navigation }) => {
  const { colors, font, space } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Terms of Service
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize }]}>
          1. Agreement to Terms
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          By accessing and logging into the KaramStay mobile application, you agree to comply with and be bound by these Terms of Service. These terms govern the operational interaction between tenants, managers, accountants, and the property owner.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          2. Tenancy and Billing
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          All tenancy relationships, rent parameters, security deposits, and billing cycles are defined in your signed rental agreement. Monthly rent invoices are generated on your designated billing day and are due per terms. Late fees may apply automatically if invoices are unpaid beyond the grace period.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          3. Direct UPI Payments (UTR Rules)
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          Rent and dues must be paid directly using the UPI intent deep links provided in the app. Upon completing the transfer in your third-party payment app (GPay, PhonePe, Paytm, etc.), you are required to submit the correct 12-digit UTR (Unique Transaction Reference) number immediately. Invoices are only marked "paid" in the ledger after manual review and verification of the UTR. Fraudulent or mismatching UTR entries will result in immediate payment rejection and penalty.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          4. Maintenance Tickets
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          Tenants may submit maintenance tickets for plumbing, electrical, or structural issues. Managers are assigned to review and transition tickets. Repair costs resulting from tenant-inflicted damages will be billed separately and logged as outstanding ledger dues.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginTop: space.md }]}>
          5. Account Termination
        </Text>
        <Text style={[styles.bodyText, { color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.xl }]}>
          Account deletion requests submitted via the Privacy dashboard will be reviewed manually. Deletion cannot be finalized if there are outstanding financial balances or active contract periods that require record preservation under state tax or property laws.
        </Text>
      </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 6,
  },
  bodyText: {
    lineHeight: 18,
    marginBottom: 16,
  },
});
