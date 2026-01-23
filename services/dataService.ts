import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  Unsubscribe 
} from 'firebase/firestore';
import { DealershipTask, Employee, FinanceRecord, ReceivableRecord, DocumentRecord } from '../types';

/**
 * DataService handles persistence logic using Firebase Firestore.
 */

export const DataService = {
  // --- Employees ---
  async getEmployees(): Promise<Employee[]> {
    const snapshot = await getDocs(collection(db, 'employees'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
  },

  async addEmployee(employee: Employee) {
    await setDoc(doc(db, 'employees', employee.id), employee);
  },

  async removeEmployee(id: string) {
    await deleteDoc(doc(db, 'employees', id));
  },

  // --- Tasks (Real-time) ---
  // Returns an Unsubscribe function
  getTasks(onUpdate: (tasks: DealershipTask[]) => void): Unsubscribe {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealershipTask));
      onUpdate(tasks);
    });
  },

  async addTask(task: DealershipTask) {
    await setDoc(doc(db, 'tasks', task.id), task);
  },

  async updateTask(task: DealershipTask) {
    await setDoc(doc(db, 'tasks', task.id), task, { merge: true });
  },

  async deleteTask(id: string) {
    await deleteDoc(doc(db, 'tasks', id));
  },

  // --- Finance ---
  async getFinance(): Promise<FinanceRecord[]> {
    const snapshot = await getDocs(collection(db, 'finance'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FinanceRecord));
  },

  async addFinance(record: FinanceRecord) {
    await setDoc(doc(db, 'finance', record.id), record);
  },

  async removeFinance(id: string) {
    await deleteDoc(doc(db, 'finance', id));
  },

  // --- Receivables ---
  async getReceivables(): Promise<ReceivableRecord[]> {
    const snapshot = await getDocs(collection(db, 'receivables'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ReceivableRecord));
  },

  async addReceivable(record: ReceivableRecord) {
    await setDoc(doc(db, 'receivables', record.id), record);
  },

  async removeReceivable(id: string) {
    await deleteDoc(doc(db, 'receivables', id));
  },

  // --- Documents ---
  async getDocuments(): Promise<DocumentRecord[]> {
    const snapshot = await getDocs(collection(db, 'documents'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DocumentRecord));
  },

  async addDocument(docRecord: DocumentRecord) {
    await setDoc(doc(db, 'documents', docRecord.id), docRecord);
  },

  async removeDocument(id: string) {
    await deleteDoc(doc(db, 'documents', id));
  }
};
