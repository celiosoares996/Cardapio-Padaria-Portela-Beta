import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const loginForm = document.getElementById('loginForm');
const btnEntrar = document.getElementById('btnEntrar');
const linkEsqueciSenha = document.getElementById('esqueciSenha');

// --- 1. LÓGICA DE LOGIN ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;

        // Estado Visual: Carregando
        btnEntrar.disabled = true;
        const originalContent = btnEntrar.innerHTML;
        btnEntrar.innerHTML = `
            <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span class="ml-2">AUTENTICANDO...</span>
        `;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                const d = userDoc.data();
                
                // Salva branding para carregamento instantâneo
                if (d.corTema) localStorage.setItem('tema-cor', d.corTema);
                if (d.fotoPerfil) localStorage.setItem('estab-logo', d.fotoPerfil);
                if (d.nomeNegocio) localStorage.setItem('estab-nome', d.nomeNegocio);
                
                Swal.fire({
                    icon: 'success',
                    title: 'Acesso Autorizado',
                    text: `Bem-vindo ao Digitaliza Menu, ${d.nomeNegocio || 'Administrador'}!`,
                    timer: 1800,
                    showConfirmButton: false,
                    timerProgressBar: true
                }).then(() => {
                    window.location.href = `dashboard.html?id=${user.uid}`;
                });

            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'Dados não encontrados',
                    text: 'Sua conta existe, mas os dados da loja ainda não foram configurados.',
                    confirmButtonColor: '#2563eb'
                });
                resetBotao(originalContent);
            }
        } catch (error) {
            console.error("Erro:", error.code);
            let mensagem = "E-mail ou senha inválidos.";
            
            if (error.code === 'auth/too-many-requests') mensagem = "Muitas tentativas falhas. Aguarde um momento.";
            if (error.code === 'auth/user-not-found') mensagem = "E-mail não cadastrado.";

            Swal.fire({
                icon: 'error',
                title: 'Falha no Acesso',
                text: mensagem,
                confirmButtonColor: '#ef4444'
            });
            resetBotao(originalContent);
        }
    });
}

// --- 2. LÓGICA DE RECUPERAÇÃO DE SENHA ---
if (linkEsqueciSenha) {
    linkEsqueciSenha.addEventListener('click', async (e) => {
        e.preventDefault();

        const { value: email } = await Swal.fire({
            title: 'Recuperar Senha',
            text: 'Enviaremos um link de redefinição para o seu e-mail.',
            input: 'email',
            inputPlaceholder: 'Digite seu e-mail de acesso',
            showCancelButton: true,
            confirmButtonText: 'Enviar Link',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: localStorage.getItem('tema-cor') || '#2563eb',
            inputAttributes: { autocapitalize: 'off' },
            preConfirm: (value) => {
                if (!value) return Swal.showValidationMessage('Por favor, digite o e-mail');
            }
        });

        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                Swal.fire({
                    icon: 'success',
                    title: 'E-mail Enviado!',
                    text: 'Verifique sua caixa de entrada (e spam) para redefinir sua senha.',
                    confirmButtonColor: '#2563eb'
                });
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Erro ao enviar',
                    text: 'Não encontramos esse e-mail ou houve uma falha na conexão.',
                    confirmButtonColor: '#ef4444'
                });
            }
        }
    });
}

function resetBotao(conteudoOriginal) {
    btnEntrar.disabled = false;
    btnEntrar.innerHTML = conteudoOriginal;
}
