import { fazerLogin } from './auth.js';

// Captura os elementos do formulário de login
const loginForm = document.getElementById('loginForm');
const btnEntrar = document.getElementById('btnEntrar');
const emailInput = document.getElementById('email');
const senhaInput = document.getElementById('senha');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Impede o navegador de recarregar a página

        // Captura os valores e remove espaços em branco extras
        const email = emailInput.value.trim();
        const senha = senhaInput.value.trim();

        if (email && senha) {
            // Efeito visual de carregamento no botão
            btnEntrar.disabled = true;
            btnEntrar.innerHTML = `
                <svg class="animate-spin h-5 w-5 mr-3 border-t-2 border-white rounded-full inline-block" viewBox="0 0 24 24"></svg>
                AUTENTICANDO...
            `;
            btnEntrar.classList.add('opacity-80', 'cursor-not-allowed');

            try {
                // Chama a função que criamos no auth.js
                await fazerLogin(email, senha);
            } catch (error) {
                // Caso ocorra erro, resetamos o botão para ela tentar de novo
                btnEntrar.disabled = false;
                btnEntrar.innerText = "ENTRAR NO SISTEMA";
                btnEntrar.classList.remove('opacity-80', 'cursor-not-allowed');
            }
        } else {
            alert("Por favor, preencha o e-mail e a senha.");
        }
    });
}

// Lógica de Identidade Visual no Login (Opcional)
// Se houver uma cor de tema salva no navegador (LocalStorage), aplicamos na tela de login
const corSalva = localStorage.getItem('tema-cor');
if (corSalva) {
    document.documentElement.style.setProperty('--cor-primaria', corSalva);
}