// app/config/theme.ts
export interface Theme {
  background: string;
  card: string;
  text: string;
  secondaryText: string;
  accent: string;
  primary: string;
  buttonBackground: string;
  buttonText: string;
  inputBackground: string;
  inputText: string;
  headerBackground: string;
  tabBackground: string;
  gradient: [string, string];

  cardShadow: string;
  likeBoxBackground: string;
  textLight: string;
  textMuted: string;
  likeBox: string;
  title: string;
  price: string;
  favoritedText: string;
  favoriteButton: string;
  favoritedCardBackground: string;
  favoritedPrice: string;
  favoriteButtonDefault: string;
  removeButton: string;
  badgeBackground: string;
  badgeBorder: string;
  subtext: string;
  error: string;
  input: string;
  statusBarStyle: "light-content" | "dark-content";
}

export const darkTheme: Theme = {
  background: "#0E1117",
  card: "#151923",
  text: "#F9FAFB",
  secondaryText: "#A5B1C2",
  accent: "#F97316",
  primary: "#2563EB",
  buttonBackground: "#F97316",
  buttonText: "#111827",
  inputBackground: "#111827",
  inputText: "#F9FAFB",
  headerBackground: "#0E1117",
  tabBackground: "#050816",
  gradient: ["#050816", "#111827"],

  cardShadow: "#000000",
  likeBoxBackground: "#111827",
  textLight: "#E5E7EB",
  textMuted: "#6B7280",
  likeBox: "#1F2933",
  title: "#F9FAFB",
  price: "#FACC15",
  favoritedText: "#F9FAFB",
  favoriteButton: "#F97316",
  favoritedCardBackground: "#1E293B",
  favoritedPrice: "#FACC15",
  favoriteButtonDefault: "#4B5563",
  removeButton: "#EF4444",
  badgeBackground: "#1F2933",
  badgeBorder: "#4B5563",
  subtext: "#9CA3AF",
  error: "#F87171",
  input: "#111827",
  statusBarStyle: "light-content",
};

export const lightTheme: Theme = {
  background: "#F3F4F6",
  card: "#FFFFFF",
  text: "#111827",
  secondaryText: "#4B5563",
  accent: "#F97316",
  primary: "#2563EB",
  buttonBackground: "#F97316",
  buttonText: "#111827",
  inputBackground: "#E5E7EB",
  inputText: "#111827",
  headerBackground: "#E5E7EB",
  tabBackground: "#E5E7EB",
  gradient: ["#F9FAFB", "#E5E7EB"],

  cardShadow: "#000000",
  likeBoxBackground: "#E5E7EB",
  textLight: "#6B7280",
  textMuted: "#9CA3AF",
  likeBox: "#D1D5DB",
  title: "#111827",
  price: "#16A34A",
  favoritedText: "#111827",
  favoriteButton: "#F97316",
  favoritedCardBackground: "#FEF3C7",
  favoritedPrice: "#16A34A",
  favoriteButtonDefault: "#6B7280",
  removeButton: "#DC2626",
  badgeBackground: "#E5E7EB",
  badgeBorder: "#9CA3AF",
  subtext: "#6B7280",
  error: "#B91C1C",
  input: "#FFFFFF",
  statusBarStyle: "dark-content",
};
