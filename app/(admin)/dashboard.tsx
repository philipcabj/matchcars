import { CarCard } from "@/components/cards/carcard";
import { CustomAlert } from "@/components/CustomAlert";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { db } from "@/lib/firebase";
import { sendNotificationEmail } from "@/lib/mail";
import { sendPushNotification } from "@/lib/notifications";
import { SubscriptionPlan, UserRole } from "@/types/user";
import { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ROLE_LABELS: Record<UserRole, string> = { user: "Usuario", moderator: "Moderador", admin: "Admin" };
const ROLE_COLORS: Record<UserRole, string> = { user: "#6B7280", moderator: "#F59E0B", admin: "#EF4444" };

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: "Gratis",
  pro_monthly: "Pro Mensual",
  pro_annual: "Pro Anual",
  pro_plus_monthly: "Pro+ Mensual",
  pro_plus_annual: "Pro+ Anual",
  pro_dealer_monthly: "Dealer Mensual",
  pro_dealer_annual: "Dealer Anual",
  dealer_pro_plus_monthly: "Dealer Pro+ Mensual",
  dealer_pro_plus_annual: "Dealer Pro+ Anual",
  pro_dealer: "Pro Dealer",
};

const PLAN_COLORS: Record<SubscriptionPlan, string> = {
  free: "#6B7280",
  pro_monthly: "#3B82F6",
  pro_annual: "#2563EB",
  pro_plus_monthly: "#6366F1",
  pro_plus_annual: "#4F46E5",
  pro_dealer_monthly: "#10B981",
  pro_dealer_annual: "#059669",
  dealer_pro_plus_monthly: "#0D9488",
  dealer_pro_plus_annual: "#0F766E",
  pro_dealer: "#9CA3AF",
};

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
  const { theme, themeName } = useTheme();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
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

  // State for Users tab
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("user");
  const [editPlan, setEditPlan] = useState<SubscriptionPlan>("free");
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Pricing Config (USD → ARS)
  const [usdToArs, setUsdToArs] = useState<string>("");
  const [loadingFx, setLoadingFx] = useState(true);
  const [savingFx, setSavingFx] = useState(false);

  // Rejection Modal State
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processingRejection, setProcessingRejection] = useState(false);
  const [rejectionError, setRejectionError] = useState("");

  // --- Effects ---

  useEffect(() => {
    const q = query(collection(db, "vehicles"), where("status", "in", ["pending", "pending_review"]));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Vehicle));
      data.sort((a, b) => {
        const scoreA = a.riskScore || 0;
        const scoreB = b.riskScore || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        const tA = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : 0;
        const tB = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : 0;
        return tA - tB;
      });
      setVehicles(data);
      setLoadingVehicles(false);
    }, (error) => {
      console.error("Error fetching vehicles:", error);
      setLoadingVehicles(false);
    });
    return () => unsub();
  }, []);

  // Fetch pricing config (usdToArsRate)
  useEffect(() => {
    let mounted = true;
    const loadConfig = async () => {
      try {
        const snap = await getDoc(doc(db, "config", "pricing"));
        if (snap.exists()) {
          const data: any = snap.data();
          const raw = data.usdToArsRate;
          const value = typeof raw === "number" ? raw : Number(raw);
          if (!Number.isNaN(value) && value > 0 && mounted) {
            setUsdToArs(String(value));
          }
        }
      } catch (e) {
        console.error("Error loading pricing config", e);
      } finally {
        if (mounted) setLoadingFx(false);
      }
    };
    loadConfig();
    return () => {
      mounted = false;
    };
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

  // Fetch All Users (when tab is active)
  useEffect(() => {
    if (activeTab === "users") {
      setLoadingUsers(true);
      const q = query(collection(db, "users"), limit(300));
      getDocs(q).then((snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a: any, b: any) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return tB - tA;
        });
        setAllUsers(data);
        setLoadingUsers(false);
      }).catch((error) => {
        console.error("Error fetching users:", error);
        setLoadingUsers(false);
      });
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
      const vehicleRef = doc(db, "vehicles", vehicleId);
      const vehicleSnap = await getDoc(vehicleRef);
      const vehicleData = vehicleSnap.exists() ? vehicleSnap.data() as any : null;

      await updateDoc(vehicleRef, {
        status: "available",
        published: true,
        approvedAt: serverTimestamp(),
      });

      const ownerId = vehicleData?.userId;
      if (ownerId) {
        const carModel = [vehicleData?.brand, vehicleData?.model, vehicleData?.year].filter(Boolean).join(" ");

        const notifRef = doc(collection(db, "users", ownerId, "system_notifications"));
        setDoc(notifRef, {
          type: "vehicle_approved",
          vehicleId,
          brand: vehicleData?.brand || null,
          model: vehicleData?.model || null,
          year: vehicleData?.year || null,
          createdAt: serverTimestamp(),
          read: false,
        }).catch((e) => console.error("Error creating approval notification", e));

        sendNotificationEmail("vehicle_approved", {
          recipientUid: ownerId,
          senderName: "MatchCars",
          subject: "¡Tu publicación ya está activa!",
          carModel,
          ctaLink: `https://matchcars.app/car/${vehicleId}`,
        }).catch((e) => console.error("Error sending approval email", e));

        try {
          const ownerSnap = await getDoc(doc(db, "users", ownerId));
          const pushToken = ownerSnap.data()?.pushToken;
          if (pushToken) {
            sendPushNotification(
              pushToken,
              "¡Tu publicación ya está activa!",
              `${carModel || "Tu auto"} ya está visible para todos los compradores.`,
              { url: `matchcars://car/${vehicleId}` }
            );
          }
        } catch (e) {
          console.error("Error sending approval push", e);
        }
      }

      showAlert("Aprobado", "El vehículo ha sido publicado.", "success");
    } catch (e: any) {
      console.error(e);
      showAlert("Error", "No se pudo aprobar. Verificá tus permisos.", "error");
    }
  };

  const handleSaveUsdToArs = async () => {
    if (!usdToArs.trim()) {
      showAlert(
        "Valor inválido",
        "Ingresá una cotización válida para el dólar.",
        "error"
      );
      return;
    }

    const cleaned = usdToArs.replace(/\./g, "").replace(",", ".");
    const parsed = Number(cleaned);
    if (!parsed || Number.isNaN(parsed) || parsed <= 0) {
      showAlert(
        "Valor inválido",
        "La cotización debe ser un número mayor a cero.",
        "error"
      );
      return;
    }

    try {
      setSavingFx(true);
      await setDoc(
        doc(db, "config", "pricing"),
        { usdToArsRate: parsed, updatedAt: serverTimestamp() },
        { merge: true }
      );
      showAlert(
        "Cotización actualizada",
        "El valor del dólar se actualizó correctamente.",
        "success"
      );
    } catch (e) {
      console.error("Error updating usdToArsRate", e);
      showAlert(
        "Error al guardar",
        "No se pudo actualizar la cotización. Intentá de nuevo.",
        "error"
      );
    } finally {
      setSavingFx(false);
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
      const vehicleRef = doc(db, "vehicles", selectedVehicleId);
      const vehicleSnap = await getDoc(vehicleRef);
      const vehicleData = vehicleSnap.exists() ? vehicleSnap.data() as any : null;

      await updateDoc(vehicleRef, {
        status: "rejected",
        published: false,
        rejectedAt: serverTimestamp(),
        rejectionReason: rejectionReason.trim(),
      });

      const ownerId = vehicleData?.userId;
      if (ownerId) {
        const notifRef = doc(collection(db, "users", ownerId, "system_notifications"));
        await setDoc(notifRef, {
          type: "vehicle_rejected",
          vehicleId: selectedVehicleId,
          brand: vehicleData?.brand || null,
          model: vehicleData?.model || null,
          year: vehicleData?.year || null,
          rejectionReason: rejectionReason.trim() || null,
          createdAt: serverTimestamp(),
          read: false,
        });

        try {
          const carModel =
            [vehicleData?.brand, vehicleData?.model, vehicleData?.year]
              .filter(Boolean)
              .join(" ");
          await sendNotificationEmail("moderation_rejected", {
            recipientUid: ownerId,
            senderName: "Matchcars",
            subject: "Tu publicación fue rechazada para corrección",
            carModel,
            messagePreview: rejectionReason.trim() || undefined,
          });
        } catch (e) {
          console.error("Error sending moderation rejection email", e);
        }

        try {
          const ownerSnap = await getDoc(doc(db, "users", ownerId));
          const pushToken = ownerSnap.data()?.pushToken;
          if (pushToken) {
            const carModel = [vehicleData?.brand, vehicleData?.model, vehicleData?.year].filter(Boolean).join(" ");
            sendPushNotification(
              pushToken,
              "Tu publicación fue rechazada",
              `${carModel || "Tu auto"} necesita algunos cambios antes de publicarse.`,
              { url: `matchcars://car/${selectedVehicleId}` }
            );
          }
        } catch (e) {
          console.error("Error sending rejection push", e);
        }
      }

      setRejectionModalVisible(false);
      setTimeout(() => {
        showAlert(
          "Devuelto para edición",
          "La publicación fue rechazada con comentarios para que el usuario la corrija.",
          "info"
        );
      }, 300);
    } catch (e: any) {
      console.error(e);
      setRejectionError("No se pudo rechazar la publicación. Verificá tus permisos o tu conexión.");
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
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, isBlocked: false, blockedAt: null } : u));
      showAlert("Desbloqueado", "El usuario ha sido desbloqueado. Podrá volver a operar.", "success");
    } catch (e) {
      console.error(e);
      showAlert("Error", "No se pudo desbloquear al usuario.", "error");
    }
  };

  const openEditUser = (user: any) => {
    setEditingUser(user);
    setEditRole(user.role ?? "user");
    setEditPlan(user.plan ?? "free");
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser || !isAdmin) return;
    setSavingUserEdit(true);
    try {
      await updateDoc(doc(db, "users", editingUser.id), { role: editRole, plan: editPlan });
      setAllUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, role: editRole, plan: editPlan } : u));
      showAlert("Guardado", "Rol y plan actualizados correctamente.", "success");
      setEditingUser(null);
    } catch (e) {
      console.error(e);
      showAlert("Error", "No se pudo actualizar el usuario.", "error");
    } finally {
      setSavingUserEdit(false);
    }
  };

  // --- Render ---

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ backgroundColor: theme.headerBackground, paddingTop: insets.top }}>
        <Header title="Administración" showBack />
      </View>

      {/* Pricing Config */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
          <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 4 }}>Cotización USD → ARS</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
            Este valor se usa para convertir los precios de referencia en dólares a pesos argentinos.
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: theme.textMuted }}>1 USD =</Text>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: theme.inputBackground, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
              <TextInput
                value={usdToArs}
                onChangeText={setUsdToArs}
                placeholder={loadingFx ? "Cargando..." : "Ej: 1200"}
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                style={{ flex: 1, color: theme.text }}
                editable={!loadingFx && !savingFx}
              />
              <Text style={{ color: theme.textMuted, marginLeft: 4 }}>ARS</Text>
            </View>
            <TouchableOpacity
              onPress={handleSaveUsdToArs}
              disabled={savingFx || loadingFx}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: savingFx || loadingFx ? theme.textMuted : theme.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {savingFx ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 12 }}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: "row", padding: 16, paddingTop: 8, gap: 8 }}>
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

        {isAdmin && (
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
              Usuarios
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {activeTab === "moderation" ? (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const flags = item.riskFlags || [];
            let score = item.riskScore || 0;
            if (flags.includes("price_outlier") || flags.includes("price_high_outlier")) {
              if (score < 3) score = 3;
            }
            let severityLabel = "";
            let severityBg = "";
            let severityColor = "";

            const isDark = themeName === "dark";
            if (score >= 5) {
              severityLabel = "Riesgo alto";
              severityBg = isDark ? "#4C0519" : "#FEE2E2";
              severityColor = isDark ? "#FCA5A5" : "#B91C1C";
            } else if (score >= 3) {
              severityLabel = "Riesgo medio";
              severityBg = isDark ? "#451A03" : "#FEF9C3";
              severityColor = isDark ? "#FDE68A" : "#92400E";
            } else if (score > 0) {
              severityLabel = "Riesgo bajo";
              severityBg = isDark ? "#052E16" : "#DCFCE7";
              severityColor = isDark ? "#86EFAC" : "#166534";
            } else {
              severityLabel = "OK para publicar";
              severityBg = isDark ? "#022C22" : "#ECFDF5";
              severityColor = isDark ? "#6EE7B7" : "#047857";
            }

            return (
            <View style={{ marginBottom: 32 }}>
              {severityLabel !== "" && (
                <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center", 
                    alignSelf: "flex-start",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: severityBg
                  }}>
                    <Text style={{ color: severityColor, fontSize: 11, fontWeight: "700" }}>
                      {severityLabel}
                      {score > 0 ? ` • Score ${score}` : ""}
                    </Text>
                  </View>
                </View>
              )}
              <CarCard vehicle={item} hideLike={true} hideCompare={true} />
              {item.riskFlags && item.riskFlags.length > 0 && (
                <View style={{ paddingHorizontal: 16, marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {item.riskFlags.map((flag) => (
                    <View
                      key={flag}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: theme.card,
                        borderWidth: 1,
                        borderColor: theme.likeBoxBackground,
                      }}
                    >
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                        {flag === "price_outlier"
                          ? "Precio muy por debajo del mercado"
                          : flag === "price_high_outlier"
                          ? "Precio muy por encima del mercado"
                          : flag === "new_user_mass"
                          ? "Usuario nuevo con muchas publicaciones recientes"
                          : flag === "external_contact"
                          ? "Teléfono o link externo en la descripción"
                          : flag === "duplicate_image"
                          ? "Fotos repetidas en otras publicaciones"
                          : flag === "year_price_mismatch"
                          ? "Año y precio no parecen consistentes"
                          : flag}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 12 }}>
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
          )}}
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
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.inputBackground, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.likeBoxBackground }}>
              <Ionicons name="search" size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                value={usersSearch}
                onChangeText={setUsersSearch}
                placeholder="Buscar por nombre o email..."
                placeholderTextColor={theme.textMuted}
                style={{ flex: 1, color: theme.text, fontSize: 14 }}
                autoCapitalize="none"
              />
              {usersSearch.length > 0 && (
                <TouchableOpacity onPress={() => setUsersSearch("")}>
                  <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 6 }}>
              {loadingUsers ? "Cargando..." : `${allUsers.filter(u => {
                if (!usersSearch.trim()) return true;
                const q = usersSearch.toLowerCase();
                return (u.firstName?.toLowerCase() ?? "").includes(q) || (u.lastName?.toLowerCase() ?? "").includes(q) || (u.email?.toLowerCase() ?? "").includes(q);
              }).length} usuario(s)`}
            </Text>
          </View>
          {loadingUsers ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={allUsers.filter(u => {
                if (!usersSearch.trim()) return true;
                const q = usersSearch.toLowerCase();
                return (u.firstName?.toLowerCase() ?? "").includes(q) || (u.lastName?.toLowerCase() ?? "").includes(q) || (u.email?.toLowerCase() ?? "").includes(q);
              })}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingTop: 4 }}
              renderItem={({ item }) => {
                const role: UserRole = item.role ?? "user";
                const plan: SubscriptionPlan = item.plan ?? "free";
                const registeredAt = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString("es-AR") : null;
                const lastLogin = item.lastLoginAt?.toDate ? item.lastLoginAt.toDate().toLocaleDateString("es-AR") : null;
                return (
                  <TouchableOpacity
                    onPress={() => isAdmin && openEditUser(item)}
                    style={{ backgroundColor: theme.card, padding: 14, borderRadius: 12, marginBottom: 10 }}
                    activeOpacity={0.75}
                  >
                    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ color: theme.text, fontWeight: "bold", fontSize: 15 }}>
                          {item.firstName ?? ""} {item.lastName ?? ""}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>{item.email}</Text>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <View style={{ backgroundColor: ROLE_COLORS[role] + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ color: ROLE_COLORS[role], fontSize: 11, fontWeight: "700" }}>{ROLE_LABELS[role]}</Text>
                          </View>
                          <View style={{ backgroundColor: PLAN_COLORS[plan] + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ color: PLAN_COLORS[plan], fontSize: 11, fontWeight: "700" }}>{PLAN_LABELS[plan]}</Text>
                          </View>
                          {item.isBlocked && (
                            <View style={{ backgroundColor: "#EF444422", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ color: "#EF4444", fontSize: 11, fontWeight: "700" }}>Bloqueado</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        {registeredAt && <Text style={{ color: theme.textMuted, fontSize: 11 }}>Reg: {registeredAt}</Text>}
                        {lastLogin && <Text style={{ color: theme.textMuted, fontSize: 11 }}>Login: {lastLogin}</Text>}
                        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginTop: 4 }} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={{ color: theme.textMuted, textAlign: "center", marginTop: 40 }}>
                  {usersSearch.trim() ? "Sin resultados para esa búsqueda." : "No hay usuarios registrados."}
                </Text>
              }
            />
          )}
        </View>
      )}

      {/* User Edit Modal */}
      <Modal
        visible={!!editingUser}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingUser(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: theme.inputBackground }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: "bold" }}>
                  {editingUser?.firstName ?? ""} {editingUser?.lastName ?? ""}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>{editingUser?.email}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditingUser(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={26} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              {/* Role */}
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700", marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Rol</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["user", "moderator", "admin"] as UserRole[]).map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setEditRole(r)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: "center",
                      backgroundColor: editRole === r ? ROLE_COLORS[r] : theme.inputBackground,
                      borderWidth: 1.5,
                      borderColor: editRole === r ? ROLE_COLORS[r] : theme.likeBoxBackground,
                    }}
                  >
                    <Text style={{ color: editRole === r ? "#FFF" : theme.text, fontWeight: "700", fontSize: 13 }}>
                      {ROLE_LABELS[r]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Plan */}
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700", marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Plan</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(Object.keys(PLAN_LABELS) as SubscriptionPlan[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setEditPlan(p)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 10,
                      backgroundColor: editPlan === p ? PLAN_COLORS[p] : theme.inputBackground,
                      borderWidth: 1.5,
                      borderColor: editPlan === p ? PLAN_COLORS[p] : theme.likeBoxBackground,
                    }}
                  >
                    <Text style={{ color: editPlan === p ? "#FFF" : theme.text, fontWeight: "600", fontSize: 12 }}>
                      {PLAN_LABELS[p]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Unblock (if blocked) */}
              {editingUser?.isBlocked && (
                <TouchableOpacity
                  onPress={() => {
                    handleUnblockUser(editingUser.id);
                    setEditingUser(null);
                  }}
                  style={{ marginTop: 20, backgroundColor: theme.inputBackground, borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}
                >
                  <Text style={{ color: "#EF4444", fontWeight: "700" }}>Desbloquear usuario</Text>
                </TouchableOpacity>
              )}

              {/* Save */}
              <TouchableOpacity
                onPress={handleSaveUserEdit}
                disabled={savingUserEdit}
                style={{ marginTop: 16, backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: savingUserEdit ? 0.7 : 1 }}
              >
                {savingUserEdit && <ActivityIndicator size="small" color="#FFF" />}
                <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 16 }}>
                  {savingUserEdit ? "Guardando..." : "Guardar cambios"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
