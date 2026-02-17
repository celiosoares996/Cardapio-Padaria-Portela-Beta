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

// --- 1. CARREGAMENTO DOS DADOS ---
async function carregarDashboard(user) {
    try {
        // A. Dados do Perfil e Branding
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const dados = userSnap.data();
            
            // Atualiza Nomes (Sidebar, Nav e Boas-vindas)
            const elementosNome = ['sideNomeNegocio', 'navNomeNegocio', 'boasVindasNome'];
            elementosNome.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = dados.nomeNegocio || "Meu Negócio";
            });

            // Aplica Cor do Tema Global
            if (dados.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
                localStorage.setItem('tema-cor', dados.corTema);
            }
        }

        // B. Carregar Produtos e Calcular Resumos
        const produtosRef = collection(db, "produtos");
        const qProdutos = query(produtosRef, where("userId", "==", user.uid));
        const snapProdutos = await getDocs(qProdutos);
        
        // C. Carregar Pedidos do Dia (Simulação ou Real)
        const pedidosRef = collection(db, "pedidos");
        const qPedidos = query(pedidosRef, where("userId", "==", user.uid));
        const snapPedidos = await getDocs(qPedidos);

        // --- 2. CÁLCULOS DOS CARDS ---
        let valorTotalEstoque = 0;
        let produtosAtivos = snapProdutos.size;

        snapProdutos.forEach(doc => {
            const p = doc.data();
            // Calcula: preço * quantidade (se houver esses campos no seu banco)
            const preco = parseFloat(p.preco || 0);
            const qtd = parseInt(p.estoque || 0);
            valorTotalEstoque += (preco * qtd);
        });

        // --- 3. ATUALIZAÇÃO DA UI ---
        const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        if (document.getElementById('totalProdutos')) 
            document.getElementById('totalProdutos').innerText = produtosAtivos;

        if (document.getElementById('totalEstoque')) 
            document.getElementById('totalEstoque').innerText = formatador.format(valorTotalEstoque);

        if (document.getElementById('totalPedidos')) 
            document.getElementById('totalPedidos').innerText = snapPedidos.size;

    } catch (error) {
        console.error("Erro no Dashboard:", error);
    }
}

// --- 4. MONITOR DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarDashboard(user);
    } else {
        window.location.href = 'index.html';
    }
});

// --- 5. LOGOUT ---
const logoutAction = async () => {
    const confirmacao = await Swal.fire({
        title: 'Sair do Sistema?',
        text: "Você precisará logar novamente para acessar os dados.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, sair',
        cancelButtonText: 'Cancelar'
    });

    if (confirmacao.isConfirmed) {
        try {
            await signOut(auth);
            localStorage.clear(); // Limpa tudo ao sair por segurança
            window.location.href = 'index.html';
        } catch (error) {
            console.error("Erro ao sair:", error);
        }
    }
};

// Vincula o logout aos botões
const btnSair = document.getElementById('btnSairDesktop');
if (btnSair) btnSair.addEventListener('click', logoutAction);

// Expõe para uso global se necessário
window.logout = logoutAction;
