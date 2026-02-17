// Importando os módulos necessários via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Suas credenciais do projeto Padaria Portela
const firebaseConfig = {
  apiKey: "AIzaSyAhlU3lMJY9lefA-5RX04UnnWvn0k24Q9Y",
  authDomain: "padaria-portela.firebaseapp.com",
  projectId: "padaria-portela",
  storageBucket: "padaria-portela.firebasestorage.app",
  messagingSenderId: "799228924183",
  appId: "1:799228924183:web:94d4c69b6541d37777a752",
  measurementId: "G-S3LCY16H3K"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços para serem usados em outros arquivos
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Exporta o app caso algum módulo precise da instância principal
export { app };
