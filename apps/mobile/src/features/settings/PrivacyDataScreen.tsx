import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';

export const PrivacyDataScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();

  const [requestingExport, setRequestingExport] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);

  // Fetch settings for grievance officer info
  const { data: settings = {} } = useQuery<any>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiClient.get('/settings');
      return res.data;
    },
  });

  const handleRequestExport = async () => {
    setRequestingExport(true);
    try {
      await apiClient.post('/users/me/data-export-request');
      Alert.alert(
        'Request Submitted',
        'Your request for a copy of your personal data has been submitted. The owner/manager will compile and deliver it to your registered contact.'
      );
    } catch (err: any) {
      Alert.alert('Request Failed', parseApiError(err).message || 'Unable to submit request.');
    } finally {
      setRequestingExport(false);
    }
  };

  const handleRequestDeletion = async () => {
    Alert.alert(
      'Confirm Deletion Request',
      'Are you sure you want to request data and account deletion? This request will be audited. Action cannot be finalized if you have active leases or outstanding dues.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Deletion',
          style: 'destructive',
          onPress: async () => {
            setRequestingDeletion(true);
            try {
              await apiClient.post('/users/me/deletion-request');
              Alert.alert(
                'Deletion Request Logged',
                'Your deletion request has been submitted for review. An administrator will verify ledger balances and active contract states before processing.'
              );
            } catch (err: any) {
              Alert.alert('Request Failed', parseApiError(err).message || 'Unable to submit request.');
            } finally {
              setRequestingDeletion(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Privacy & Data Rights
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <Text style={[styles.descText, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          In accordance with the Digital Personal Data Protection (DPDP) Act, 2023, you have the right to request a summary of the data we process, retrieve a portable copy of your records, or request deletion where processing is no longer required.
        </Text>

        {/* Data summary card */}
        <Card style={[styles.dataCard, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.sm }}>
            Your Data Categories in Storage
          </Text>

          <View style={styles.dataRow}>
            <Ionicons name="person-outline" size={16} color={colors.primary} style={{ marginRight: space.sm }} />
            <Text style={{ color: colors.text, fontSize: font.caption.fontSize }}>
              Identity & Contact (Name, Phone, Email, DOB)
            </Text>
          </View>

          <View style={styles.dataRow}>
            <Ionicons name="briefcase-outline" size={16} color={colors.primary} style={{ marginRight: space.sm }} />
            <Text style={{ color: colors.text, fontSize: font.caption.fontSize }}>
              Occupation details & Emergency contacts
            </Text>
          </View>

          <View style={styles.dataRow}>
            <Ionicons name="document-text-outline" size={16} color={colors.primary} style={{ marginRight: space.sm }} />
            <Text style={{ color: colors.text, fontSize: font.caption.fontSize }}>
              Legal Agreements & Verification Proofs
            </Text>
          </View>

          <View style={styles.dataRow}>
            <Ionicons name="cash-outline" size={16} color={colors.primary} style={{ marginRight: space.sm }} />
            <Text style={{ color: colors.text, fontSize: font.caption.fontSize }}>
              Financial Ledgers, Invoices & UPI payment history
            </Text>
          </View>
        </Card>

        {/* Actions Card */}
        <Card style={[styles.dataCard, { borderColor: colors.border, padding: space.md }]}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.md }}>
            Exercise Your Rights
          </Text>

          <Button
            label="Request Portable Copy of Data"
            onPress={handleRequestExport}
            loading={requestingExport}
            variant="secondary"
            style={{ marginBottom: space.md }}
          />

          <Button
            label="Request Account & Data Deletion"
            onPress={handleRequestDeletion}
            loading={requestingDeletion}
            variant="destructive"
          />
        </Card>

        {/* Grievance officer Support card */}
        <Card style={[styles.dataCard, { borderColor: colors.border, padding: space.md }]}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginBottom: space.sm }}>
            Grievance Redressal Support
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, lineHeight: 18, marginBottom: space.md }}>
            If you have issues concerning data processing or want to raise a complaint, please contact our designated Grievance Officer:
          </Text>

          <View style={styles.grievanceInfo}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
              {settings.grievance_officer_name || 'Karam Singh'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              Email: {settings.grievance_officer_email || 'grievance@karamstay.com'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
              Phone: {settings.grievance_officer_phone || '+91 99999 11111'}
            </Text>
          </View>
        </Card>
      </ScrollView>
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
  descText: {
    lineHeight: 18,
    marginBottom: 20,
  },
  dataCard: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  grievanceInfo: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
});
