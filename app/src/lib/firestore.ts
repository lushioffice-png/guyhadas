import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "../firebase";
import type { Business, Task, Opportunity, Integration } from "../types";

// Thin, typed wrappers around Firestore. No Cloud Functions in Milestone 1 -
// access is enforced entirely by firestore.rules (ADMIN_EMAILS), same
// pattern the existing public-site admin dashboard already uses for
// leads/settings.

// --- Businesses ---

export function listenBusinesses(cb: (businesses: Business[]) => void): Unsubscribe {
  const q = query(collection(db, "businesses"), orderBy("businessNumber", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Business, "id">) })));
  });
}

export async function createBusiness(data: Omit<Business, "id" | "createdAt">) {
  return addDoc(collection(db, "businesses"), {
    ...data,
    createdAt: serverTimestamp()
  });
}

export async function updateBusiness(id: string, data: Partial<Business>) {
  return updateDoc(doc(db, "businesses", id), data as Record<string, unknown>);
}

// --- Tasks ---

export function listenTasks(businessId: string, cb: (tasks: Task[]) => void): Unsubscribe {
  const q = query(collection(db, "tasks"), where("businessId", "==", businessId));
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) }));
    tasks.sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      return tb - ta;
    });
    cb(tasks);
  });
}

export async function createTask(data: Omit<Task, "id" | "createdAt" | "completedAt">) {
  return addDoc(collection(db, "tasks"), {
    ...data,
    createdAt: serverTimestamp(),
    completedAt: null
  });
}

export async function updateTask(id: string, data: Partial<Task>) {
  return updateDoc(doc(db, "tasks", id), data as Record<string, unknown>);
}

export async function deleteTask(id: string) {
  return deleteDoc(doc(db, "tasks", id));
}

// --- Opportunities ---

export function listenOpportunities(businessId: string, cb: (opps: Opportunity[]) => void): Unsubscribe {
  const q = query(collection(db, "opportunities"), where("businessId", "==", businessId));
  return onSnapshot(q, (snap) => {
    const opps = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Opportunity, "id">) }));
    opps.sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      return tb - ta;
    });
    cb(opps);
  });
}

export async function createOpportunity(data: Omit<Opportunity, "id" | "createdAt" | "updatedAt">) {
  return addDoc(collection(db, "opportunities"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateOpportunity(id: string, data: Partial<Opportunity>) {
  return updateDoc(doc(db, "opportunities", id), {
    ...data,
    updatedAt: serverTimestamp()
  } as Record<string, unknown>);
}

export async function deleteOpportunity(id: string) {
  return deleteDoc(doc(db, "opportunities", id));
}

// --- Integrations (read-only in Milestone 1; Milestone 2 writes these from
// Cloud Functions once real Google/Semrush connections exist) ---

export function listenIntegrations(businessId: string, cb: (items: Integration[]) => void): Unsubscribe {
  const q = query(collection(db, "integrations"), where("businessId", "==", businessId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Integration, "id">) })));
  });
}

export function listenAllTasksAcrossBusinesses(cb: (tasks: Task[]) => void): Unsubscribe {
  const q = query(collection(db, "tasks"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) })));
  });
}

export function listenAllOpportunitiesAcrossBusinesses(cb: (opps: Opportunity[]) => void): Unsubscribe {
  const q = query(collection(db, "opportunities"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Opportunity, "id">) })));
  });
}

export function listenAllIntegrations(cb: (items: Integration[]) => void): Unsubscribe {
  const q = query(collection(db, "integrations"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Integration, "id">) })));
  });
}
