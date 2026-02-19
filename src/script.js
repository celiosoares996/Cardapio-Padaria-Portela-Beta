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

// --- FUNÇÃO CENTRAL DE VERIFICAÇÃO E BRANDING ---
async function verificarECriarPerfil(user) {
    const userRef = doc(db, "usuarios", user.uid);
    let dadosLoja;

    try {
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // Cria perfil inicial se for o primeiro acesso
            dadosLoja = {
                nomeNegocio: user.displayName || "Minha Nova Loja",
                corTema: "#2563eb",
                fotoPerfil: user.photoURL || "",
                email: user.email,
                uid: user.uid,
                status: "ativo",
                createdAt: new Date().toISOString()
            };
            await setDoc(userRef, dadosLoja);
        } else {
            dadosLoja = userSnap.data();
        }

        // --- ATUALIZA BRANDING LOCAL ---
        // Isso garante que a logo e a cor apareçam instantaneamente no Dashboard
        localStorage.setItem('tema-cor', dadosLoja.corTema || "#2563eb");
        localStorage.setItem('estab-nome', dadosLoja.nomeNegocio || "Minha Loja");
        localStorage.setItem('estab-logo', dadosLoja.fotoPerfil || "");

        // Redireciona para o Dashboard ou Perfil
        window.location.href = `perfil.html`; 

    } catch (error) {
        console.error("Erro ao processar perfil:", error);
        Swal.fire('Erro', 'Falha ao carregar dados da conta.', 'error');
    }
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
            
            // Tratamento de erros amigável
            let msg = "E-mail ou senha incorretos.";
            if (error.code === 'auth/invalid-credential') {
                msg = "Credenciais inválidas ou e-mail não cadastrado.";
            } else if (error.code === 'auth/too-many-requests') {
                msg = "Muitas tentativas falhas. Tente novamente em instantes.";
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
        
        // Pega o e-mail que já está digitado no input, se houver
        const emailJaDigitado = document.getElementById('email').value.trim();

        const { value: email } = await Swal.fire({
            title: 'Recuperar Senha',
            input: 'email',
            inputValue: emailJaDigitado,
            inputPlaceholder: 'Seu e-mail de acesso',
            showCancelButton: true,
            confirmButtonText: 'Enviar Link',
            confirmButtonColor: '#2563eb',
            cancelButtonText: 'Cancelar'
        });

        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                Swal.fire('Sucesso', 'Link de redefinição enviado! Verifique sua caixa de entrada.', 'success');
            } catch (error) {
                console.error("Erro Reset:", error.code);
                Swal.fire('Erro', 'Não foi possível enviar o e-mail. Verifique se o endereço está correto.', 'error');
            }
        }
    });
}
