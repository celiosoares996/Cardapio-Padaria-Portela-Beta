import { db, auth } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Função principal para carregar os dados do administrador
async function carregarDashboard(user) {
    try {
        console.log("Iniciando carregamento para o UID:", user.uid);

        // 1. Carregar dados do perfil (Nome, Logo, Cor)
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const dados = userSnap.data();
            
            // Atualiza os elementos de UI com segurança (verifica se existem no HTML)
            if (document.getElementById('headerNomeLoja')) {
                document.getElementById('headerNomeLoja').innerText = dados.nomeNegocio || "Meu Negócio";
            }
            
            if (document.getElementById('headerLogo')) {
                document.getElementById('headerLogo').src = dados.fotoPerfil || 'https://via.placeholder.com/150';
            }

            // Aplica a cor do tema globalmente
            if (dados.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
                localStorage.setItem('tema-cor', dados.corTema);
            }

            // Se tiver um elemento de link da loja, atualiza ele
            const linkLoja = document.getElementById('linkLoja');
            if (linkLoja) {
                linkLoja.innerText = `cardapio.html?id=${user.uid}`;
            }
        }

        // 2. Carregar produtos filtrando pelo UID do dono
        const produtosRef = collection(db, "produtos");
        
        // ESSENCIAL: Onde o userId no documento do produto é igual ao UID do logado
        const q = query(produtosRef, where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        console.log(`Sucesso! Encontrados ${querySnapshot.size} produtos.`);
        
        // Atualiza o contador de produtos na tela
        const totalProdutosElem = document.getElementById('totalProdutos');
        if (totalProdutosElem) {
            totalProdutosElem.innerText = querySnapshot.size;
        }

        // Mostra o conteúdo e esconde o carregamento se esses IDs existirem
        if (document.getElementById('loadingDash')) document.getElementById('loadingDash').classList.add('hidden');
        if (document.getElementById('conteudoDash')) document.getElementById('conteudoDash').classList.remove('hidden');

    } catch (error) {
        console.error("Erro detalhado ao carregar dashboard:", error);
        // Se der erro de permissão, o log avisará aqui
    }
}

// 3. Monitor de Autenticação (Segurança de Rota)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuário logado com sucesso
        carregarDashboard(user);
    } else {
        // Usuário deslogado, redireciona para o login
        console.warn("Usuário não autenticado. Redirecionando...");
        window.location.href = 'index.html';
    }
});

// 4. Função de Logout (vincule ao seu botão de Sair)
window.logout = async () => {
    try {
        await signOut(auth);
        localStorage.removeItem('tema-cor'); // Limpa cache de cor ao sair se desejar
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Erro ao deslogar:", error);
    }
};
