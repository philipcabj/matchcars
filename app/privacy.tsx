import { Header } from "@/components/Header";
import { useTheme } from "@/contexts/ThemeContext";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PrivacyScreen() {
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
      <Header title="Política de Privacidad" showBack />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: theme.textMuted, fontSize: 14, marginBottom: 24 }}>
          Última actualización: {new Date().toLocaleDateString()}
        </Text>

        <Section 
          title="1. Introducción" 
          content="Matchcars respeta tu privacidad y se compromete a proteger tus datos personales. Esta política de privacidad te informará sobre cómo cuidamos tus datos cuando visitas nuestra aplicación móvil y te informará sobre tus derechos de privacidad y cómo la ley te protege." 
        />

        <Section 
          title="2. Información que recopilamos" 
          content="Podemos recopilar, usar, almacenar y transferir diferentes tipos de datos personales sobre ti, que incluyen: Datos de Identidad (nombre, apellido), Datos de Contacto (email, teléfono), Datos Técnicos (dirección IP, tipo de dispositivo), y Datos de Perfil (intereses, preferencias, historial de compras y vehículos publicados)." 
        />

        <Section 
          title="3. Cómo usamos tu información" 
          content="Solo usaremos tus datos personales cuando la ley nos lo permita. Más comúnmente, usaremos tus datos personales en las siguientes circunstancias: Para registrarte como nuevo cliente, para procesar y entregar tu pedido (incluyendo gestionar pagos, tarifas y cargos), y para gestionar nuestra relación contigo." 
        />

        <Section 
          title="4. Seguridad de los datos" 
          content="Hemos implementado medidas de seguridad apropiadas para evitar que tus datos personales se pierdan accidentalmente, se usen o se acceda a ellos de manera no autorizada, se alteren o se divulguen." 
        />

        <Section 
          title="5. Retención de datos" 
          content="Solo conservaremos tus datos personales durante el tiempo que sea necesario para cumplir con los fines para los que los recopilamos, incluso para cumplir con cualquier requisito legal, contable o de informes." 
        />

        <Section 
          title="6. Eliminación de cuenta" 
          content="Puedes solicitar la eliminación de tu cuenta y todos los datos asociados en cualquier momento desde la configuración de tu perfil en la aplicación o contactándonos directamente." 
        />

        <Section 
          title="7. Contacto" 
          content="Si tienes alguna pregunta sobre esta política de privacidad o nuestras prácticas de privacidad, contáctanos a través de nuestro soporte en la aplicación." 
        />
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
