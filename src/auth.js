import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Função principal de Login
 */
export const fazerLogin = async (email, senha) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        console.log("Usuário autenticado:", user.uid);

        // BUSCA AS CONFIGURAÇÕES (Nome e Cor) para deixar o sistema replicável
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const dados = docSnap.data();
            // Salva a cor no localStorage para o sistema carregar instantaneamente
            if (dados.corTema) {
                localStorage.setItem('tema-cor', dados.corTema);
            }
        }

        // Redireciona para a página principal (Estoque)
        window.location.href = "estoque.html";

    } catch (error) {
        console.error("Erro no login:", error.code);

        // Mensagens amigáveis para sua madrinha
        let mensagem = "Ocorreu um erro ao entrar.";
        
        switch (error.code) {
            case 'auth/invalid-credential':
                mensagem = "E-mail ou senha incorretos. Verifique e tente de novo.";
                break;
            case 'auth/user-not-found':
                mensagem = "Este usuário não foi encontrado.";
                break;
            case 'auth/wrong-password':
                mensagem = "Senha incorreta.";
                break;
            case 'auth/too-many-requests':
                mensagem = "Muitas tentativas falhas. Tente novamente mais tarde.";
                break;
        }

        alert(mensagem);
        throw error; // Lança o erro para o script.js resetar o botão
    }
};

/**
 * Função para Sair do sistema
 */
export const deslogar = async () => {
    try {
        await signOut(auth);
        localStorage.removeItem('tema-cor'); // Limpa o tema ao sair
        window.location.href = "index.html";
    } catch (error) {
        console.error("Erro ao sair:", error);
    }
};