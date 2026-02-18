import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const loginForm = document.getElementById('loginForm');
const btnEntrar = document.getElementById('btnEntrar');
const btnGoogle = document.getElementById('btnGoogle');
const linkEsqueciSenha = document.getElementById('esqueciSenha');

// Configuração do Provedor Google
const googleProvider = new GoogleAuthProvider();

// --- FUNÇÃO CENTRAL DE VERIFICAÇÃO E CRIAÇÃO DE PERFIL ---
async function verificarECriarPerfil(user) {
    const userRef = doc(db, "usuarios", user.uid);
    const userSnap = await getDoc(userRef);

    let dadosLoja;

    if (!userSnap.exists()) {
        // Se o perfil não existir, cria com campos padrão
        dadosLoja = {
            nomeNegocio: user.displayName || "Minha Nova Loja",
            corTema: "#2563eb",
            fotoPerfil: user.photoURL || "",
            email: user.email,
            uid: user.uid,
            whatsapp: "", // Campo para ser preenchido nas configurações
            status: "ativo",
            createdAt: new Date().toISOString()
        };
        await setDoc(userRef, dadosLoja);
    } else {
        dadosLoja = userSnap.data();
    }

    // Persistência local para carregamento rápido da UI
    localStorage.setItem('tema-cor', dadosLoja.corTema || "#2563eb");
    localStorage.setItem('estab-nome', dadosLoja.nomeNegocio || "Minha Loja");
    localStorage.setItem('estab-logo', dadosLoja.fotoPerfil || "");

    // Redireciona enviando o ID na URL
    window.location.href = `dashboard.html?id=${user.uid}`;
}

// --- 1. LÓGICA DE LOGIN (E-MAIL/SENHA) ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;

        // Feedback visual de carregamento
        btnEntrar.disabled = true;
        const originalContent = btnEntrar.innerHTML;
        btnEntrar.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            await verificarECriarPerfil(userCredential.user);
        } catch (error) {
            console.error("Erro Login:", error.code);
            let msg = "E-mail ou senha inválidos.";
            
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                msg = "Usuário não encontrado ou dados incorretos.";
            } else if (error.code === 'auth/too-many-requests') {
                msg = "Muitas tentativas. Tente novamente mais tarde.";
            }
            
            Swal.fire({ 
                icon: 'error', 
                title: 'Falha no Acesso', 
                text: msg, 
                confirmButtonColor: '#ef4444' 
            });
            
            btnEntrar.disabled = false;
            btnEntrar.innerHTML = originalContent;
        }
    });
}

// --- 2. LÓGICA DE LOGIN (GOOGLE) ---
if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            await verificarECriarPerfil(result.user);
        } catch (error) {
            console.error("Erro Google:", error);
            if(error.code !== 'auth/popup-closed-by-user') {
                Swal.fire({ 
                    icon: 'error', 
                    title: 'Erro Google', 
                    text: 'Não foi possível conectar com sua conta Google.' 
                });
            }
        }
    });
}

// --- 3. RECUPERAÇÃO DE SENHA ---
if (linkEsqueciSenha) {
    linkEsqueciSenha.addEventListener('click', async (e) => {
        e.preventDefault();
        const { value: email } = await Swal.fire({
            title: 'Recuperar Senha',
            input: 'email',
            inputPlaceholder: 'Seu e-mail de acesso',
            showCancelButton: true,
            confirmButtonText: 'Enviar Link',
            confirmButtonColor: '#2563eb',
            cancelButtonText: 'Cancelar'
        });

        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                Swal.fire('Sucesso', 'Link enviado para seu e-mail!', 'success');
            } catch (e) {
                Swal.fire('Erro', 'Não foi possível enviar o e-mail. Verifique os dados.', 'error');
            }
        }
    });
}
