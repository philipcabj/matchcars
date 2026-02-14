import { CarCard } from "@/components/cards/carcard";
import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Report {
  id: string;
  targetId: string;
  targetType: string;
  reason: string;
  details: string;
  reportedBy: string;
  createdAt: any;
  status: "pending" | "resolved";
}

interface ReportedUser {
  user: any;
  reports: Report[];
}

const ReportItem = ({ item, onDismiss, onBlock, onDeletePost, onShowAlert }: { item: Report, onDismiss: (id: string) => void, onBlock: (userId: string, reportId: string) => void, onDeletePost: (vehicleId: string, reportId: string) => void, onShowAlert: (title: string, message: string, type: "success" | "error" | "info" | "warning") => void }) => {
  const { theme } = useTheme();
  const [targetVehicle, setTargetVehicle] = useState<Vehicle | null>(null);
  const [targetUser, setTargetUser] = useState<any | null>(null);
  const [reporter, setReporter] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        if (item.targetType === "vehicle") {
          const vSnap = await getDoc(doc(db, "vehicles", item.targetId));
          if (vSnap.exists()) {
            const vData = { id: vSnap.id, ...vSnap.data() } as Vehicle;
            setTargetVehicle(vData);
            if (vData.userId) {
              const uSnap = await getDoc(doc(db, "users", vData.userId));
              if (uSnap.exists()) {
                setTargetUser({ id: uSnap.id, ...uSnap.data() });
              }
            }
          }
        } else if (item.targetType === "user") {
          const uSnap = await getDoc(doc(db, "users", item.targetId));
          if (uSnap.exists()) {
            setTargetUser({ id: uSnap.id, ...uSnap.data() });
          }
        }
        
        if (item.reportedBy) {
             const rSnap = await getDoc(doc(db, "users", item.reportedBy));
             if (rSnap.exists()) {
                 setReporter(rSnap.data());
             }
        }
      } catch (e) {
        console.error("Error fetching report details:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [item]);

  const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : "Fecha desconocida";

  return (
    <View style={{ backgroundColor: theme.card, margin: 16, marginTop: 0, padding: 16, borderRadius: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <Ionicons name="warning" size={24} color="#EF4444" style={{ marginRight: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: "bold", fontSize: 16 }}>
            {item.reason}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {dateStr}
          </Text>
          {reporter ? (
             <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                Denunciante: {reporter.firstName} {reporter.lastName}
             </Text>
          ) : (
             <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                Denunciante ID: {item.reportedBy || "Anónimo"}
             </Text>
          )}
        </View>
      </View>

      {/* Details */}
      <View style={{ marginBottom: 16, gap: 8 }}>
        <Text style={{ color: theme.text }}>
          {item.details || "Sin detalles adicionales."}
        </Text>
        
        {loading ? (
           <ActivityIndicator size="small" color={theme.accent} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <>
            {targetVehicle && (
              <View style={{ backgroundColor: theme.background, padding: 8, borderRadius: 8 }}>
                 <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 2 }}>Vehículo Reportado:</Text>
                 <Text style={{ color: theme.text, fontWeight: "600" }}>
                   {targetVehicle.brand} {targetVehicle.model} {targetVehicle.year}
                 </Text>
                 <Text style={{ color: theme.textMuted, fontSize: 12 }}>ID: {targetVehicle.id}</Text>
              </View>
            )}

            {targetUser && (
              <View style={{ backgroundColor: theme.background, padding: 8, borderRadius: 8 }}>
                 <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 2 }}>Usuario a Bloquear (Propietario):</Text>
                 <Text style={{ color: theme.text, fontWeight: "600" }}>
                   {targetUser.firstName} {targetUser.lastName}
                 </Text>
                 <Text style={{ color: theme.textMuted, fontSize: 12 }}>{targetUser.email}</Text>
                 <Text style={{ color: theme.textMuted, fontSize: 12 }}>ID: {targetUser.id}</Text>
                 {targetUser.isBlocked && (
                    <Text style={{ color: "#EF4444", fontWeight: "bold", marginTop: 4 }}>🚫 USUARIO YA BLOQUEADO</Text>
                 )}
              </View>
            )}
            
            {!targetUser && !loading && (
               <Text style={{ color: "#EF4444", fontSize: 12 }}>⚠ No se pudo encontrar el usuario propietario.</Text>
            )}
          </>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <TouchableOpacity
          onPress={() => onDismiss(item.id)}
          style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: theme.buttonBackground, alignItems: "center" }}
        >
          <Text style={{ color: theme.buttonText }}>Descartar</Text>
        </TouchableOpacity>

        {targetVehicle && !targetUser?.isBlocked && (
           <TouchableOpacity
             onPress={() => onDeletePost(targetVehicle.id, item.id)}
             style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: "#F59E0B", alignItems: "center" }}
           >
             <Text style={{ color: "white", fontWeight: "bold", textAlign: 'center', fontSize: 12 }}>Eliminar Pub.</Text>
           </TouchableOpacity>
        )}
        
        <TouchableOpacity
          disabled={loading || !targetUser || targetUser.isBlocked}
          onPress={() => {
             if (targetUser) {
                onBlock(targetUser.id, item.id);
             } else {
                onShowAlert("Error", "No se identificó al usuario para bloquear.", "error");
             }
          }}
          style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: loading || !targetUser || targetUser?.isBlocked ? theme.textMuted : "#EF4444", alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "bold" }}>{targetUser?.isBlocked ? "Bloqueado" : "Bloquear"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function AdminDashboardScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"moderation" | "reports" | "users">("moderation");
  
  // State for Moderation
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);

  // State for Reports
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportedUsers, setReportedUsers] = useState<ReportedUser[]>([]);
  const [loadingGrouped, setLoadingGrouped] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // State for Blocked Users
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Rejection Modal State
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processingRejection, setProcessingRejection] = useState(false);
  const [rejectionError, setRejectionError] = useState("");

  // --- Effects ---

  // Fetch Pending Vehicles
  useEffect(() => {
    const q = query(collection(db, "vehicles"), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Vehicle));
      setVehicles(data);
      setLoadingVehicles(false);
    }, (error) => {
      console.error("Error fetching vehicles:", error);
      setLoadingVehicles(false);
    });
    return () => unsub();
  }, []);

  // Fetch Pending Reports
  useEffect(() => {
    const q = query(collection(db, "reports"), where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Report));
      setReports(data);
      setLoadingReports(false);
    }, (error) => {
      console.error("Error fetching reports:", error);
      setLoadingReports(false);
    });
    return () => unsub();
  }, []);

  // Aggregate Reports by User
  useEffect(() => {
    if (reports.length === 0) {
      setReportedUsers([]);
      return;
    }

    const group = async () => {
      setLoadingGrouped(true);
      const map = new Map<string, Report[]>();
      
      for (const r of reports) {
        let uid: string | null = null;
        if (r.targetType === "user") {
          uid = r.targetId;
        } else if (r.targetType === "vehicle") {
          // Try to fetch vehicle to find owner
          try {
            const vSnap = await getDoc(doc(db, "vehicles", r.targetId));
            if (vSnap.exists()) {
              uid = vSnap.data().userId;
            }
          } catch (e) {
            console.error("Error resolving vehicle owner:", e);
          }
        }
        
        if (uid) {
          const list = map.get(uid) || [];
          list.push(r);
          map.set(uid, list);
        }
      }

      const result: ReportedUser[] = [];
      for (const [uid, userReports] of map.entries()) {
        try {
          const uSnap = await getDoc(doc(db, "users", uid));
          if (uSnap.exists()) {
            result.push({
              user: { id: uSnap.id, ...uSnap.data() },
              reports: userReports
            });
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
        }
      }
      
      setReportedUsers(result);
      setLoadingGrouped(false);
    };
    
    group();
  }, [reports]);

  // Fetch Blocked Users (Only when tab is active)
  useEffect(() => {
    if (activeTab === "users") {
      setLoadingUsers(true);
      const q = query(collection(db, "users"), where("isBlocked", "==", true));
      const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setBlockedUsers(data);
        setLoadingUsers(false);
      }, (error) => {
        console.error("Error fetching blocked users:", error);
        setLoadingUsers(false);
      });
      return () => unsub();
    }
  }, [activeTab]);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info" as "success" | "error" | "info" | "warning",
    onClose: () => {},
    showCancel: false,
    onCancel: () => {},
    confirmText: "Entendido",
    cancelText: "Cancelar"
  });

  const showAlert = (
    title: string,
    message: string,
    type: "success" | "error" | "info" | "warning" = "info",
    onClose?: () => void,
    showCancel = false,
    onCancel?: () => void,
    confirmText = "Entendido",
    cancelText = "Cancelar"
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      onClose: () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
        if (onClose) onClose();
      },
      showCancel,
      onCancel: () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
        if (onCancel) onCancel();
      },
      confirmText,
      cancelText
    });
  };

  // --- Handlers: Moderation ---

  const handleApprove = async (vehicleId: string) => {
    try {
      await updateDoc(doc(db, "vehicles", vehicleId), {
        status: "available",
        published: true,
        approvedAt: serverTimestamp(),
      });
      showAlert("Aprobado", "El vehículo ha sido publicado.", "success");
    } catch (e: any) {
      console.error(e);
      showAlert("Error", "No se pudo aprobar. Verificá tus permisos.", "error");
    }
  };

  const openRejectionModal = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setRejectionReason("");
    setRejectionError("");
    setRejectionModalVisible(true);
  };

  const confirmRejection = async () => {
    if (!selectedVehicleId) return;
    setRejectionError("");
    
    if (!rejectionReason.trim()) {
      setRejectionError("Por favor ingresá un motivo de rechazo.");
      return;
    }

    setProcessingRejection(true);
    try {
      // User requested to DELETE the vehicle on rejection
      await deleteDoc(doc(db, "vehicles", selectedVehicleId));
      
      setRejectionModalVisible(false);
      // Wait a bit for modal to close before showing alert to avoid conflict
      setTimeout(() => {
        showAlert("Eliminado", "La publicación ha sido eliminada permanentemente.", "success");
      }, 300);
    } catch (e: any) {
      console.error(e);
      // Keep modal open, show error inline or via native Alert
      setRejectionError("No se pudo eliminar. Verificá tus permisos o tu conexión.");
    } finally {
      setProcessingRejection(false);
    }
  };

  // --- Handlers: Reports ---

  const handleBlockUser = async (userId: string, reportId: string) => {
    try {
      const batch = writeBatch(db);
      
      // 1. Block User
      const userRef = doc(db, "users", userId);
      batch.update(userRef, {
        isBlocked: true,
        blockedAt: new Date(),
      });
      
      // 2. Resolve Report
      const reportRef = doc(db, "reports", reportId);
      batch.update(reportRef, {
        status: "resolved",
        resolution: "blocked"
      });

      // 3. Unpublish all their vehicles
      const vehiclesQ = query(collection(db, "vehicles"), where("userId", "==", userId));
      const vehiclesSnap = await getDocs(vehiclesQ);
      vehiclesSnap.forEach((v) => {
        batch.update(v.ref, { published: false, status: "blocked" });
      });

      await batch.commit();

      showAlert("Bloqueado", "El usuario ha sido bloqueado y sus autos despublicados.", "success");
    } catch (e) {
      console.error(e);
      showAlert("Error", "No se pudo bloquear al usuario.", "error");
    }
  };

  const handleDismissReport = async (reportId: string) => {
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: "resolved",
        resolution: "dismissed"
      });
      showAlert("Descartado", "Reporte descartado.", "success");
    } catch (e) {
      showAlert("Error", "No se pudo descartar.", "error");
    }
  };

  const handleDeletePost = async (vehicleId: string, reportId: string) => {
    try {
      const batch = writeBatch(db);

      // 1. Delete Vehicle (or mark as deleted/rejected)
      const vRef = doc(db, "vehicles", vehicleId);
      batch.update(vRef, { 
        status: "rejected", 
        published: false,
        rejectedAt: serverTimestamp(),
        rejectionReason: "Eliminado por administración (Reporte)"
      });

      // 2. Resolve Report
      const rRef = doc(db, "reports", reportId);
      batch.update(rRef, {
        status: "resolved",
        resolution: "post_deleted"
      });

      await batch.commit();
      showAlert("Éxito", "Publicación eliminada y reporte resuelto.", "success");
    } catch (e: any) {
      console.error(e);
      showAlert("Error", "No se pudo eliminar la publicación.", "error");
    }
  };

  // --- Handlers: Users ---
  
  const handleUnblockUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        isBlocked: false,
        blockedAt: null
      });
      showAlert("Desbloqueado", "El usuario ha sido desbloqueado. Podrá volver a operar.", "success");
    } catch (e) {
      console.error(e);
      showAlert("Error", "No se pudo desbloquear al usuario.", "error");
    }
  };

  // --- Render ---

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ backgroundColor: theme.headerBackground, paddingTop: insets.top }}>
        <Header title="Administración" showBack />
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", padding: 16, gap: 8 }}>
        <TouchableOpacity
          onPress={() => setActiveTab("moderation")}
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 4,
            borderRadius: 8,
            backgroundColor: activeTab === "moderation" ? theme.primary : theme.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text 
            numberOfLines={1} 
            adjustsFontSizeToFit 
            style={{ 
              color: activeTab === "moderation" ? "#FFF" : theme.text,
              fontWeight: "bold",
              fontSize: 12,
              textAlign: "center"
            }}
          >
            Publicaciones ({vehicles.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("reports")}
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 4,
            borderRadius: 8,
            backgroundColor: activeTab === "reports" ? theme.primary : theme.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text 
            numberOfLines={1} 
            adjustsFontSizeToFit
            style={{ 
              color: activeTab === "reports" ? "#FFF" : theme.text,
              fontWeight: "bold",
              fontSize: 12,
              textAlign: "center"
            }}
          >
            Reportes ({reports.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("users")}
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 4,
            borderRadius: 8,
            backgroundColor: activeTab === "users" ? theme.primary : theme.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text 
            numberOfLines={1} 
            adjustsFontSizeToFit
            style={{ 
              color: activeTab === "users" ? "#FFF" : theme.text,
              fontWeight: "bold",
              fontSize: 12,
              textAlign: "center"
            }}
          >
            Bloqueados
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === "moderation" ? (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 24 }}>
              <CarCard vehicle={item} hideLike={true} hideCompare={true} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, marginTop: -8 }}>
                <TouchableOpacity
                  onPress={() => openRejectionModal(item.id)}
                  style={{
                    flex: 1,
                    backgroundColor: "#EF4444",
                    padding: 12,
                    marginRight: 8,
                    borderRadius: 8,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="white" />
                  <Text style={{ color: "white", fontWeight: "bold" }}>Rechazar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleApprove(item.id)}
                  style={{
                    flex: 1,
                    backgroundColor: "#10B981",
                    padding: 12,
                    marginLeft: 8,
                    borderRadius: 8,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8
                  }}
                >
                  <Ionicons name="checkmark-circle" size={20} color="white" />
                  <Text style={{ color: "white", fontWeight: "bold" }}>Aprobar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>
              No hay publicaciones pendientes.
            </Text>
          }
        />
      ) : activeTab === "reports" ? (
        <View style={{ flex: 1 }}>
          {loadingGrouped ? (
             <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={reportedUsers}
              keyExtractor={(item) => item.user.id}
              contentContainerStyle={{ paddingVertical: 16 }}
              renderItem={({ item }) => (
                <View style={{ backgroundColor: theme.card, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12 }}>
                   <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                       <View style={{ flex: 1 }}>
                           <Text style={{ color: theme.text, fontSize: 18, fontWeight: "bold" }}>
                               {item.user.firstName || "Usuario"} {item.user.lastName || ""}
                           </Text>
                           <Text style={{ color: theme.textMuted }}>{item.user.email}</Text>
                           <Text style={{ color: "#EF4444", fontWeight: "bold", marginTop: 4 }}>
                               {item.reports.length} Reporte{item.reports.length !== 1 ? 's' : ''}
                           </Text>
                           {/* Show flags count if available, though reports.length is more accurate for pending */}
                           {item.user.flags > 0 && (
                               <Text style={{ color: theme.textMuted, fontSize: 10 }}>Total Flags: {item.user.flags}</Text>
                           )}
                       </View>
                       <TouchableOpacity 
                          onPress={() => setViewingUserId(item.user.id)}
                          style={{ backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
                       >
                          <Text style={{ color: "#FFF", fontWeight: "bold" }}>Ver Reportes</Text>
                       </TouchableOpacity>
                   </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>
                  No hay usuarios reportados.
                </Text>
              }
            />
          )}
        </View>
      ) : (
        // Users Tab
        <View style={{ flex: 1 }}>
          {loadingUsers ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={blockedUsers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={{ backgroundColor: theme.card, padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: "bold", fontSize: 16 }}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={{ color: theme.textMuted }}>{item.email}</Text>
                    <Text style={{ color: "#EF4444", fontSize: 12, marginTop: 4 }}>
                      Bloqueado: {item.blockedAt?.toDate ? item.blockedAt.toDate().toLocaleDateString() : "Fecha desconocida"}
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    onPress={() => handleUnblockUser(item.id)}
                    style={{ backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                  >
                    <Text style={{ color: "white", fontWeight: "bold" }}>Desbloquear</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>
                  No hay usuarios bloqueados.
                </Text>
              }
            />
          )}
        </View>
      )}

      {/* User Reports Detail Modal */}
      <Modal
        visible={!!viewingUserId}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewingUserId(null)}
      >
        <View style={{ flex: 1, backgroundColor: theme.background }}>
           {(() => {
              const u = reportedUsers.find(x => x.user.id === viewingUserId);
              if (!u) {
                  if (viewingUserId) setViewingUserId(null);
                  return null;
              }
              
              return (
                  <View style={{ flex: 1 }}>
                      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.inputBackground, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View>
                              <Text style={{ color: theme.text, fontSize: 20, fontWeight: "bold" }}>
                                  {u.user.firstName} {u.user.lastName}
                              </Text>
                              <Text style={{ color: theme.textMuted }}>{u.user.email}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setViewingUserId(null)}>
                              <Ionicons name="close" size={28} color={theme.text} />
                          </TouchableOpacity>
                      </View>
                      
                      {/* Actions Header */}
                      <View style={{ flexDirection: "row", padding: 16, gap: 10 }}>
                          <TouchableOpacity 
                             onPress={() => {
                                 const subject = "Aviso sobre tu cuenta en MatchCars";
                                 const body = "Hola, hemos recibido reportes sobre tu actividad...";
                                 Linking.openURL(`mailto:${u.user.email}?subject=${subject}&body=${body}`);
                             }}
                             style={{ flex: 1, backgroundColor: theme.card, padding: 12, borderRadius: 8, alignItems: "center" }}
                          >
                             <Text style={{ color: theme.text, fontWeight: "600" }}>Contactar</Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity 
                             onPress={() => {
                                 if (u.reports.length > 0) {
                                     // Block using the first report to link resolution
                                    handleBlockUser(u.user.id, u.reports[0].id);
                                } else {
                                    showAlert("Error", "No hay reportes para vincular el bloqueo.", "error");
                                }
                            }}
                            style={{ flex: 1, backgroundColor: "#EF4444", padding: 12, borderRadius: 8, alignItems: "center" }}
                         >
                             <Text style={{ color: "white", fontWeight: "bold" }}>Banear Usuario</Text>
                          </TouchableOpacity>
                      </View>

                      <FlatList
                          data={u.reports}
                          keyExtractor={(item) => item.id}
                          contentContainerStyle={{ paddingBottom: 40 }}
                          renderItem={({ item }) => (
                             <ReportItem 
                               item={item} 
                               onDismiss={handleDismissReport} 
                               onBlock={handleBlockUser} 
                               onDeletePost={handleDeletePost}
                               onShowAlert={showAlert}
                             />
                          )}
                      />
                  </View>
              );
           })()}
        </View>
      </Modal>

      {/* Rejection Modal */}
      <Modal
        visible={rejectionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectionModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20 }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
              Rechazar Publicación
            </Text>
            <Text style={{ color: theme.textMuted, marginBottom: 16 }}>
              Indicá el motivo del rechazo para que el usuario pueda corregirlo.
            </Text>

            {rejectionError ? (
                <Text style={{ color: "#EF4444", marginBottom: 10, fontWeight: "bold" }}>
                    {rejectionError}
                </Text>
            ) : null}

            <TextInput
              value={rejectionReason}
              onChangeText={(text) => {
                  setRejectionReason(text);
                  if (rejectionError) setRejectionError("");
              }}
              multiline
              placeholder="Ej: Las fotos están borrosas..."
              placeholderTextColor={theme.textMuted}
              style={{
                backgroundColor: theme.background,
                color: theme.text,
                padding: 12,
                borderRadius: 12,
                height: 100,
                textAlignVertical: "top",
                marginBottom: 20
              }}
            />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <TouchableOpacity 
                onPress={() => setRejectionModalVisible(false)}
                disabled={processingRejection}
                style={{ padding: 10, opacity: processingRejection ? 0.5 : 1 }}
              >
                <Text style={{ color: theme.textMuted, fontWeight: "bold" }}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={confirmRejection}
                disabled={processingRejection}
                style={{ backgroundColor: "#EF4444", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: processingRejection ? 0.7 : 1 }}
              >
                {processingRejection && <ActivityIndicator size="small" color="white" />}
                <Text style={{ color: "white", fontWeight: "bold" }}>
                    {processingRejection ? "Procesando..." : "Confirmar Rechazo"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={alertConfig.onClose}
        showCancel={alertConfig.showCancel}
        onCancel={alertConfig.onCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />
    </View>
  );
}
