import { initializeApp, getApps } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  getFirestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

function createDb() {
  if (typeof window === 'undefined') return getFirestore(app)
  try {
    // Single-tab manager with forceOwnership avoids the coordination overhead of
    // multi-tab and ensures this tab always holds the IndexedDB lease, even after
    // the app is backgrounded or the previous tab crashed.
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: true }),
      }),
    })
  } catch {
    // initializeFirestore already called (e.g. HMR in dev) — reuse existing instance
    return getFirestore(app)
  }
}

export const db = createDb()
