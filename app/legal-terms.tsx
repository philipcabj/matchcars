import { Header } from "@/components/Header";
import { useTheme } from "@/contexts/ThemeContext";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TermsScreen() {
  const { theme } = useTheme();

  const Section = ({ title, content }: { title: string; content: string }) => (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
        {title}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 22 }}>
        {content}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Header title="Términos de Uso" showBack />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: theme.textMuted, fontSize: 14, marginBottom: 24 }}>
          Última actualización: {new Date().toLocaleDateString()}
        </Text>

        <Section 
          title="1. Aceptación de los Términos" 
          content="Al descargar o utilizar la aplicación Matchcars, estos términos se aplicarán automáticamente a ti; por lo tanto, debes asegurarte de leerlos atentamente antes de usar la aplicación." 
        />

        <Section 
          title="2. Descripción del Servicio" 
          content="Matchcars es una plataforma que facilita la conexión entre compradores y vendedores de vehículos. Matchcars no es propietario de los vehículos ofrecidos, no los posee ni los vende directamente." 
        />

        <Section 
          title="3. Cuentas de Usuario" 
          content="Eres responsable de mantener la confidencialidad de tu cuenta y contraseña y de restringir el acceso a tu dispositivo. Aceptas la responsabilidad de todas las actividades que ocurran bajo tu cuenta o contraseña." 
        />

        <Section 
          title="4. Suscripciones y Pagos" 
          content="Matchcars ofrece planes de suscripción (PRO, PRO Plus, PRO Dealer) que otorgan beneficios adicionales. El pago se cargará a tu cuenta de Apple ID en la confirmación de la compra. La suscripción se renueva automáticamente a menos que se cancele al menos 24 horas antes del final del período actual. Tu cuenta será cargada por la renovación dentro de las 24 horas anteriores al final del período actual. Puedes gestionar y cancelar tus suscripciones yendo a la configuración de tu cuenta de App Store después de la compra." 
        />

        <Section 
          title="5. Conducta del Usuario" 
          content="Te comprometes a utilizar la aplicación solo para fines legales y de una manera que no infrinja los derechos de, restrinja o inhiba el uso y disfrute de la aplicación por parte de cualquier tercero." 
        />

        <Section 
          title="6. Limitación de Responsabilidad" 
          content="En ningún caso Matchcars, ni sus directores, empleados, socios, agentes, proveedores o afiliados, serán responsables de cualquier daño indirecto, incidental, especial, consecuente o punitivo, incluyendo, sin limitación, pérdida de beneficios, datos, uso, buena voluntad, u otras pérdidas intangibles." 
        />

        <Section 
          title="7. Cambios en los Términos" 
          content="Nos reservamos el derecho, a nuestra sola discreción, de modificar o reemplazar estos Términos en cualquier momento. Si una revisión es material, intentaremos proporcionar un aviso de al menos 30 días antes de que entren en vigor los nuevos términos." 
        />
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
