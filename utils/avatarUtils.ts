const AVATAR_COLORS = [
  "#FF6B6B",
  "#FFB347",
  "#F9D66B",
  "#4ECDC4",
  "#1B9CFC",
  "#A66DD4",
  "#FF7F50",
];

export function getAvatarColorFromEmail(email: string): string {
  if (!email) return AVATAR_COLORS[0];
  let sum = 0;
  for (let i = 0; i < email.length; i++) {
    sum += email.charCodeAt(i);
  }
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
