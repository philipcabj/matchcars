export function getAuthErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "El formato del email no es válido.";
    case "auth/user-disabled":
      return "El usuario ha sido deshabilitado.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "No existe una cuenta con este email o las credenciales son incorrectas.";
    case "auth/wrong-password":
      return "La contraseña es incorrecta.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta registrada con este email.";
    case "auth/weak-password":
      return "La contraseña es muy débil. Debe tener al menos 6 caracteres.";
    case "auth/missing-email":
      return "Por favor, ingresá un email.";
    case "auth/network-request-failed":
      return "Error de conexión. Verificá tu internet.";
    case "auth/too-many-requests":
      return "Demasiados intentos fallidos. Por favor, intentá más tarde.";
    case "auth/popup-closed-by-user":
      return "Se cerró la ventana de autenticación antes de terminar.";
    case "auth/cancelled-popup-request":
      return "Solo se puede abrir una ventana de autenticación a la vez.";
    default:
      if (code?.includes("auth/")) {
        return "Ocurrió un error de autenticación (" + code + ").";
      }
      return "Ocurrió un error inesperado. Por favor, intentá nuevamente.";
  }
}
