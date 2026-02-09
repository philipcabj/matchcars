import { Timestamp } from "firebase/firestore";

export function safeDate(date: any): Date | null {
  if (!date) return null;
  
  // If it's already a Date object
  if (date instanceof Date) {
      // Check if it's valid
      if (isNaN(date.getTime())) return null;
      return date;
  }

  // If it's a Firestore Timestamp (has toDate)
  if (date.toDate && typeof date.toDate === 'function') {
    return date.toDate();
  }
  
  // If it has seconds/nanoseconds (Timestamp-like object from JSON)
  if (typeof date === 'object' && 'seconds' in date) {
      return new Date(date.seconds * 1000);
  }

  // If it's a number (milliseconds)
  if (typeof date === 'number') {
    return new Date(date);
  }

  // If it's a string
  if (typeof date === 'string') {
    // Try standard parsing
    let d = new Date(date);
    if (!isNaN(d.getTime())) return d;
    
    // Fix Safari issue with space instead of T in ISO strings
    // "2024-02-09 10:00:00" -> "2024-02-09T10:00:00"
    if (date.includes(' ')) {
        const fixed = date.replace(' ', 'T');
        d = new Date(fixed);
        if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

export function formatTimeAgo(dateInput: any) {
    const date = safeDate(dateInput);
    if (!date) return "";

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Future dates protection
    if (diff < 0) return "Hoy";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 24) return "Hoy";
    if (days === 1) return "Ayer";
    if (days < 30) return `Hace ${days} días`;
    if (days < 60) return "Hace 1 mes";
    if (days < 365) return `Hace ${Math.floor(days / 30)} meses`;
    return `Hace ${Math.floor(days / 365)} año${Math.floor(days / 365) > 1 ? 's' : ''}`;
}
