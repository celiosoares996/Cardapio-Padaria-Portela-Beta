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

const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// --- 1. CARREGAMENTO DOS DADOS ---
async function carregarDashboard(user) {
    try {
        // A. Dados do Perfil e Branding
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const dados = userSnap.data();
            const elementosNome = ['sideNomeNegocio', 'navNomeNegocio', 'boasVindasNome'];
            elementosNome.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = dados.nomeNegocio || "Meu Negócio";
            });

            if (dados.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
                localStorage.setItem('tema-cor', dados.corTema);
            }
        }

        // B. Buscar Coleções
        const produtosRef = collection(db, "produtos");
        const pedidosRef = collection(db, "pedidos");

        const [snapProdutos, snapPedidos] = await Promise.all([
            getDocs(query(produtosRef, where("userId", "==", user.uid))),
            getDocs(query(pedidosRef, where("userId", "==", user.uid)))
        ]);

        // C. Processamento de Dados
        let faturamentoTotal = 0;
        let alertasEstoque = [];
        let contagemVendas = {}; // Para o Top 3

        // Processar Pedidos
        snapPedidos.forEach(doc => {
            const pedido = doc.data();
            faturamentoTotal += parseFloat(pedido.total || 0);
            
            // Contar itens vendidos (se houver array de itens no pedido)
            if (pedido.itens) {
                pedido.itens.forEach(item => {
                    contagemVendas[item.nome] = (contagemVendas[item.nome] || 0) + (item.qtd || 1);
                });
            }
        });

        // Processar Produtos (Estoque Baixo)
        snapProdutos.forEach(doc => {
            const p = doc.data();
            const qtd = parseInt(p.estoque || 0);
            if (qtd <= 5) {
                alertasEstoque.push({ nome: p.nome, qtd: qtd });
            }
        });

        // --- 2. ATUALIZAÇÃO DA UI ---

        // Atualizar Cards Principais
        document.getElementById('faturamentoMes').innerText = formatador.format(faturamentoTotal);
        document.getElementById('totalAlertasEstoque').innerText = alertasEstoque.length;
        document.getElementById('totalClientes').innerText = snapPedidos.size; // Simulação: cada pedido um cliente ou use col. clientes

        // Atualizar Sininho e Alertas
        const badgeMobile = document.getElementById('badgeNotificacao');
        const badgeDesk = document.getElementById('badgeNotificacaoDesktop');
        const containerAlertas = document.getElementById('containerAlertas');

        if (alertasEstoque.length > 0) {
            badgeMobile.classList.remove('hidden');
            badgeMobile.innerText = alertasEstoque.length;
            if(badgeDesk) {
                badgeDesk.classList.remove('hidden');
            }

            containerAlertas.innerHTML = alertasEstoque.map(alerta => `
                <div class="flex items-center gap-3 p-2 bg-orange-50 rounded-xl border border-orange-100">
                    <span class="text-lg">⚠️</span>
                    <div>
                        <p class="text-[11px] font-bold text-slate-700 uppercase">${alerta.nome}</p>
                        <p class="text-[10px] text-orange-600">Estoque crítico: ${alerta.qtd} un.</p>
                    </div>
                </div>
            `).join('');
            
            document.getElementById('statusEstoqueGeral').innerText = "Itens Precisam de Reposição";
            document.getElementById('statusEstoqueGeral').classList.replace('text-slate-400', 'text-orange-500');
        }

        // Atualizar Top 3 Produtos
        const containerTop = document.getElementById('containerTopProdutos');
        const topProdutos = Object.entries(contagemVendas)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (topProdutos.length > 0) {
            containerTop.innerHTML = topProdutos.map(([nome, qtd], index) => `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <span class="text-xs font-black text-slate-600">${index + 1}º</span>
                        <span class="text-sm font-bold text-slate-300">${nome}</span>
                    </div>
                    <span class="text-[10px] bg-slate-800 px-2 py-1 rounded-lg text-slate-400">${qtd} vendas</span>
                </div>
            `).join('');
        }

        // Insight Inteligente
        const insight = document.getElementById('insightTexto');
        if (alertasEstoque.length > 0) {
            insight.innerHTML = `⚠️ Você tem <b>${alertasEstoque.length} produtos</b> acabando. Reponha o estoque para não perder vendas!`;
        } else if (faturamentoTotal > 0) {
            insight.innerHTML = `🚀 Seu faturamento está crescendo! Que tal cadastrar um novo produto hoje?`;
        } else {
            insight.innerHTML = `💡 Dica: Cadastre seus primeiros produtos e registre uma venda para ver a mágica acontecer.`;
        }

    } catch (error) {
        console.error("Erro no Dashboard:", error);
    }
}

// --- 3. MONITOR DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarDashboard(user);
    } else {
        window.location.href = 'index.html';
    }
});

// --- 4. LOGOUT ---
const logoutAction = async () => {
    const confirmacao = await Swal.fire({
        title: 'Sair do Sistema?',
        text: "Sua sessão será encerrada com segurança.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sair agora',
        cancelButtonText: 'Ficar'
    });

    if (confirmacao.isConfirmed) {
        await signOut(auth);
        localStorage.clear();
        window.location.href = 'index.html';
    }
};

const btnSair = document.getElementById('btnSairDesktop');
if (btnSair) btnSair.addEventListener('click', logoutAction);
