// app/(tabs)/interesados.tsx
import { auth, db } from "@/lib/firebase"; // ajustá la ruta si es distinta
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  DocumentData,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface InterestedUser {
  uid: string;
  displayName: string;
  email: string;
}

export default function InteresadosScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [interestedUsers, setInterestedUsers] = useState<InterestedUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInterestedUsers = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setError("Debes iniciar sesión para ver tus interesados.");
          setLoading(false);
          return;
        }

        // 1) Traer MIS VEHÍCULOS (no "cars", sino "vehicles")
        const vehiclesRef = collection(db, "vehicles");
        const q = query(vehiclesRef, where("userId", "==", currentUser.uid));
        const vehiclesSnap = await getDocs(q);

        if (vehiclesSnap.empty) {
          setInterestedUsers([]);
          setLoading(false);
          return;
        }

        // 2) Juntar todos los userId que dieron like a mis vehículos
        const interestedUserIdsSet = new Set<string>();

        vehiclesSnap.forEach((docSnap) => {
          const data = docSnap.data() as DocumentData;

          // 👇 esperaremos que cada vehículo tenga un array likedBy: string[]
          const likedBy: string[] = data.likedBy || [];

          likedBy.forEach((uid) => {
            if (uid !== currentUser.uid) {
              interestedUserIdsSet.add(uid);
            }
          });
        });

        const interestedUserIds = Array.from(interestedUserIdsSet);

        if (interestedUserIds.length === 0) {
          setInterestedUsers([]);
          setLoading(false);
          return;
        }

        // 3) Traer info de usuarios desde "users"
        const usersRef = collection(db, "users");
        const resultUsers: InterestedUser[] = [];

        // Firestore limita los "in" a 10 elementos → lo hacemos en bloques
        const chunkSize = 10;
        for (let i = 0; i < interestedUserIds.length; i += chunkSize) {
          const chunk = interestedUserIds.slice(i, i + chunkSize);
          const usersQ = query(usersRef, where("uid", "in", chunk));
          const usersSnap = await getDocs(usersQ);

          usersSnap.forEach((userDoc) => {
            const uData = userDoc.data() as DocumentData;
            resultUsers.push({
              uid: uData.uid || userDoc.id,
              displayName: uData.displayName || uData.username || "Usuario",
              email: uData.email || "",
            });
          });
        }

        setInterestedUsers(resultUsers);
        setLoading(false);
      } catch (e: any) {
        console.error("Error obteniendo interesados:", e);
        setError("Ocurrió un error al cargar los interesados.");
        setLoading(false);
      }
    };

    fetchInterestedUsers();
  }, []);

const handleOpenUserCars = (userId: string) => {
  router.push(`/user-cars/${userId}` as any);
};

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.infoText}>Cargando interesados...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (interestedUsers.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>
          Todavía no hay usuarios interesados en tus vehículos.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header simple dentro del tab */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Interesados</Text>
      </View>

      <FlatList
        data={interestedUsers}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleOpenUserCars(item.uid)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.displayName
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.displayName}</Text>
              <Text style={styles.userEmail}>{item.email}</Text>
              <Text style={styles.userHint}>
                Tocar para ver los vehículos que publicó
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color="#999"
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090909",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "#090909",
  },
  infoText: {
    marginTop: 8,
    color: "#ccc",
    textAlign: "center",
  },
  errorText: {
    color: "#ff6b6b",
    textAlign: "center",
  },
  header: {
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#090909",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 12,
    padding: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
  },
  userName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  userEmail: {
    color: "#aaa",
    fontSize: 13,
  },
  userHint: {
    color: "#777",
    fontSize: 12,
    marginTop: 4,
  },
});
