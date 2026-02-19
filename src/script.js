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

// 🛡️ Configuração do Provedor Google
const googleProvider = new GoogleAuthProvider();

/**
 * --- FUNÇÃO CENTRAL DE VERIFICAÇÃO E BRANDING ---
 * Responsável por validar o perfil do lojista e salvar preferências locais
 */
async function verificarECriarPerfil(user) {
    const userRef = doc(db, "usuarios", user.uid);
    let dadosLoja;

    try {
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // ✨ Cria perfil inicial com estrutura preparada para Horários
            dadosLoja = {
                nomeNegocio: user.displayName || "Minha Nova Loja",
                corTema: "#f59e0b", // Cor padrão (Amber/Laranja) compatível com seu HTML
                fotoPerfil: user.photoURL || "",
                email: user.email,
                uid: user.uid,
                status: "ativo",
                createdAt: new Date().toISOString(),
                // Inicializa objeto de horários vazio para evitar erros no cardápio
                horarios: {} 
            };
            await setDoc(userRef, dadosLoja);
        } else {
            dadosLoja = userSnap.data();
        }

        // 💾 --- ATUALIZA BRANDING NO STORAGE LOCAL ---
        // Essencial para o carregamento imediato do Dashboard sem "piscar" cores erradas
        localStorage.setItem('tema-cor', dadosLoja.corTema || "#f59e0b");
        localStorage.setItem('estab-nome', dadosLoja.nomeNegocio || "Minha Loja");
        localStorage.setItem('estab-logo', dadosLoja.fotoPerfil || "");

        // 🚀 Redireciona para o Dashboard (perfil.html)
        window.location.href = `perfil.html`; 

    } catch (error) {
        console.error("❌ Erro ao processar perfil:", error);
        Swal.fire({
            icon: 'error',
            title: 'Erro de Sistema',
            text: 'Falha ao sincronizar seus dados. Tente novamente.',
            confirmButtonColor: '#f59e0b'
        });
    }
}

/**
 * --- 1. LÓGICA DE LOGIN (E-MAIL/SENHA) ---
 */
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;

        // ⏳ Feedback visual de carregamento
        btnEntrar.disabled = true;
        const originalContent = btnEntrar.innerHTML;
        btnEntrar.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            await verificarECriarPerfil(userCredential.user);
        } catch (error) {
            console.error("⚠️ Erro Login:", error.code);
            
            let msg = "E-mail ou senha incorretos.";
            if (error.code === 'auth/invalid-credential') {
                msg = "As credenciais informadas são inválidas.";
            } else if (error.code === 'auth/too-many-requests') {
                msg = "Muitas tentativas falhas. Sua conta foi bloqueada temporariamente.";
            }
            
            Swal.fire({ 
                icon: 'error', 
                title: 'Acesso Negado', 
                text: msg, 
                confirmButtonColor: '#ef4444' 
            });

            btnEntrar.disabled = false;
            btnEntrar.innerHTML = originalContent;
        }
    });
}

/**
 * --- 2. LÓGICA DE LOGIN (GOOGLE) ---
 */
if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            await verificarECriarPerfil(result.user);
        } catch (error) {
            console.error("⚠️ Erro Google:", error);
            if(error.code !== 'auth/popup-closed-by-user') {
                Swal.fire({ 
                    icon: 'error', 
                    title: 'Falha na Conexão', 
                    text: 'Não conseguimos autenticar com o Google no momento.' 
                });
            }
        }
    });
}

/**
 * --- 3. RECUPERAÇÃO DE SENHA ---
 */
if (linkEsqueciSenha) {
    linkEsqueciSenha.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const emailJaDigitado = document.getElementById('email').value.trim();

        const { value: email } = await Swal.fire({
            title: 'Recuperar Acesso',
            text: 'Enviaremos um link para o seu e-mail cadastrado.',
            input: 'email',
            inputValue: emailJaDigitado,
            inputPlaceholder: 'Digite seu e-mail',
            showCancelButton: true,
            confirmButtonText: 'Enviar Link',
            confirmButtonColor: '#f59e0b',
            cancelButtonText: 'Cancelar'
        });

        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                Swal.fire('E-mail Enviado', 'Verifique sua caixa de entrada e spam para redefinir a senha.', 'success');
            } catch (error) {
                console.error("⚠️ Erro Reset:", error.code);
                Swal.fire('Erro', 'Este e-mail não foi encontrado em nosso sistema.', 'error');
            }
        }
    });
}
