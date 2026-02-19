import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Função de Login por E-mail
 */
export const fazerLogin = async (email, senha) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        await carregarConfiguracoes(userCredential.user.uid);
        window.location.href = "perfil.html"; // Centralizei para o perfil ou dashboard
    } catch (error) {
        console.error("Erro no login:", error.code);
        let mensagem = "E-mail ou senha incorretos.";
        
        if (error.code === 'auth/invalid-credential') {
            mensagem = "Dados de acesso inválidos. Verifique se digitou corretamente.";
        }
        
        alert(mensagem);
        throw error;
    }
};

/**
 * Função de Login com Google
 */
export const fazerLoginGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        await carregarConfiguracoes(result.user.uid);
        window.location.href = "perfil.html";
    } catch (error) {
        console.error("Erro Google:", error);
    }
};

/**
 * Carrega o tema salvo para não dar "flash" de cor errada
 */
async function carregarConfiguracoes(uid) {
    const docSnap = await getDoc(doc(db, "usuarios", uid));
    if (docSnap.exists()) {
        const dados = docSnap.data();
        if (dados.corTema) localStorage.setItem('tema-cor', dados.corTema);
        if (dados.nomeNegocio) localStorage.setItem('estab-nome', dados.nomeNegocio);
    }
}

export const deslogar = async () => {
    try {
        await signOut(auth);
        localStorage.clear(); 
        window.location.href = "index.html";
    } catch (error) {
        console.error("Erro ao sair:", error);
    }
};
