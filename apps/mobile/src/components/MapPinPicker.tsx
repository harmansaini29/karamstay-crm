/**
 * MapPinPicker.tsx
 * Full-screen modal with an embedded Leaflet map (via react-native-webview).
 * User drags the pin to any location; on "Confirm Location" the component fires
 * onConfirm({ latitude, longitude }) and triggers Nominatim reverse-geocoding
 * to auto-populate address, city, state, and pincode in the caller.
 *
 * Dependencies: react-native-webview (expo-managed safe), expo-location (already installed).
 * Zero new native modules required beyond these.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { color as semanticColor } from '../theme/tokens';

export interface MapPinResult {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

interface MapPinPickerProps {
  visible: boolean;
  /** Initial center of the map. Defaults to Noida, India if not provided. */
  initialLatitude?: number;
  initialLongitude?: number;
  onConfirm: (result: MapPinResult) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Leaflet HTML template — self-contained single-page map with draggable pin.
// Uses the official Leaflet CDN (loads once, cached by WebView).
// Communicates via window.ReactNativeWebView.postMessage(JSON) →
//   { type: 'PIN_MOVED', lat, lng }
//   { type: 'CONFIRM', lat, lng }
// ---------------------------------------------------------------------------
const buildLeafletHtml = (lat: number, lng: number): string => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; }
  #map { width: 100vw; height: calc(100vh - 80px); }
  #controls {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 80px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    box-shadow: 0 -2px 12px rgba(0,0,0,0.08);
    z-index: 9999;
  }
  #coords {
    font-size: 12px;
    color: #6A6A6A;
    flex: 1;
  }
  #confirm-btn {
    background: #FF385C;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 24px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    min-width: 160px;
  }
  #confirm-btn:active { background: #E00B41; }
  .leaflet-container { font-family: -apple-system, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<div id="controls">
  <div id="coords">Drag the pin to set location</div>
  <button id="confirm-btn" onclick="confirmLocation()">Confirm Location</button>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var currentLat = ${lat};
  var currentLng = ${lng};

  var map = L.map('map', {
    center: [currentLat, currentLng],
    zoom: 15,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  // Custom Rausch-coloured marker
  var markerIcon = L.divIcon({
    html: '<div style="width:32px;height:32px;background:#FF385C;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.25);"></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    className: '',
  });

  var marker = L.marker([currentLat, currentLng], {
    draggable: true,
    icon: markerIcon,
  }).addTo(map);

  function updateCoords(lat, lng) {
    currentLat = lat;
    currentLng = lng;
    document.getElementById('coords').textContent =
      lat.toFixed(6) + ', ' + lng.toFixed(6);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PIN_MOVED', lat: lat, lng: lng
      }));
    }
  }

  marker.on('dragend', function(e) {
    var pos = e.target.getLatLng();
    updateCoords(pos.lat, pos.lng);
  });

  map.on('click', function(e) {
    marker.setLatLng(e.latlng);
    updateCoords(e.latlng.lat, e.latlng.lng);
    map.panTo(e.latlng);
  });

  function confirmLocation() {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'CONFIRM', lat: currentLat, lng: currentLng
      }));
    }
  }

  // Initialise display
  updateCoords(currentLat, currentLng);
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Nominatim reverse-geocoding (OpenStreetMap, free, no API key required)
// ---------------------------------------------------------------------------
const reverseGeocode = async (
  lat: number,
  lng: number
): Promise<{ address: string; city: string; state: string; pincode: string }> => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'KaramStayApp/1.0' },
    });
    const json = await res.json();
    const a = json.address || {};

    const road = [a.road, a.suburb, a.neighbourhood].filter(Boolean).join(', ');
    const city =
      a.city || a.town || a.village || a.county || '';
    const state = a.state || '';
    const pincode = a.postcode || '';
    const address = road || json.display_name?.split(',')[0] || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    return { address, city, state, pincode };
  } catch (_) {
    return {
      address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      city: '',
      state: '',
      pincode: '',
    };
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const MapPinPicker: React.FC<MapPinPickerProps> = ({
  visible,
  initialLatitude,
  initialLongitude,
  onConfirm,
  onCancel,
}) => {
  const { colors, font, space, radius } = useTheme();
  const webViewRef = useRef<WebView>(null);

  const [centerLat, setCenterLat] = useState<number>(initialLatitude ?? 28.6139);
  const [centerLng, setCenterLng] = useState<number>(initialLongitude ?? 77.2090);
  const [isLocating, setIsLocating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // When the modal opens, try to get device location for centering
  useEffect(() => {
    if (visible) {
      setMapLoaded(false);
      if (!initialLatitude || !initialLongitude) {
        acquireDeviceLocation();
      } else {
        setCenterLat(initialLatitude);
        setCenterLng(initialLongitude);
      }
    }
  }, [visible]);

  const acquireDeviceLocation = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCenterLat(loc.coords.latitude);
        setCenterLng(loc.coords.longitude);
      }
    } catch (_) {
      // Fall through to default Noida center
    } finally {
      setIsLocating(false);
    }
  };

  const handleWebViewMessage = async (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);

      if (payload.type === 'CONFIRM') {
        setIsGeocoding(true);
        const geo = await reverseGeocode(payload.lat, payload.lng);
        setIsGeocoding(false);
        onConfirm({
          latitude: payload.lat,
          longitude: payload.lng,
          ...geo,
        });
      }
      // PIN_MOVED events are informational; no action needed in RN
    } catch (_) {
      setIsGeocoding(false);
    }
  };

  const html = buildLeafletHtml(centerLat, centerLng);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View
          style={[
            pickerStyles.header,
            { backgroundColor: colors.bg, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onPress={onCancel}
            style={pickerStyles.cancelBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: font.h3.fontSize,
              fontWeight: '600',
              fontFamily: font.h3.fontFamily,
              color: colors.text,
            }}
          >
            Pick Location
          </Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Loading overlay while acquiring device location */}
        {isLocating && (
          <View style={pickerStyles.overlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, marginTop: space.sm, fontFamily: font.body.fontFamily }}>
              Getting your location…
            </Text>
          </View>
        )}

        {/* Geocoding overlay after confirm */}
        {isGeocoding && (
          <View style={pickerStyles.overlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, marginTop: space.sm, fontFamily: font.body.fontFamily }}>
              Fetching address…
            </Text>
          </View>
        )}

        {/* Leaflet WebView */}
        {!isLocating && (
          <WebView
            ref={webViewRef}
            style={{ flex: 1 }}
            source={{ html }}
            originWhitelist={['*']}
            onMessage={handleWebViewMessage}
            onLoad={() => setMapLoaded(true)}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={!mapLoaded}
            renderLoading={() => (
              <View style={[pickerStyles.overlay, { backgroundColor: colors.bg }]}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
            // Required for Leaflet tile loading on Android
            mixedContentMode={Platform.OS === 'android' ? 'always' : undefined}
          />
        )}

        {/* Hint bar */}
        {mapLoaded && !isGeocoding && !isLocating && (
          <View
            style={[
              pickerStyles.hintBar,
              { backgroundColor: colors.surfaceSoft, borderTopColor: colors.border },
            ]}
          >
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: font.caption.fontFamily, flex: 1 }}>
              Tap map or drag the pin to reposition. Press "Confirm Location" inside the map to save.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const pickerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cancelBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
});
