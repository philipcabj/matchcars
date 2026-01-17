import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

interface SelectionModalProps {
  visible: boolean;
  title: string;
  options: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
  value?: string;
  searchable?: boolean;
  placeholder?: string;
  variant?: "modal" | "inline";
}

export function SelectionModal({
  visible,
  title,
  options,
  onSelect,
  onClose,
  value,
  searchable = true,
  placeholder = "Buscar...",
  variant = "modal",
}: SelectionModalProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    if (!query) return options;
    return options.filter((opt) =>
      opt.toLowerCase().includes(query.toLowerCase())
    );
  }, [options, query]);

  if (!visible && variant === "modal") return null;

  const Content = () => (
    <View style={{ flex: 1, backgroundColor: variant === "inline" ? "transparent" : theme.card, borderRadius: variant === "modal" ? 16 : 0, overflow: "hidden" }}>
      {variant === "modal" && (
        <View style={[styles.header, { borderBottomColor: theme.badgeBorder }]}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      )}

      {searchable && (
        <View style={[styles.searchContainer, variant === "inline" && { paddingHorizontal: 0, paddingTop: 0 }]}>
          <View style={[
            styles.searchBox, 
            { 
              backgroundColor: theme.inputBackground,
              borderColor: theme.likeBoxBackground 
            }
          ]}>
            <Ionicons
              name="search"
              size={20}
              color={theme.textMuted}
              style={styles.searchIcon}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={theme.textMuted}
              style={[styles.searchInput, { color: theme.inputText }]}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery("")}
                style={styles.clearButton}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {filteredOptions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No se encontraron resultados
          </Text>
        </View>
      ) : variant === "inline" ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 250 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          nestedScrollEnabled={true}
        >
          {filteredOptions.map((item) => {
            const isSelected = item === value;
            return (
              <TouchableOpacity
                 key={item}
                 onPress={() => {
                   onSelect(item);
                   setQuery("");
                   onClose();
                 }}
                 style={[
                  styles.optionItem,
                  {
                    borderBottomColor: theme.likeBoxBackground,
                    backgroundColor: isSelected
                      ? theme.inputBackground
                      : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: isSelected ? theme.accent : theme.text,
                      fontWeight: isSelected ? "700" : "400",
                    },
                  ]}
                >
                  {item}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.accent}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredOptions}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => {
            const isSelected = item === value;
            return (
              <TouchableOpacity
                onPress={() => {
                  onSelect(item);
                  setQuery("");
                  onClose();
                }}
                style={[
                  styles.optionItem,
                  {
                    borderBottomColor: theme.likeBoxBackground,
                    backgroundColor: isSelected
                      ? theme.inputBackground
                      : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: isSelected ? theme.accent : theme.text,
                      fontWeight: isSelected ? "700" : "400",
                    },
                  ]}
                >
                  {item}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.accent}
                  />
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );

  if (variant === "inline") {
    if (!visible) return null; // Or keep it visible if inline logic differs, but user code toggles visibility.
    return (
      <View style={{ marginTop: 8, borderWidth: 1, borderColor: theme.likeBoxBackground, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.card }}>
        <Content />
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.badgeBorder }]}>
            <Content />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    maxHeight: "80%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  clearButton: {
    padding: 4,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
  },
});
