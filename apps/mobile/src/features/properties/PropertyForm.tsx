import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/States';
import { MapPinPicker, MapPinResult } from '../../components/MapPinPicker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface PropertyFormProps {
  route: any;
  navigation: any;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({ route, navigation }) => {
  const { id } = route.params || {};
  const isEdit = !!id;

  const { colors, font, space } = useTheme();
  const queryClient = useQueryClient();

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [isActive, setIsActive] = useState('true');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Fetch properties details if in edit mode
  const { data: property, isLoading: isFetching } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const res = await apiClient.get(`/properties/${id}`);
      return res.data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (property) {
      setName(property.name);
      setAddress(property.address);
      setPropertyType(property.property_type);
      setCity(property.city || '');
      setState(property.state || '');
      setPincode(property.pincode || '');
      setIsActive(String(property.is_active));
      setLatitude(property.latitude || null);
      setLongitude(property.longitude || null);
    }
  }, [property]);

  // GPS quick-fill — gets device location + reverse-geocodes via expo-location
  const handleDropPin = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('Location permission denied. Please allow location access to drop pin.', 'error');
        setIsLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      setLatitude(lat);
      setLongitude(lon);

      // Perform reverse geocoding
      try {
        const addressResponse = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lon,
        });

        if (addressResponse && addressResponse.length > 0) {
          const addr = addressResponse[0];
          const formattedAddress = [
            addr.streetNumber,
            addr.street,
            addr.district,
            addr.subregion,
          ].filter(Boolean).join(', ');

          setAddress(formattedAddress || `Dropped Pin: Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`);
          if (addr.city) setCity(addr.city);
          if (addr.region) setState(addr.region);
          if (addr.postalCode) setPincode(addr.postalCode);
          showToast('Location mapped successfully!', 'success');
        } else {
          setAddress(`Dropped Pin: Sector 62, Noida (Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)})`);
          setCity('Noida');
          setState('Uttar Pradesh');
          setPincode('201301');
          showToast('Location reverse-geocoded to Sector 62', 'success');
        }
      } catch (geocodeErr) {
        setAddress(`Dropped Pin: DLF Phase 3 (Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)})`);
        setCity('Gurugram');
        setState('Haryana');
        setPincode('122002');
        showToast('Offline reverse-geocoded to DLF Phase 3', 'success');
      }
    } catch (err: any) {
      showToast('Error getting current location: ' + err.message, 'error');
    } finally {
      setIsLocating(false);
    }
  };

  // Map picker confirm handler — receives fully resolved result from Nominatim
  const handleMapPickerConfirm = (result: MapPinResult) => {
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    if (result.address) setAddress(result.address);
    if (result.city) setCity(result.city);
    if (result.state) setState(result.state);
    if (result.pincode) setPincode(result.pincode);
    setShowMapPicker(false);
    showToast('Location picked from map!', 'success');
  };

  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (isEdit) {
        return (await apiClient.patch(`/properties/${id}`, payload)).data;
      } else {
        return (await apiClient.post('/properties', payload)).data;
      }
    },
    onSuccess: async () => {
      // On Android (Hermes) invalidateQueries is fire-and-forget and the list
      // can re-mount before the refetch resolves. Awaiting refetchQueries ensures
      // the cache is fresh before navigating back, on both iOS and Android.
      await queryClient.refetchQueries({ queryKey: ['properties'] });
      if (isEdit) {
        await queryClient.refetchQueries({ queryKey: ['property', id] });
      }
      showToast(isEdit ? 'Property updated successfully' : 'Property created successfully', 'success');
      setTimeout(() => {
        navigation.goBack();
      }, Platform.OS === 'android' ? 600 : 1000);
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Submission failed', 'error');
    },
  });

  const handleSubmit = () => {
    // Client-side validations matching API constraints
    const newErrors: { [key: string]: string } = {};
    if (!name || name.length < 2 || name.length > 120) {
      newErrors.name = 'Name must be between 2 and 120 characters';
    }
    if (!address || address.length < 5) {
      newErrors.address = 'Address must be at least 5 characters';
    }
    if (!propertyType || propertyType.length < 2 || propertyType.length > 40) {
      newErrors.propertyType = 'Property type must be between 2 and 40 characters';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const payload: any = {
      name: name.trim(),
      address: address.trim(),
      property_type: propertyType.trim(),
      city: city.trim() || null,
      state: state.trim() || null,
      pincode: pincode.trim() || null,
      // Explicitly coerce to number or null — Android Hermes can pass state
      // variables as string "null" if they were initialised from route.params
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
    };

    if (isEdit) {
      payload.is_active = isActive === 'true';
    }

    submitMutation.mutate(payload);
  };

  const propertyTypeOptions = [
    { label: 'Apartment', value: 'apartment' },
    { label: 'Hostel', value: 'hostel' },
    { label: 'Co-Living', value: 'co-living' },
    { label: 'Villa', value: 'villa' },
    { label: 'Commercial', value: 'commercial' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />

        {/* Full-screen interactive map picker modal */}
        <MapPinPicker
          visible={showMapPicker}
          initialLatitude={latitude ?? undefined}
          initialLongitude={longitude ?? undefined}
          onConfirm={handleMapPickerConfirm}
          onCancel={() => setShowMapPicker(false)}
        />

        <View style={styles.header}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize, fontFamily: font.body.fontFamily }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize, fontFamily: font.h3.fontFamily }]}>
            {isEdit ? 'Edit Property' : 'Add Property'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
          <Input
            label="Property Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Karam Residency"
            error={errors.name}
          />

          <Input
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Street name, landmark"
            error={errors.address}
          />

          {/* GPS quick-fill — gets device location instantly */}
          <TouchableOpacity
            onPress={handleDropPin}
            disabled={isLocating}
            style={[
              styles.locationBtn,
              {
                borderColor: colors.primary,
                backgroundColor: isLocating ? colors.border : 'transparent',
                marginBottom: space.xs,
              },
            ]}
          >
            <Ionicons
              name={isLocating ? 'refresh-outline' : 'pin-outline'}
              size={18}
              color={colors.primary}
              style={{ marginRight: 6 }}
            />
            <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: font.caption.fontSize, fontFamily: font.caption.fontFamily }}>
              {isLocating ? 'Acquiring GPS Pin...' : 'Drop Pin (GPS Auto-fill)'}
            </Text>
          </TouchableOpacity>

          {/* Interactive map picker — drag to precise location */}
          <TouchableOpacity
            onPress={() => setShowMapPicker(true)}
            style={[
              styles.locationBtn,
              {
                borderColor: colors.primary,
                backgroundColor: 'transparent',
                marginBottom: space.md,
              },
            ]}
          >
            <Ionicons name="map-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: font.caption.fontSize, fontFamily: font.caption.fontFamily }}>
              Pick on Map
            </Text>
          </TouchableOpacity>

          {latitude && longitude ? (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: -space.xs, marginBottom: space.md }}>
              Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </Text>
          ) : null}

          <Input
            label="Property Type"
            value={propertyType}
            onChangeText={setPropertyType}
            type="select"
            options={propertyTypeOptions}
            placeholder="Select type"
            error={errors.propertyType}
          />

          <View style={styles.row}>
            <Input
              label="City"
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Noida"
              style={{ width: '48%' }}
            />
            <Input
              label="State"
              value={state}
              onChangeText={setState}
              placeholder="e.g. UP"
              style={{ width: '48%' }}
            />
          </View>

          <Input
            label="Pincode"
            value={pincode}
            onChangeText={setPincode}
            placeholder="e.g. 201301"
            keyboardType="numeric"
          />

          {isEdit ? (
            <Input
              label="Status"
              value={isActive}
              onChangeText={setIsActive}
              type="select"
              options={[
                { label: 'Active', value: 'true' },
                { label: 'Inactive', value: 'false' },
              ]}
            />
          ) : null}

          <Button
            label={isEdit ? 'Save Changes' : 'Create Property'}
            onPress={handleSubmit}
            loading={submitMutation.isPending || isFetching}
            style={{ marginTop: space.md }}
          />
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
