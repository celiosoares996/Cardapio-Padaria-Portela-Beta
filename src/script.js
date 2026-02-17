import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const loginForm = document.getElementById('loginForm');
const btnEntrar = document.getElementById('btnEntrar');

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
            <span>AUTENTICANDO...</span>
        `;

        try {
            // 1. Autenticação no Firebase
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            // 2. Busca dados de branding no Firestore
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                const d = userDoc.data();
                
                // Salva preferências para o "Branding Instantâneo"
                if (d.corTema) localStorage.setItem('tema-cor', d.corTema);
                if (d.fotoPerfil) localStorage.setItem('estab-logo', d.fotoPerfil);
                if (d.nomeNegocio) localStorage.setItem('estab-nome', d.nomeNegocio);
                
                // Modal de Sucesso com SweetAlert2
                Swal.fire({
                    icon: 'success',
                    title: 'Acesso Autorizado',
                    text: `Bem-vindo, ${d.nomeNegocio || 'Administrador'}!`,
                    timer: 1500,
                    showConfirmButton: false,
                    timerProgressBar: true,
                    didOpen: () => {
                        const b = Swal.getHtmlContainer().querySelector('b');
                        if (b) b.style.color = d.corTema || '#f59e0b';
                    }
                }).then(() => {
                    window.location.href = `dashboard.html?id=${user.uid}`;
                });

            } else {
                // Caso o usuário exista no Auth mas não no Firestore
                Swal.fire({
                    icon: 'warning',
                    title: 'Perfil incompleto',
                    text: 'Sua conta foi autenticada, mas não encontramos os dados da sua loja.',
                    confirmButtonColor: localStorage.getItem('tema-cor') || '#f59e0b'
                });
                resetBotao(originalContent);
            }
        } catch (error) {
            console.error("Erro de Login:", error.code);
            
            let mensagem = "Verifique suas credenciais e tente novamente.";
            
            // Tratamento amigável de erros comuns
            if (error.code === 'auth/invalid-credential') {
                mensagem = "E-mail ou senha incorretos.";
            } else if (error.code === 'auth/user-not-found') {
                mensagem = "Este e-mail não está cadastrado no sistema.";
            } else if (error.code === 'auth/wrong-password') {
                mensagem = "Senha incorreta.";
            } else if (error.code === 'auth/too-many-requests') {
                mensagem = "Muitas tentativas falhas. Tente novamente em instantes.";
            }

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

function resetBotao(conteudoOriginal) {
    btnEntrar.disabled = false;
    btnEntrar.innerHTML = conteudoOriginal;
}
