import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface AlertOption {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  type?: "error" | "success" | "info" | "warning";
  showCancel?: boolean;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  options?: AlertOption[];
}

export function CustomAlert({ visible, title, message, onClose, type = "error", showCancel = false, onCancel, confirmText = "Entendido", cancelText = "Cancelar", options }: CustomAlertProps) {
  const { theme } = useTheme();

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.card }]}>
          <View style={[styles.iconContainer, { backgroundColor: type === "error" ? "#FF6B6B20" : type === "success" ? "#4ECDC420" : "#1B9CFC20" }]}>
             <Ionicons 
                name={type === "error" ? "alert-circle" : type === "success" ? "checkmark-circle" : "information-circle"} 
                size={32} 
                color={type === "error" ? "#FF6B6B" : type === "success" ? "#4ECDC4" : "#1B9CFC"} 
             />
          </View>
          <Text style={[styles.title, { color: theme.title }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
          
          {options ? (
            <View style={{ flexDirection: "column", gap: 8, width: "100%" }}>
              {options.map((option, index) => (
                <TouchableOpacity 
                  key={index} 
                  onPress={() => {
                    if (option.onPress) option.onPress();
                    // We don't automatically close here because the parent usually handles it, 
                    // but for Alert replacement it might be expected. 
                    // However, our usage pattern in profile.tsx will be to pass a wrapper that closes it.
                  }} 
                  style={[
                    styles.button, 
                    { 
                      backgroundColor: option.style === "cancel" ? theme.badgeBackground : theme.buttonBackground,
                      opacity: option.style === "cancel" ? 0.8 : 1
                    }
                  ]}
                >
                  <Text style={[
                    styles.buttonText, 
                    { 
                      color: option.style === "cancel" ? theme.text : theme.buttonText 
                    }
                  ]}>
                    {option.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              {showCancel && (
                <TouchableOpacity onPress={onCancel || onClose} style={[styles.button, { backgroundColor: theme.badgeBackground, flex: 1 }]}>
                  <Text style={[styles.buttonText, { color: theme.text }]}>{cancelText}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={[styles.button, { backgroundColor: theme.buttonBackground, flex: 1 }]}>
                <Text style={[styles.buttonText, { color: theme.buttonText }]}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
