import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface Property {
  id: number;
  name: string;
}

export const BroadcastNotice: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space } = useTheme();

  // Form fields
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  // UI States
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Query properties
  const { data: properties = [], isLoading: isPropsLoading } = useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await apiClient.get('/properties');
      return res.data;
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/notices', payload);
      return res.data;
    },
    onSuccess: (data) => {
      Alert.alert(
        'Notice Broadcasted',
        `Announcement sent successfully! Total recipients notified: ${data.recipients_notified}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setTitle('');
              setMessage('');
              setSelectedPropertyId('');
              navigation.goBack();
            },
          },
        ]
      );
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Broadcast failed', 'error');
    },
  });

  const handleSubmit = () => {
    const newErrors: { [key: string]: string } = {};
    if (!title || title.length < 2 || title.length > 160) {
      newErrors.title = 'Title must be between 2 and 160 characters';
    }
    if (!message || message.length < 2 || message.length > 1000) {
      newErrors.message = 'Message must be between 2 and 1000 characters';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const payload = {
      title: title.trim(),
      message: message.trim(),
      property_id: selectedPropertyId ? parseInt(selectedPropertyId) : null,
    };

    broadcastMutation.mutate(payload);
  };

  const propertyOptions = [
    { label: 'All Portfolios (Global Notice)', value: '' },
    ...properties.map((p) => ({
      label: p.name,
      value: String(p.id),
    })),
  ];

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      try {
        navigation.navigate('MoreHome');
      } catch (_) {
        navigation.navigate('Dashboard');
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />
      
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />

          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Broadcast Notice
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Input
          label="Scope to Property"
          value={selectedPropertyId}
          onChangeText={setSelectedPropertyId}
          type="select"
          options={propertyOptions}
          placeholder={isPropsLoading ? 'Loading properties...' : 'Select property scope...'}
        />

        <Input
          label="Notice Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Water Line Maintenance Interruption"
          error={errors.title}
        />

        <Input
          label="Detailed Message"
          value={message}
          onChangeText={setMessage}
          placeholder="Write detailed announcements context here..."
          error={errors.message}
          style={{ height: 120 }}
        />

        <Button
          label="Broadcast Now"
          onPress={handleSubmit}
          loading={broadcastMutation.isPending}
          style={{ marginTop: space.md }}
        />
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
});
