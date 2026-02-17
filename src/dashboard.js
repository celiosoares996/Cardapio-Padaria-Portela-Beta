import { db, auth } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Função para carregar os dados
async function carregarDashboard(user) {
    try {
        // 1. Carregar dados do perfil (Nome, Logo, Cor)
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const dados = userSnap.data();
            document.getElementById('headerNomeLoja').innerText = dados.nomeNegocio || "Meu Negócio";
            document.getElementById('headerLogo').src = dados.fotoPerfil || 'default-logo.png';
            // Aplica a cor do tema
            if(dados.corTema) document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
        }

        // 2. Carregar produtos filtrando pelo UID do dono
        const produtosRef = collection(db, "produtos");
        // IMPORTANTE: Seus produtos precisam ter o campo 'userId' salvo neles!
        const q = query(produtosRef, where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        console.log(`Sucesso! Encontrados ${querySnapshot.size} produtos.`);
        
        // Atualiza o contador no HTML
        const totalProdutosElem = document.getElementById('totalProdutos');
        if(totalProdutosElem) totalProdutosElem.innerText = querySnapshot.size;

    } catch (error) {
        console.error("Erro detalhado ao carregar dashboard:", error);
    }
}

// 3. SEGURANÇA: Só carrega os dados se o Firebase confirmar que o usuário está logado
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarDashboard(user);
    } else {
        // Se não houver usuário logado, expulsa para o login
        window.location.href = 'index.html';
    }
});
