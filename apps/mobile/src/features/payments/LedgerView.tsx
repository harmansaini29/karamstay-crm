import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface LedgerEntry {
  id: number;
  tenancy_id: number;
  payment_id: number | null;
  entry_type: string;
  direction: 'debit' | 'credit';
  amount: number;
  occurred_on: string;
  description: string;
}

export const LedgerView: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { tenancyId } = route.params;
  const { colors, font, space } = useTheme();

  const {
    data: ledger = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', tenancyId],
    queryFn: async () => {
      const res = await apiClient.get(`/ledger?tenancy_id=${tenancyId}`);
      return res.data;
    },
  });

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  // Sort chronologically by occurred_on then ID
  const sortedLedger = [...ledger].sort((a, b) => {
    const dateCompare = a.occurred_on.localeCompare(b.occurred_on);
    return dateCompare !== 0 ? dateCompare : a.id - b.id;
  });

  // Calculate running balance: debit increases dues, credit decreases dues
  let currentBalance = 0;
  const ledgerWithBalance = sortedLedger.map((entry) => {
    const amt = Number(entry.amount);
    if (entry.direction === 'debit') {
      currentBalance += amt;
    } else {
      currentBalance -= amt;
    }
    return {
      ...entry,
      runningBalance: currentBalance,
    };
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderLedgerItem = ({ item }: { item: any }) => {
    const isDebit = item.direction === 'debit';
    return (
      <Card style={[styles.entryCard, { borderColor: colors.border, borderLeftColor: isDebit ? '#EF4444' : '#10B981' }]}>
        <View style={styles.entryRow}>
          <View style={{ flex: 1, marginRight: space.sm }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              {item.description}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              Date: {item.occurred_on} · Type: {item.entry_type.toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={{
                color: isDebit ? '#EF4444' : '#10B981',
                fontWeight: 'bold',
                fontSize: font.bodyStrong.fontSize,
                marginBottom: 4,
              }}
            >
              {isDebit ? '+' : '-'} {formatCurrency(item.amount)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              Bal: {formatCurrency(item.runningBalance)}
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Ledger History
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={ledgerWithBalance}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderLedgerItem}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', padding: space.xl }}>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>No ledger entries found</Text>
          </Card>
        }
        refreshing={isLoading}
        onRefresh={refetch}
      />
    
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
  entryCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
