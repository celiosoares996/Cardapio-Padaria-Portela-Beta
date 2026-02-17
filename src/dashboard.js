import { db, auth } from './firebase-config.js';
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // --- 1. BUSCAR DADOS DO PERFIL (COR E NOME) ---
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                
                // Aplica a cor do dono em todo o dashboard
                const corTema = data.corTema || "#2563eb"; // Azul oficial como reserva
                document.documentElement.style.setProperty('--cor-primaria', corTema);
                
                // Atualiza os nomes na tela
                const nome = data.nomeNegocio || "Meu Negócio";
                if(document.getElementById('sideNomeNegocio')) document.getElementById('sideNomeNegocio').innerText = nome;
                if(document.getElementById('navNomeNegocio')) document.getElementById('navNomeNegocio').innerText = nome;
                if(document.getElementById('boasVindasNome')) document.getElementById('boasVindasNome').innerText = nome.split(' ')[0] + "!";
            }

            // --- 2. CONTAR PEDIDOS ---
            const qPedidos = query(collection(db, "pedidos"), where("userId", "==", user.uid));
            const snapPedidos = await getDocs(qPedidos);
            document.getElementById('totalPedidos').innerText = snapPedidos.size;

            // --- 3. CALCULAR VALOR DO ESTOQUE ---
            const qEstoque = query(collection(db, "estoque"), where("userId", "==", user.uid));
            const snapEstoque = await getDocs(qEstoque);
            let custoTotal = 0;
            snapEstoque.forEach(doc => {
                const item = doc.data();
                // Ajustado para multiplicar quantidade por preço se houver
                const qtd = Number(item.quantidade) || 0;
                const preco = Number(item.preco) || 0;
                custoTotal += (qtd > 0) ? (qtd * preco) : preco; 
            });
            document.getElementById('totalEstoque').innerText = custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            // --- 4. CONTAR PRODUTOS (AJUSTADO) ---
            const qProdutos = query(collection(db, "produtos"), where("userId", "==", user.uid));
            const snapProdutos = await getDocs(qProdutos);
            if(document.getElementById('totalProdutos')) {
                document.getElementById('totalProdutos').innerText = snapProdutos.size;
            }

        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
        }
    } else {
        window.location.href = "index.html";
    }
});

// Lógica de Sair
const sair = () => confirm("Deseja realmente sair?") && signOut(auth).then(() => window.location.href="index.html");
document.getElementById('btnSairDesktop')?.addEventListener('click', sair);