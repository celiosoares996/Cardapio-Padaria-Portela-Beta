// Importamos o Auth e o DB do seu arquivo de configuração
import { auth, db } from './firebase-config.js';
// Importamos as funções necessárias do Firebase via CDN
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const loginForm = document.getElementById('loginForm');
const btnEntrar = document.getElementById('btnEntrar');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;

        // Feedback visual de carregamento
        btnEntrar.disabled = true;
        btnEntrar.innerText = "AUTENTICANDO...";

        try {
            // 1. Tenta logar no Firebase Authentication
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            console.log("Login realizado com sucesso! UID:", user.uid);

            // 2. Busca os dados da loja (como a cor do tema) no Firestore
            // Suas regras permitem ler /usuarios/{userId} se o dono estiver logado
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                const dados = userDoc.data();
                
                // Salva a cor no localStorage para o carregamento visual rápido
                if (dados.corTema) {
                    localStorage.setItem('tema-cor', dados.corTema);
                    document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
                }
                
                // 3. Redireciona para o painel administrativo passando o ID
                window.location.href = `painel.html?id=${user.uid}`;
            } else {
                // Caso o usuário exista no Auth mas não tenha documento no Firestore
                alert("Perfil da loja não encontrado no banco de dados.");
                btnEntrar.disabled = false;
                btnEntrar.innerText = "ENTRAR NO SISTEMA";
            }

        } catch (error) {
            console.error("Erro completo:", error);
            btnEntrar.disabled = false;
            btnEntrar.innerText = "ENTRAR NO SISTEMA";

            // Tratamento de erros detalhado
            switch (error.code) {
                case 'auth/invalid-credential':
                    alert("E-mail ou senha incorretos.");
                    break;
                case 'auth/user-not-found':
                    alert("E-mail não cadastrado.");
                    break;
                case 'auth/wrong-password':
                    alert("Senha incorreta.");
                    break;
                case 'auth/invalid-email':
                    alert("Formato de e-mail inválido.");
                    break;
                default:
                    alert("Erro ao entrar: " + error.message);
            }
        }
    });
}
