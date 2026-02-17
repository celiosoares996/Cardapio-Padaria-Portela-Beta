import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const loginForm = document.getElementById('loginForm');
const btnEntrar = document.getElementById('btnEntrar');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;

        // Visual State: Loading
        btnEntrar.disabled = true;
        btnEntrar.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Autenticando...`;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            // Busca os dados personalizados da loja
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                const d = userDoc.data();
                
                // SALVA O BRANDING PARA O PRÓXIMO ACESSO
                if (d.corTema) localStorage.setItem('tema-cor', d.corTema);
                if (d.fotoPerfil) localStorage.setItem('estab-logo', d.fotoPerfil);
                if (d.nomeNegocio) localStorage.setItem('estab-nome', d.nomeNegocio);
                
                // Redireciona para o dashboard
                window.location.href = `dashboard.html?id=${user.uid}`;
            } else {
                alert("Usuário logado, mas dados da loja não encontrados.");
                resetBotao();
            }
        } catch (error) {
            console.error(error);
            alert("Acesso negado. Verifique suas credenciais.");
            resetBotao();
        }
    });
}

function resetBotao() {
    btnEntrar.disabled = false;
    btnEntrar.innerHTML = `<span>ACESSAR SISTEMA</span><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;
}
